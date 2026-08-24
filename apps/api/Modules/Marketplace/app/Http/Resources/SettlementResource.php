<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Marketplace\Models\Settlement;

/**
 * One week's statement, exactly as it was issued.
 *
 * Every figure comes off the row rather than being recomputed from live orders.
 * That is what makes a statement quotable: a merchant reading it a month later
 * gets the same numbers they reconciled their bank account against, whatever has
 * happened to the orders behind it since.
 *
 * @mixin Settlement
 */
final class SettlementResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'invoice_number' => $this->invoice_number,

            // Not nullable — a statement without a period is not a statement.
            'period_start' => $this->period_start->toDateString(),
            'period_end' => $this->period_end->toDateString(),

            'orders_count' => $this->orders_count,

            'gross_tiyin' => $this->gross_tiyin,
            'commission_tiyin' => $this->commission_tiyin,
            'adjustments_tiyin' => $this->adjustments_tiyin,
            'payable_tiyin' => $this->payable_tiyin,

            'state' => $this->state,
            'paid_at' => $this->paid_at?->toIso8601String(),
            'payment_reference' => $this->payment_reference,
        ];
    }
}
