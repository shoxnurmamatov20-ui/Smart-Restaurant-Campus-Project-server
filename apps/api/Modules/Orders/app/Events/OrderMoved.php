<?php

declare(strict_types=1);

namespace Modules\Orders\Events;

use App\Support\Events\DomainEvent;
use Illuminate\Database\Eloquent\Model;
use Modules\Orders\Models\Order;

/**
 * A bill moved one rung up the ladder.
 *
 * `OrderPlaced` announces the start and `OrderPaid` the end; this is every step
 * in between, and it exists because of the one audience neither of those two
 * can serve: the guest.
 *
 * Somebody who ordered by telephone, in the bot, or on the website has no
 * screen open. The only way they learn their food was accepted, is ready, or is
 * on a scooter is if the platform tells them — and until this event existed
 * there was nothing to subscribe to. The intake screen said so in its own
 * words: a declined order "notifies nobody", and the reason given was that
 * `orders.channel` cannot say which door it came through. `intake_channel` can,
 * and it rides along below.
 *
 * ---------------------------------------------------------------------------
 * Why `from` as well as `to`
 *
 * Delivery is at-least-once and the relay may sweep up an event a crash left
 * behind. A subscriber that saw only `to` could not tell a genuine move from a
 * replay of one it has already acted on — and "your order is ready" arriving
 * twice, an hour apart, is worse than not arriving.
 *
 * The phone and the address travel with it for the same reason `OrderPlaced`
 * carries them: a subscriber that had to call back into Orders to find out who
 * to ring is a subscriber coupled to Orders, which is what the outbox exists to
 * prevent. That does mean personal data in the outbox; it is tenant-scoped like
 * every other row here, and the alternative is worse.
 */
final class OrderMoved extends DomainEvent
{
    public function __construct(
        private readonly Order $order,
        private readonly string $from,
    ) {}

    public function name(): string
    {
        return 'orders.moved';
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
            'from' => $this->from,
            'to' => $this->order->status,
            'source' => $this->order->source,
            'intake_channel' => $this->order->intake_channel,
            'branch_id' => $this->order->branch_id,
            'customer_id' => $this->order->customer_id,
            'customer_name' => $this->order->customer_name,
            'customer_phone' => $this->order->customer_phone,
            'delivery_address' => $this->order->delivery_address,
            'total' => $this->order->total,
        ];
    }

    public function aggregate(): Model
    {
        return $this->order;
    }

    /**
     * From the order rather than the request: a bill moved by a queued job or a
     * payment-gateway callback has no tenant context behind it.
     */
    public function tenantId(): ?int
    {
        return $this->order->tenant_id;
    }
}
