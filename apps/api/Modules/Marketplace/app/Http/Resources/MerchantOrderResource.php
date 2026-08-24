<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Marketplace\Models\MarketOrder;
use Modules\Marketplace\Models\MarketOrderLine;

/**
 * The same order, as the restaurant cooking it sees it.
 *
 * A different resource rather than a flag on the consumer's, because the two
 * audiences want almost disjoint fields. A merchant needs the commission and
 * what they will be paid; a guest must never see either. A guest needs the
 * courier's rating; a merchant does not care. And the merchant needs the one
 * number the whole panel is built around — how many seconds are left to answer.
 *
 * The customer's name is here and their phone number is not. A kitchen calls
 * out a name; the number is the platform's to hold, and a masked callback is
 * what the design promises instead.
 *
 * @mixin MarketOrder
 */
final class MerchantOrderResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'state' => $this->state,

            // The ninety-second clock. Null on anything already answered, which
            // is what stops the panel drawing a countdown beside a done order.
            'seconds_to_answer' => $this->secondsToAnswer(),

            /*
             * What the restaurant has promised, in minutes from acceptance.
             * The panel's "+10 minutes" button adds to this rather than to a
             * number it keeps in the browser — a local total resets on every
             * reload and disagrees with the guest's own countdown.
             */
            'eta_minutes' => $this->eta_minutes,

            'customer' => $this->consumer?->name,

            'address' => $this->address,
            'address_note' => $this->address_note,

            'lines' => $this->whenLoaded('lines', fn (): array => array_map(
                static fn (MarketOrderLine $line): array => [
                    'name' => $line->name,
                    'quantity' => $line->quantity,
                    'line_total_tiyin' => $line->line_total_tiyin,
                    'note' => $line->note,
                ],
                $this->lines->all(),
            )),

            // What the food sold for, before anything is taken off it. The card
            // prints this as the order's value.
            'gross_tiyin' => $this->subtotal_tiyin,

            'commission_percent' => $this->commission_percent,
            'commission_tiyin' => $this->commission_tiyin,
            'merchant_due_tiyin' => $this->merchant_due_tiyin,

            'pay_rail' => $this->pay_rail,

            'placed_at' => $this->placed_at?->toIso8601String(),
            'accepted_at' => $this->accepted_at?->toIso8601String(),
            'delivered_at' => $this->delivered_at?->toIso8601String(),

            // The bill this order opened in the restaurant's own books, once it
            // was accepted. Null before that, and that is the whole point of the
            // ninety seconds.
            'bill_id' => $this->bill_id,

            'rating' => $this->rating,
            'cancel_reason' => $this->cancel_reason,
            'reject_reason' => $this->reject_reason,
        ];
    }
}
