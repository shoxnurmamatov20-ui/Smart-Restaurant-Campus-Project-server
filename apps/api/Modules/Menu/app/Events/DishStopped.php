<?php

declare(strict_types=1);

namespace Modules\Menu\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * 86 — a dish is off in one kitchen.
 *
 * The whole feature is the second between a chef tapping a wall screen and a
 * waiter's tile going dashed. Everything else about the stop-list — the reason,
 * the expiry, the audit row — is bookkeeping around that second.
 *
 * **Ids and strings, no model.** Unlike the kitchen events this carries scalars
 * rather than an Eloquent instance, because `SerializesModels` would re-fetch
 * the dish in the queue worker under whatever tenancy that worker happens to
 * have — and this row is guarded by row-level security. A queued job that cannot
 * see its own dish would broadcast a stop with an empty name.
 *
 * The title travels with it so a tablet can name the dish in a toast without
 * looking it up: the tile it greys out is already on screen, but "Manti off" is
 * the sentence a waiter needs and the dish may be in a section they are not
 * looking at.
 */
final class DishStopped implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public function __construct(
        public readonly int $branchId,
        public readonly int $dishId,
        public readonly string $title,
        public readonly ?string $reason = null,
        /** ISO-8601, or null for "until somebody says otherwise". */
        public readonly ?string $until = null,
    ) {}

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('branch.'.$this->branchId.'.stoplist')];
    }

    public function broadcastAs(): string
    {
        return 'menu.dish.stopped';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'dish_id' => $this->dishId,
            'title' => $this->title,
            'reason' => $this->reason,
            'until' => $this->until,
        ];
    }
}
