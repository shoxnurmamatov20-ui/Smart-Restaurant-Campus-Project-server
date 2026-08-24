<?php

declare(strict_types=1);

namespace Modules\Pos\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Modules\Pos\Models\Terminal;

/**
 * Show me what that looks like — on the till, not in the browser.
 *
 * The settings screen draws the idle screen next to the controls that shape it,
 * and that preview is a lie in the one way that matters: it is a 360-pixel card
 * on a laptop, and the real thing is a 15-inch screen bolted to a counter in a
 * room with a window. "Is the message readable" cannot be answered anywhere but
 * there.
 *
 * So the manager taps preview and the till in front of them changes. Per
 * TERMINAL rather than per branch, because the point is *that* screen; a branch
 * channel would flash every till in the building while somebody is serving on
 * one of them.
 *
 * **The payload is the whole draft, not an id.** The till is being asked to
 * render something that has not been saved — there is nothing to fetch — and
 * that is the feature: a preview that required a save would mean every
 * experiment ships to the counter permanently.
 */
final class IdlePreviewRequested implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    /**
     * @param  array<string, mixed>  $idle  the unsaved draft, as the console has it
     */
    public function __construct(
        public readonly Terminal $terminal,
        public readonly array $idle,
        public readonly int $seconds,
    ) {}

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('terminal.'.$this->terminal->id)];
    }

    public function broadcastAs(): string
    {
        return 'pos.idle.preview';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'terminal_id' => (int) $this->terminal->id,
            'idle' => $this->idle,
            // How long the till holds the draft before falling back to what is
            // saved. Bounded rather than open-ended: a preview that never
            // expired would leave a half-finished experiment on the counter
            // when the manager closed the laptop.
            'seconds' => $this->seconds,
        ];
    }
}
