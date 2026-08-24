<?php

declare(strict_types=1);

namespace Modules\Tables\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Modules\Tables\Models\WaiterCall;

/**
 * A table raised its hand, and the floor should hear about it now.
 *
 * The same shape `TicketFired` set for the kitchen, one room over: per BRANCH
 * rather than per restaurant, because a waiter in Chilonzor watching Termiz's
 * tables light up learns nothing and stops looking.
 *
 * **The payload is the call, not an id.** A handset that received "call 412
 * happened" would have to fetch it — a round trip, on the phone in somebody's
 * apron, during service. What arrives is what is drawn: which table, what they
 * want, how long they have been waiting.
 *
 * **`ShouldBroadcast`, not `ShouldBroadcastNow`.** It rides the queue, so a
 * Reverb that is slow or down cannot hold open the transaction that recorded
 * the call. A guest whose "chaqirish" took a second to reach the floor has been
 * served; a guest whose tap hung for thirty seconds taps again.
 */
final class GuestCalled implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public function __construct(public readonly WaiterCall $call) {}

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('branch.'.$this->call->branch_id.'.floor')];
    }

    public function broadcastAs(): string
    {
        return 'tables.guest.called';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'id' => (int) $this->call->id,
            'kind' => (string) $this->call->kind,
            'status' => (string) $this->call->status,
            'table_id' => (int) $this->call->restaurant_table_id,
            // The label, not only the id: a waiter knows "A-7" and has never
            // seen the primary key of anything.
            'table_label' => $this->call->restaurantTable?->label,
            'order_id' => $this->call->order_id,
            'seat_no' => $this->call->seat_no,
            'note' => $this->call->note,
            'created_at' => $this->call->created_at?->toIso8601String(),
        ];
    }
}
