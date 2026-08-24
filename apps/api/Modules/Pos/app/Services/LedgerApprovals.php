<?php

declare(strict_types=1);

namespace Modules\Pos\Services;

use App\Contracts\Pos\Approvals;
use App\Contracts\Pos\PendingApproval;
use App\Models\User;
use App\Support\Events\EventBus;
use Modules\Pos\Events\ApprovalDecided;
use Modules\Pos\Models\PosApproval;
use RuntimeException;

/**
 * `App\Contracts\Pos\Approvals`, answered from `pos.approvals`.
 *
 * A thin translation on top of {@see ApprovalGate} and the model, and thin on
 * purpose: the rules — who needs a signature, what a signature is bound to, when
 * it expires — belong to the gate and are shared with the till's own screens.
 * Two copies of "does this need a manager" is the one thing that must not
 * happen, because the copies would disagree exactly when it mattered.
 *
 * What this class adds is the boundary: ids and tiyin in, `PendingApproval` out,
 * no Eloquent model and no Terminal anywhere in the signature.
 */
final class LedgerApprovals implements Approvals
{
    public function __construct(
        private readonly ApprovalGate $gate,
        private readonly EventBus $events,
    ) {}

    public function requiredFor(int $userId, string $action, int $amountTiyin = 0, int $subtotalTiyin = 0): bool
    {
        $actor = User::query()->find($userId);

        if ($actor === null) {
            // An unknown asker is not a trusted one. This is unreachable through
            // any route — the id comes off an authenticated token — and it is
            // here so that a future caller passing a stale id gets a signature
            // requirement rather than a free pass.
            return true;
        }

        /*
         * No terminal, deliberately.
         *
         * The caller is a console or a handset, and the discount ladder lives on
         * a till. `ApprovalGate::limitFor()` answers zero for a person standing
         * at none, so anybody without `pos.approve` is sent to ask — see the
         * contract for why that is the right direction.
         */
        return $this->gate->requires(null, $actor, $action, $amountTiyin, $subtotalTiyin);
    }

    public function ask(
        int $requestedByUserId,
        string $action,
        string $reason,
        ?string $subjectType = null,
        ?int $subjectId = null,
        int $amountTiyin = 0,
        ?int $branchId = null,
    ): PendingApproval {
        $approval = $this->gate->raise(
            requestedByUserId: $requestedByUserId,
            action: $action,
            reason: $reason,
            subjectType: $subjectType,
            subjectId: $subjectId,
            amount: $amountTiyin,
        );

        /*
         * The branch, when the caller named one and `BelongsToBranch` did not.
         *
         * The trait stamps it from `X-Branch`, which a handset sends and a
         * background job does not. Written after the fact rather than threaded
         * through the gate, because the gate's own callers all have a terminal
         * that already answers this.
         */
        if ($branchId !== null && $approval->branch_id === null) {
            $approval->forceFill(['branch_id' => $branchId])->save();
        }

        return self::pending($approval->load('requestedBy'));
    }

    /**
     * @return array<int, PendingApproval>
     */
    public function waiting(?int $branchId = null, int $limit = 50): array
    {
        return PosApproval::query()
            ->with('requestedBy')
            ->pending()
            /*
             * Narrowed only when a branch was named. `BelongsToBranch` already
             * applies `X-Branch` on top; this is the caller saying which venue
             * it means regardless of the header, which is what a handset pinned
             * to one building does.
             */
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->orderBy('requested_at')
            ->limit(max(1, min($limit, 200)))
            ->get()
            ->map(static fn (PosApproval $approval): PendingApproval => self::pending($approval))
            ->all();
    }

    public function spend(
        int $approvalId,
        string $action,
        ?string $subjectType = null,
        ?int $subjectId = null,
        int $amountTiyin = 0,
    ): void {
        // Straight through to the gate: every rule about what a signature covers
        // is there, shared with the till's own screens, and a second copy of it
        // would disagree exactly when it mattered.
        $this->gate->consume($approvalId, $action, $subjectType, $subjectId, $amountTiyin);
    }

    public function decide(int $approvalId, int $byUserId, bool $granted): PendingApproval
    {
        $approval = PosApproval::query()->find($approvalId);

        if ($approval === null) {
            throw new RuntimeException('Tasdiq topilmadi.');
        }

        $manager = User::query()->find($byUserId);

        if ($manager === null) {
            throw new RuntimeException('Tasdiqlovchi topilmadi.');
        }

        // The rule the whole table exists for. Without this line it is
        // decoration — see ApprovalController, which enforces the same thing on
        // its own two doors.
        if ((int) $approval->requested_by_user_id === $byUserId) {
            throw new RuntimeException('O\'z so\'rovingizni o\'zingiz tasdiqlay olmaysiz.');
        }

        // `remote`, because that is what it is: answered away from the till, on
        // a credential of the manager's own. The till's PIN door writes `pin`.
        if (! $approval->decide($manager, $granted, 'remote')) {
            throw new RuntimeException('Bu so\'rov allaqachon hal qilingan yoki muddati o\'tgan.');
        }

        /*
         * Announced exactly as the till's own door announces it — refusals
         * included. The tablet or handset that raised this is standing in front
         * of a guest and cannot tell "the manager said no" from "nothing has
         * arrived yet", and those are opposite instructions.
         */
        $this->events->publish(new ApprovalDecided($approval->refresh()));

        return self::pending($approval->load(['requestedBy', 'approvedBy']));
    }

    private static function pending(PosApproval $approval): PendingApproval
    {
        return new PendingApproval(
            id: (int) $approval->getKey(),
            action: (string) $approval->action,
            subjectType: $approval->subject_type,
            subjectId: $approval->subject_id === null ? null : (int) $approval->subject_id,
            amountTiyin: (int) ($approval->amount ?? 0),
            reason: (string) $approval->reason,
            requestedByUserId: (int) $approval->requested_by_user_id,
            requestedByName: $approval->relationLoaded('requestedBy') ? $approval->requestedBy->name : null,
            status: (string) $approval->status,
            requestedAt: $approval->requested_at,
            expiresAt: $approval->expires_at,
            branchId: $approval->branch_id === null ? null : (int) $approval->branch_id,
            terminalId: $approval->terminal_id === null ? null : (int) $approval->terminal_id,
        );
    }
}
