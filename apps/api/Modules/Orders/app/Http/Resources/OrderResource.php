<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Orders\Models\Order;

/**
 * @mixin Order
 */
final class OrderResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'channel' => $this->channel,
            'status' => $this->status,
            'is_open' => $this->is_open,
            'table' => [
                'id' => $this->restaurant_table_id,
                'label' => $this->table_label,
            ],
            'waiter_user_id' => $this->waiter_user_id,
            /*
             * The same person, named.
             *
             * `waiter_user_id` stays because four clients already read it and an
             * id is what a filter takes. What it could never do is fill a column
             * a human reads, and every consumer that tried resolved it with one
             * lookup per row — twenty-five requests to draw one column on a page
             * of orders.
             *
             * `name` is null rather than absent when the relation was not loaded,
             * so a client can tell "no waiter on this bill" (`waiter` is null)
             * from "this endpoint did not join it" (`waiter.name` is null). A
             * key that vanishes is a key a client crashes on.
             */
            'waiter' => $this->waiter_user_id === null ? null : [
                'id' => $this->waiter_user_id,
                'name' => $this->relationLoaded('waiter') ? $this->waiter?->name : null,
            ],
            /*
             * How this order reached the restaurant, in three parts.
             *
             * `source` is which software posted it (web, app, telegram, qr, pos,
             * aggregator); `intake_channel` is which CONVERSATION it was, and
             * the two are different axes — `aggregator` covers three separate
             * contracts, and telling Yandex from Wolt afterwards is impossible
             * without this column. `operator_user_id` is who answered, which is
             * never the waiter: the ninth role on this platform is measured on
             * how fast the phone was picked up.
             *
             * All three are null on the two thirds of service that happen in the
             * room, and a client must render them as absent rather than as
             * "unknown".
             */
            'source' => $this->source,
            'intake_channel' => $this->intake_channel,
            'operator_user_id' => $this->operator_user_id,
            /*
             * Who is on the other end, and where it is going.
             *
             * Columns on the bill since a stranger could order from a phone, and
             * published by nothing — so the operator's intake queue drew, in its
             * own words, *"a number with four blanks under it"*. All four are a
             * SNAPSHOT of what was said at the time rather than a join into CRM:
             * a guest who changes their number next month must not rewrite the
             * address a courier was sent to last night.
             *
             * Null on the two thirds of service that happen in the room, where
             * the table is the address and the waiter is the phone.
             */
            'customer_name' => $this->customer_name,
            'customer_phone' => $this->customer_phone,
            'delivery' => [
                'address' => $this->delivery_address,
                'note' => $this->delivery_note,
                'fee' => (int) ($this->delivery_fee ?? 0),
            ],
            /*
             * Two axes, not one rung.
             *
             * `payment_method` is how it will be settled and `payment_state` is
             * whether it has been — an online order waits at `draft` with
             * `pending` and is never fired, while a cash delivery is `due` and
             * is cooked. A queue that read only the ladder could not tell the
             * two apart, and would put an unpaid basket on a cook's rail.
             */
            'payment_method' => $this->payment_method,
            'payment_state' => $this->payment_state,
            /*
             * Two clocks, and confusing them is how a delivery promise stops
             * being measurable.
             *
             * `promised_at` is what the guest was TOLD, frozen at the moment we
             * told them. `scheduled_for` is what they ASKED for — the 19:00
             * sitting chosen at eleven in the morning. Null means "as soon as
             * you can", which is most orders.
             */
            'promised_at' => $this->promised_at?->toIso8601String(),
            'scheduled_for' => $this->scheduled_for?->toIso8601String(),
            'customer_id' => $this->customer_id,
            'guests_count' => $this->guests_count,
            'subtotal' => $this->subtotal,
            'discount_total' => $this->discount_total,
            'service_charge' => $this->service_charge,
            'total' => $this->total,
            'total_uzs' => $this->total_uzs,
            'currency' => 'UZS',
            /*
             * A bill divided by money, and what it was divided from.
             *
             * Present so a client can tell the one arithmetic that stops holding:
             * on a split bill `total` is a fixed share and no longer equals
             * `subtotal + service − discount`. A receipt that added the lines up
             * itself would print a different figure from the one the guest is
             * being asked for. See the split migration.
             */
            'split' => $this->split_share_total === null ? null : [
                'parent_id' => $this->split_parent_id,
                'share_total' => (int) $this->split_share_total,
            ],
            'placed_at' => $this->placed_at?->toIso8601String(),
            'closed_at' => $this->closed_at?->toIso8601String(),
            'note' => $this->note,
            'items' => OrderItemResource::collection($this->whenLoaded('items')),
            'items_count' => $this->whenCounted('items'),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
