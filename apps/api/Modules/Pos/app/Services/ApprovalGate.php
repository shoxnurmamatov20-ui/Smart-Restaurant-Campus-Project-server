<?php

declare(strict_types=1);

namespace Modules\Pos\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Modules\Pos\Models\PosApproval;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Models\TerminalSession;
use RuntimeException;

/**
 * When a manager has to say yes.
 *
 * The rule this class encodes is not "cashiers cannot void lines" — they can,
 * and they must, because a guest changes their mind twenty times a service. The
 * rule is that the person who *asks* is never the person who *agrees*, above
 * whatever each role is trusted with unsupervised.
 *
 * Limits live on the terminal rather than on the role globally, because the
 * honest answer differs between a hotel bar and a takeaway counter. A role with
 * no entry is trusted with nothing, which is the safe direction to be wrong in.
 */
final class ApprovalGate
{
    /**
     * Actions that always need somebody else's signature, whatever the amount.
     *
     * @var array<int, string>
     */
    private const ALWAYS_APPROVED = ['reopen_bill', 'comp', 'refund'];

    /**
     * Does this person need an authorisation for this act?
     *
     * @param int $amount Tiyin at stake — a 2% discount on a coffee is not a
     *                    2% discount on a wedding.
     */
    public function requires(Terminal $terminal, User $actor, string $action, int $amount = 0, int $subtotal = 0): bool
    {
        // Holding the approving permission means you are the manager: you do not
        // queue behind yourself.
        if ($actor->can('pos.approve')) {
            return false;
        }

        if (in_array($action, self::ALWAYS_APPROVED, true)) {
            return true;
        }

        $limitPercent = $this->limitFor($terminal, $actor);

        if ($limitPercent <= 0) {
            return true;
        }

        if ($subtotal <= 0) {
            // Nothing to measure against — err towards asking.
            return true;
        }

        $percent = (int) floor($amount * 100 / $subtotal);

        return $percent > $limitPercent;
    }

    /** The largest share of a bill this person may take off unsupervised. */
    public function limitFor(Terminal $terminal, User $actor): int
    {
        $best = 0;

        foreach ($actor->getRoleNames() as $role) {
            $best = max($best, $terminal->discountLimitFor((string) $role));
        }

        return $best;
    }

    /**
     * Raise a request and put it in the manager's queue.
     */
    public function request(
        TerminalSession $session,
        string $action,
        string $reason,
        ?string $subjectType = null,
        ?int $subjectId = null,
        int $amount = 0,
    ): PosApproval {
        if (! in_array($action, PosApproval::ACTIONS, true)) {
            throw new RuntimeException("Noma'lum tasdiq turi: {$action}");
        }

        return PosApproval::create([
            'terminal_id' => $session->terminal_id,
            'session_id' => $session->getKey(),
            'action' => $action,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'amount' => $amount > 0 ? $amount : null,
            'reason' => $reason,
            'requested_by_user_id' => $session->user_id,
            'status' => 'pending',
            'requested_at' => now(),
            'expires_at' => now()->addMinutes((int) config('pos.approvals.ttl_minutes', 5)),
        ]);
    }

    /**
     * Spend an authorisation, or explain why it cannot be spent.
     *
     * Marking it used is part of the same transaction as the check, so two
     * concurrent requests cannot both redeem one signature.
     *
     * @throws RuntimeException
     */
    public function consume(int $approvalId, string $action, ?string $subjectType, ?int $subjectId): PosApproval
    {
        return DB::transaction(function () use ($approvalId, $action, $subjectType, $subjectId): PosApproval {
            /** @var PosApproval|null $approval */
            $approval = PosApproval::query()->lockForUpdate()->find($approvalId);

            if ($approval === null) {
                throw new RuntimeException('Tasdiq topilmadi.');
            }

            if ($approval->status === 'used') {
                throw new RuntimeException('Bu tasdiq allaqachon ishlatilgan.');
            }

            if ($approval->status !== 'approved') {
                throw new RuntimeException('Tasdiq hali berilmagan.');
            }

            if ($approval->expires_at !== null && $approval->expires_at->isPast()) {
                $approval->update(['status' => 'expired']);

                throw new RuntimeException('Tasdiq muddati o\'tgan — qaytadan so\'rang.');
            }

            if ($approval->action !== $action) {
                throw new RuntimeException('Bu tasdiq boshqa amal uchun berilgan.');
            }

            // Bound to its subject: a signature for one line must not be spent
            // on a different one.
            if ($subjectId !== null && ($approval->subject_id !== $subjectId || $approval->subject_type !== $subjectType)) {
                throw new RuntimeException('Bu tasdiq boshqa hisob yoki qator uchun berilgan.');
            }

            $approval->markUsed();

            return $approval->refresh();
        });
    }
}
