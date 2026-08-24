<?php

declare(strict_types=1);

namespace Modules\Pos\Events;

use App\Support\Events\DomainEvent;
use Illuminate\Database\Eloquent\Model;
use Modules\Pos\Models\PosApproval;

/**
 * Somebody answered.
 *
 * The return leg. A tablet that raised a request is holding a guest at a table
 * and needs the answer without a cashier tapping refresh; a refusal matters as
 * much as an approval, because "the manager said no" is what the waiter has to
 * tell the guest, and silence is what they tell them instead when nothing
 * arrives.
 *
 * Published for rejections too, deliberately. An approval flow that only
 * announces its yeses trains everyone to treat no answer as a no, and then a
 * lost notification is indistinguishable from a refusal.
 */
final class ApprovalDecided extends DomainEvent
{
    public function __construct(private readonly PosApproval $approval) {}

    public function name(): string
    {
        return 'pos.approval_decided';
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return [
            'approval_id' => $this->approval->getKey(),
            'action' => $this->approval->action,
            'subject_type' => $this->approval->subject_type,
            'subject_id' => $this->approval->subject_id,
            'amount' => $this->approval->amount,
            'status' => $this->approval->status,
            'terminal_id' => $this->approval->terminal_id,
            'requested_by_user_id' => $this->approval->requested_by_user_id,
            'approved_by_user_id' => $this->approval->approved_by_user_id,
            // `pin` or `remote` — whether the person who agreed was standing at
            // the till. Kept on the event and not only in the table because a
            // loss-prevention subscriber counting remote approvals at 3am should
            // not have to join back to find out.
            'method' => $this->approval->method,
            'decided_at' => $this->approval->decided_at?->toIso8601String(),
        ];
    }

    public function aggregate(): Model
    {
        return $this->approval;
    }

    public function tenantId(): ?int
    {
        return $this->approval->tenant_id;
    }
}
