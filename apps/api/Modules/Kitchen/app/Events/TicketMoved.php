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
 * A cook moved a docket, and the floor needs to know.
 *
 * Two channels, deliberately. The kitchen's own screens need it because a
 * second cook must see that the first has claimed the ticket; the floor needs
 * it because the waiter's chip on the bill turns amber when the kitchen accepts
 * and green when it is ready — which is the difference between a waiter
 * checking the pass every two minutes and a waiter serving tables.
 *
 * That second channel is the whole point of the event. Without it the kitchen
 * knows everything and the room knows nothing, which is how food sits under a
 * lamp going cold while a waiter is at the other end of the restaurant.
 */
final class TicketMoved implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public function __construct(
        public readonly KitchenTicket $ticket,
        public readonly string $from,
    ) {}

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        $branch = $this->ticket->branch_id;

        return [
            new PrivateChannel('branch.'.$branch.'.kitchen'),
            new PrivateChannel('branch.'.$branch.'.orders'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'kitchen.ticket.moved';
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
            // Both ends, so a screen that missed a message can tell whether it
            // is behind rather than assuming it is up to date.
            'from' => $this->from,
            'status' => (string) $this->ticket->status,
            'started_at' => $this->ticket->started_at?->toIso8601String(),
            'ready_at' => $this->ticket->ready_at?->toIso8601String(),
        ];
    }
}
