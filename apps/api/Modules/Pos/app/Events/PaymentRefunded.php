<?php

declare(strict_types=1);

namespace Modules\Pos\Events;

use App\Support\Events\DomainEvent;
use Modules\Pos\Models\PosApproval;

/**
 * Money went back over the counter.
 *
 * The third of the three, and the only one where cash physically leaves the
 * drawer with nothing arriving — which is why it is the operation an attacker
 * reaches for first, and why it always needs a manager whatever the amount.
 *
 * It is a payment event rather than a bill event on purpose. A table that paid
 * with two cards and a handful of notes has three tenders, and giving one of
 * them back is not the same act as unwinding the meal. Whether the BILL ends up
 * `refunded` depends on whether anything is still captured against it; this says
 * only that one tender came back.
 */
final class PaymentRefunded extends DomainEvent
{
    public function __construct(
        private readonly int $paymentId,
        private readonly ?int $billId,
        private readonly string $reason,
        private readonly int $terminalId,
        private readonly ?int $byUserId,
        private readonly ?PosApproval $approval = null,
        private readonly bool $billFullyRefunded = false,
    ) {}

    public function name(): string
    {
        return 'pos.payment_refunded';
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return [
            'payment_id' => $this->paymentId,
            'bill_id' => $this->billId,
            'reason' => $this->reason,
            'terminal_id' => $this->terminalId,
            'by_user_id' => $this->byUserId,
            'approval_id' => $this->approval?->getKey(),
            'approved_by_user_id' => $this->approval?->approved_by_user_id,
            'approval_method' => $this->approval?->method,
            // Whether this was the last live tender on the bill. A subscriber
            // reversing revenue needs to know the difference between "one of
            // three cards came back" and "the meal was undone".
            'bill_fully_refunded' => $this->billFullyRefunded,
        ];
    }
}
