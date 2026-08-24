<?php

declare(strict_types=1);

namespace Modules\Pos\Events;

use App\Support\Events\DomainEvent;
use Illuminate\Database\Eloquent\Model;
use Modules\Pos\Models\PosApproval;

/**
 * A till is waiting on somebody.
 *
 * This is the half of P9 that makes the other half usable. Taking the approval
 * queue out from behind the terminal session lets a manager answer from the car
 * park — but only if they find out there is something to answer. Polling from a
 * phone is not that: it is a screen somebody has to remember to open, and a
 * waiter standing at a table with a guest waiting cannot rely on it.
 *
 * So the request goes on the bus, and whatever wants to reach a manager
 * subscribes: the Telegram bot today, a push or a Reverb channel later. Nothing
 * in this module knows which, and that is the point — the till's job ends at
 * saying a decision is needed.
 */
final class ApprovalRequested extends DomainEvent
{
    public function __construct(private readonly PosApproval $approval) {}

    public function name(): string
    {
        return 'pos.approval_requested';
    }

    /**
     * Enough to decide from, because a manager on a phone cannot look at the
     * bill: what is being asked, how much is at stake, who is asking, at which
     * till, and how long before it lapses.
     *
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
            'currency' => 'UZS',
            'reason' => $this->approval->reason,
            'terminal_id' => $this->approval->terminal_id,
            'requested_by_user_id' => $this->approval->requested_by_user_id,
            // A subscriber that delivers this five minutes late is delivering a
            // question that can no longer be answered, and should say so rather
            // than ping a manager into a dead end.
            'expires_at' => $this->approval->expires_at->toIso8601String(),
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
