<?php

declare(strict_types=1);

namespace Modules\Board\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * The wall was told to redraw.
 *
 * Nobody is standing at a menu board. That single fact is why "push" is a write
 * plus a broadcast rather than a write: a television that only picked up a new
 * price on its next reload is a television advertising last week's price to the
 * queue, and there is no operator to press F5. The screen holds a socket open
 * and this is what comes down it.
 *
 * **Per branch.** `branch.{id}.board`, alongside `.kitchen`, `.orders`,
 * `.stoplist`, `.floor` and `.approvals`. A chain of fifty venues on one
 * tenant-wide channel would redraw every wall in the country because a manager
 * in Termiz reordered two columns.
 *
 * **Ids and scalars, no model.** The same reason `DishStopped` carries them: a
 * queued broadcast re-fetching an Eloquent instance would do it in a worker
 * under whatever tenancy that worker happens to hold, and these rows are behind
 * row-level security. A job that cannot see its own rows would announce an
 * empty board.
 *
 * **The payload is a signal, not the board.** Unlike `TicketFired`, which sends
 * the docket because a kitchen screen draws exactly what arrives, this sends
 * only "something changed, at this revision". A board's content is columns
 * joined to the live catalogue and the live stop list — it changes when nobody
 * pushed anything, because the kitchen 86'd a dish — so a screen that drew a
 * pushed snapshot would go stale between pushes. It re-reads `GET
 * board/preview` instead, and this tells it when.
 */
final class BoardPushed implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public function __construct(
        public readonly int $branchId,
        /** How many rows were stamped: columns, screens, banners. */
        public readonly int $columns,
        public readonly int $screens,
        public readonly int $banners,
        /** ISO-8601. The screens use it to ignore a push they already applied. */
        public readonly string $pushedAt,
    ) {}

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('branch.'.$this->branchId.'.board')];
    }

    public function broadcastAs(): string
    {
        return 'board.pushed';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'branch_id' => $this->branchId,
            'columns' => $this->columns,
            'screens' => $this->screens,
            'banners' => $this->banners,
            'pushed_at' => $this->pushedAt,
        ];
    }
}
