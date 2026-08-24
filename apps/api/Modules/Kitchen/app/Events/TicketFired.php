<?php

declare(strict_types=1);

namespace Modules\Kitchen\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Modules\Kitchen\Models\KitchenTicket;

/**
 * A docket reached a station.
 *
 * The first broadcast in this repository, and the shape the rest should follow.
 *
 * **Per branch, not per restaurant.** The channels that existed before this were
 * `tenant.{id}.kitchen`, which is the wrong grain by one level: a chain of fifty
 * venues would push every docket to every pass, and the cook in Chilonzor would
 * watch Termiz's tickets scroll past their own. A kitchen screen is a physical
 * object in one room.
 *
 * **The payload is the docket, not an id.** A screen that received "ticket 412
 * changed" would have to fetch it, which is a round trip per ticket during the
 * exact minute the kitchen is busiest — and a fetch that can fail after a
 * notification that cannot. What arrives is what is drawn.
 *
 * **ShouldBroadcast, not ShouldBroadcastNow.** It goes through the queue, so a
 * Reverb that is down or slow cannot hold open the transaction that fired the
 * bill. A kitchen screen that updates a second late is a working kitchen; a
 * till that hangs while a waiter holds it is not.
 */
final class TicketFired implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public function __construct(public readonly KitchenTicket $ticket) {}

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('branch.'.$this->ticket->branch_id.'.kitchen')];
    }

    public function broadcastAs(): string
    {
        return 'kitchen.ticket.fired';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'id' => (int) $this->ticket->id,
            'order_id' => (int) $this->ticket->order_id,
            'order_number' => (string) $this->ticket->order_number,
            'station' => (string) $this->ticket->station,
            'table_label' => $this->ticket->table_label,
            'channel' => (string) $this->ticket->channel,
            'status' => (string) $this->ticket->status,
            'sla_minutes' => (int) $this->ticket->sla_minutes,
            'lines' => $this->ticket->lines,
            'created_at' => $this->ticket->created_at?->toIso8601String(),
        ];
    }
}
