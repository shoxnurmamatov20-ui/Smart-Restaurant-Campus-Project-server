<?php

declare(strict_types=1);

namespace Modules\Pos\Events;

use App\Support\Events\DomainEvent;
use Modules\Pos\Models\PosApproval;

/**
 * A bill was cancelled at a till. Nothing was sold and nothing was paid.
 *
 * One of three ways money stops being owed, and they are three events rather
 * than one carrying a reason code, because no subscriber wants all three. Stock
 * cares about a comp and not about a void — a voided bill consumed nothing.
 * Revenue cares about a refund and not about a void — a void was never revenue
 * to reverse. Loss prevention cares about all three but has to count them apart,
 * because a shift with twenty voids is a different conversation from a shift
 * with twenty comps.
 *
 * The approval context travels with it, and that is the part Orders could not
 * publish even if it wanted to: `orders.voided` would know the bill and not know
 * who signed it off. "Who agreed, and were they in the building" is the whole
 * question a fraud review asks.
 */
final class BillVoided extends DomainEvent
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
        return 'pos.bill_voided';
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return [
            'bill_id' => $this->billId,
            'number' => $this->number,
            // What walked away, tiyin. Zero is normal — an empty bill opened by
            // mistake — and is exactly why the figure has to be sent rather than
            // inferred from "a bill was voided, so something was lost".
            'total' => $this->total,
            'currency' => 'UZS',
            'reason' => $this->reason,
            'terminal_id' => $this->terminalId,
            'by_user_id' => $this->byUserId,
            'approval_id' => $this->approval?->getKey(),
            'approved_by_user_id' => $this->approval?->approved_by_user_id,
            // `pin` means somebody typed one at this till; `remote` means a
            // manager answered from a phone. Different evenings, same row.
            'approval_method' => $this->approval?->method,
        ];
    }
}
