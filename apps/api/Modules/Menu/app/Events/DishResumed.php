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
 * A dish is back on in one kitchen.
 *
 * Its own event rather than a flag on DishStopped, because the two are different
 * news and a client that had to read a boolean to tell "off" from "on" would show
 * the wrong one every time a field was renamed. It also lets a screen ignore one
 * and listen to the other: a QR menu cares about both, a toast on the pass only
 * cares that something came back.
 */
final class DishResumed implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public function __construct(
        public readonly int $branchId,
        public readonly int $dishId,
        public readonly string $title,
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
        return 'menu.dish.resumed';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return ['dish_id' => $this->dishId, 'title' => $this->title];
    }
}
