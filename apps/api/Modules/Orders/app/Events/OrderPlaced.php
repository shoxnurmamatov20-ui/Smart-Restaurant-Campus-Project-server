<?php

declare(strict_types=1);

namespace Modules\Orders\Events;

use App\Support\Events\DomainEvent;
use Illuminate\Database\Eloquent\Model;
use Modules\Orders\Models\Order;

/**
 * A bill was fired — somebody is now expected to cook it.
 *
 * `OrderPaid` already announced the end of the story; this announces the start,
 * and the two have different audiences. Payment interests loyalty, analytics
 * and the floor plan. Placement interests everything that has to *happen*: a
 * courier to assign, a guest to notify, a call-centre queue to shorten, a
 * delivery promise whose clock has just started.
 *
 * Published wherever an order reaches the kitchen, not only from the guest-
 * facing endpoint. It carries the phone and the address because the subscribers
 * that matter most — a CRM that has never seen this number, a dispatcher that
 * has to route a scooter — cannot ask Orders for them without importing it,
 * which is the whole reason this event exists.
 *
 * That does mean personal data in the outbox. It is tenant-scoped like every
 * other row on this platform, and the alternative is worse: an event carrying
 * only an id forces every subscriber to call back into Orders, which is the
 * coupling the outbox was built to remove.
 */
final class OrderPlaced extends DomainEvent
{
    public function __construct(private readonly Order $order) {}

    public function name(): string
    {
        return 'orders.placed';
    }

    /**
     * Ids and values only — never the model.
     *
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return [
            'order_id' => $this->order->id,
            'number' => $this->order->number,
            'channel' => $this->order->channel,
            'status' => $this->order->status,
            'source' => $this->order->source,
            'branch_id' => $this->order->branch_id,
            'restaurant_table_id' => $this->order->restaurant_table_id,
            'customer_id' => $this->order->customer_id,
            'customer_name' => $this->order->customer_name,
            'customer_phone' => $this->order->customer_phone,
            'delivery_address' => $this->order->delivery_address,
            'guests_count' => $this->order->guests_count,
            'subtotal' => $this->order->subtotal,
            'discount_total' => $this->order->discount_total,
            'service_charge' => $this->order->service_charge,
            'delivery_fee' => $this->order->delivery_fee,
            'total' => $this->order->total,
            'currency' => 'UZS',
            'payment_method' => $this->order->payment_method,
            'payment_state' => $this->order->payment_state,
            'promo_code' => $this->order->promo_code,
            'placed_at' => $this->order->placed_at?->toIso8601String(),
            'promised_at' => $this->order->promised_at?->toIso8601String(),
        ];
    }

    /**
     * Always an order — narrower than the base's `?Model`, because there is no
     * version of "an order was placed" with nothing to place.
     */
    public function aggregate(): Model
    {
        return $this->order;
    }

    /**
     * From the order rather than the request: a guest placing an order has no
     * session, and a queued replay has no request at all.
     */
    public function tenantId(): ?int
    {
        return $this->order->tenant_id;
    }
}
