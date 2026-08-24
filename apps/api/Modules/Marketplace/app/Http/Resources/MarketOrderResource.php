<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Marketplace\Models\MarketOrder;
use Modules\Marketplace\Models\MarketOrderLine;

/**
 * An order as the person who ordered it sees it.
 *
 * Two things this deliberately does NOT carry, and both are the merchant's:
 * `commission_tiyin` and `merchant_due_tiyin`. What the platform keeps from the
 * restaurant is a commercial term between those two parties; putting it on a
 * guest's tracking screen would publish every restaurant's margin to anybody who
 * opened developer tools.
 *
 * @mixin MarketOrder
 */
final class MarketOrderResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $state = $this->state();

        return [
            'number' => $this->number,
            'state' => $this->state,

            /*
             * Which of the design's five dots is lit — `MP_LADDER`. Computed
             * here rather than by each client, because the server tracks nine
             * rungs and the mapping down to five is a rule rather than a
             * rendering choice. Null on a cancelled order: the screen swaps the
             * ladder for a refund notice rather than drawing a journey that
             * stopped halfway.
             */
            'rung' => $state->rung(),

            'store' => [
                'slug' => $this->store?->slug,
                'name' => $this->store?->name,
                'initials' => $this->store?->initials,
                'tint' => $this->store?->tint,
            ],

            'lines' => $this->whenLoaded('lines', fn (): array => array_map(
                static fn (MarketOrderLine $line): array => [
                    'menu_item_id' => $line->menu_item_id,
                    'name' => $line->name,
                    'unit_price_tiyin' => $line->unit_price_tiyin,
                    'quantity' => $line->quantity,
                    'line_total_tiyin' => $line->line_total_tiyin,
                    'note' => $line->note,
                ],
                $this->lines->all(),
            )),

            'subtotal_tiyin' => $this->subtotal_tiyin,
            'discount_tiyin' => $this->discount_tiyin,
            'service_fee_tiyin' => $this->service_fee_tiyin,
            'service_percent' => $this->service_percent,
            'delivery_fee_tiyin' => $this->delivery_fee_tiyin,
            'total_tiyin' => $this->total_tiyin,
            'promo_code' => $this->promo_code,

            'pay_rail' => $this->pay_rail,
            'paid_at' => $this->paid_at?->toIso8601String(),

            'address' => $this->address,
            'address_note' => $this->address_note,

            /*
             * Two numbers rather than one, because they answer different
             * questions: a clock time is what a person plans around and a
             * countdown is what they check while waiting. Both null until the
             * merchant accepts — before that nobody has agreed to cook it, and
             * a countdown against an unanswered order is a promise no kitchen
             * has heard.
             */
            'eta_at' => $this->estimatedAt()?->toIso8601String(),
            'eta_minutes' => $this->eta_minutes,

            /*
             * Null when the rider's phone last spoke more than ten minutes ago.
             * Drawing a stale pin implies a live feed; the honest answer is that
             * nobody knows, and the screen says "yo'lda" without a map.
             */
            'courier' => $this->courier === null ? null : [
                'name' => $this->courier->name,
                'rating' => $this->courier->rating(),
                'deliveries' => $this->courier->deliveries_count,
                'position' => $this->courier->position(),
            ],

            'can_cancel' => $state->guestMayCancel(),
            'can_rate' => $state->value === 'delivered' && $this->rating === null,
            'rating' => $this->rating,

            'stamps' => [
                'placed' => $this->placed_at?->toIso8601String(),
                'accepted' => $this->accepted_at?->toIso8601String(),
                'cooking' => $this->cooking_at?->toIso8601String(),
                'courier' => $this->courier_assigned_at?->toIso8601String(),
                'delivered' => $this->delivered_at?->toIso8601String(),
                'cancelled' => $this->cancelled_at?->toIso8601String(),
            ],

            'cancel_reason' => $this->cancel_reason,
            'reject_reason' => $this->reject_reason,

            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
