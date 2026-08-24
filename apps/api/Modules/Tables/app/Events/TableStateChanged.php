<?php

declare(strict_types=1);

namespace Modules\Tables\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Modules\Tables\Models\RestaurantTable;

/**
 * A table changed hands, and every screen in the building has to know.
 *
 * The floor plan is the one screen in a restaurant that more than one person is
 * looking at simultaneously — the console on the manager's desk, a host at the
 * door, two waiters on handsets — and all of them are looking at the same
 * twenty-four squares. Without this, the one who did not do the tapping is
 * working from whatever the floor looked like when their screen last loaded,
 * which is how a second party gets walked to an occupied table.
 *
 * **Ids and strings, no model**, for the same reason `DishStopped` carries
 * scalars: `SerializesModels` would re-fetch the row in a queue worker under
 * whatever tenancy that worker happens to hold, and `tables.restaurant_tables`
 * is behind row-level security — so a queued job would broadcast a table it
 * cannot see.
 *
 * `from` travels with `to`, so a screen that missed a message can tell it is
 * behind rather than assuming it is current. That is the same reason
 * `TicketMoved` carries both ends.
 */
final class TableStateChanged implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public function __construct(
        public readonly int $branchId,
        public readonly int $tableId,
        public readonly string $label,
        public readonly string $from,
        public readonly string $to,
    ) {}

    /**
     * Fire it for a table, if there is a room to fire it into.
     *
     * A table with no branch is not a broken table — the column is nullable and
     * a business with one venue may legitimately have never set it — but it is
     * not a table any floor channel is listening for either. Silence is the
     * honest answer; the console's next poll is what catches it up.
     *
     * A no-op change is silent too. A host tapping "free" on a free table would
     * otherwise redraw every handset in the building to say nothing happened.
     */
    public static function announce(RestaurantTable $table, string $from): void
    {
        $branchId = $table->branch_id;
        $to = (string) $table->status;

        if ($branchId === null || $from === $to) {
            return;
        }

        self::dispatch((int) $branchId, (int) $table->id, (string) $table->label, $from, $to);
    }

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('branch.'.$this->branchId.'.floor')];
    }

    public function broadcastAs(): string
    {
        return 'tables.table.changed';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'table_id' => $this->tableId,
            // The label, not just the id: a handset draws "A-7", and looking the
            // name up would mean every listener holding a copy of the floor plan
            // it may have joined too late to have.
            'label' => $this->label,
            'from' => $this->from,
            'to' => $this->to,
        ];
    }
}
