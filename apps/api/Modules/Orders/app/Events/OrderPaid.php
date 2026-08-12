<?php

declare(strict_types=1);

namespace Modules\Orders\Events;

use App\Support\Events\DomainEvent;
use Illuminate\Database\Eloquent\Model;
use Modules\Orders\Models\Order;

/**
 * A bill was settled.
 *
 * The single most consequential moment in a restaurant's day, and the one most
 * other modules care about: loyalty credits it to the guest, analytics counts
 * it as revenue, the table frees up, the owner's phone shows a new number.
 *
 * Orders publishes this and knows about none of them.
 */
final class OrderPaid extends DomainEvent
{
    public function __construct(private readonly Order $order) {}

    public function name(): string
    {
        return 'orders.paid';
    }

    /**
     * Ids and values only — never the model. A subscriber that received an
     * Order would be coupled to Orders' schema, which is the whole thing this
     * event exists to avoid.
     *
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return [
            'order_id' => $this->order->id,
            'number' => $this->order->number,
            'channel' => $this->order->channel,
            'customer_id' => $this->order->customer_id,
            'restaurant_table_id' => $this->order->restaurant_table_id,
            'guests_count' => $this->order->guests_count,
            'subtotal' => $this->order->subtotal,
            'discount_total' => $this->order->discount_total,
            'service_charge' => $this->order->service_charge,
            'total' => $this->order->total,
            'currency' => 'UZS',
            'closed_at' => $this->order->closed_at?->toIso8601String(),
        ];
    }

    public function aggregate(): ?Model
    {
        return $this->order;
    }

    /**
     * Taken from the order rather than the request: a bill settled by a queued
     * job or a payment-gateway callback has no tenant context behind it.
     */
    public function tenantId(): ?int
    {
        return $this->order->tenant_id;
    }
}
