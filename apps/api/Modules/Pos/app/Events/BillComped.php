<?php

declare(strict_types=1);

namespace Modules\Pos\Events;

use App\Support\Events\DomainEvent;
use Modules\Pos\Models\PosApproval;

/**
 * The restaurant paid for this one.
 *
 * A dish sent back, a regular's birthday, an apology for a forty-minute wait.
 * Deliberately not a void and deliberately not a hundred percent discount:
 *
 *   the food was cooked, so stock moved and food cost is real;
 *   no money arrived, so it is not revenue with a discount against it;
 *   somebody decided to give it away, so it books as a marketing cost.
 *
 * Folding it into either of the others makes two reports wrong at once. Against
 * a void, the kitchen appears to have wasted ingredients on orders nobody
 * placed. Against a discount, the restaurant appears to have sold something at
 * zero and its average cheque quietly collapses.
 */
final class BillComped extends DomainEvent
{
    public function __construct(
        private readonly int $billId,
        private readonly string $number,
        private readonly int $total,
        private readonly string $reason,
        private readonly int $terminalId,
        private readonly ?int $byUserId,
        private readonly ?PosApproval $approval = null,
    ) {}

    public function name(): string
    {
        return 'pos.bill_comped';
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return [
            'bill_id' => $this->billId,
            'number' => $this->number,
            // The cost of the gesture, tiyin. This is the number that becomes a
            // marketing line, so it is the bill's total and not its subtotal.
            'total' => $this->total,
            'currency' => 'UZS',
            'reason' => $this->reason,
            'terminal_id' => $this->terminalId,
            'by_user_id' => $this->byUserId,
            'approval_id' => $this->approval?->getKey(),
            'approved_by_user_id' => $this->approval?->approved_by_user_id,
            'approval_method' => $this->approval?->method,
        ];
    }
}
