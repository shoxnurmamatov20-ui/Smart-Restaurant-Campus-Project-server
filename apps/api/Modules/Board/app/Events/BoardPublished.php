<?php

declare(strict_types=1);

namespace Modules\Board\Events;

use App\Support\Events\DomainEvent;

/**
 * The board of one venue stopped being a draft.
 *
 * The other half of a push, and a different half. {@see BoardPushed} is the
 * wire: it goes to Reverb, reaches two televisions, and is worthless a second
 * later — a screen that was off when it fired has missed it and re-reads on
 * boot instead. This goes to the outbox, which is durable, ordered and
 * at-least-once, and is therefore what anything that has to *know* subscribes
 * to.
 *
 * Nothing subscribes yet, and that is not an argument against it. The rota
 * publishes `staff.rota_published` for the same shape of reason: the moment a
 * working copy becomes a promise is a business fact, and the notifier that
 * wants it later — a signage agent restarting a player, a Telegram message to
 * the manager who is not in the building, an audit answering "when did this
 * price reach the wall" — should not have to make this module know it exists.
 *
 * A push that changed nothing is not published. See BoardPushController: a
 * manager pressing the button to check would otherwise write an outbox row
 * every time and tell a subscriber the board had been updated when it had not.
 */
final class BoardPublished extends DomainEvent
{
    /**
     * @param  array<string, int>  $stamped  how many rows of each list reached the screens
     */
    public function __construct(
        private readonly int $branchId,
        private readonly array $stamped,
        private readonly string $pushedAt,
        private readonly ?int $tenantId = null,
    ) {}

    public function name(): string
    {
        return 'board.published';
    }

    /**
     * Ids and counts. A subscriber that needed the columns themselves would be
     * a subscriber reading this module's tables — `GET board/preview` is the
     * door for that, and it answers with the live catalogue joined in, which a
     * frozen payload could not.
     *
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return [
            'branch_id' => $this->branchId,
            'columns' => $this->stamped['columns'] ?? 0,
            'screens' => $this->stamped['screens'] ?? 0,
            'banners' => $this->stamped['banners'] ?? 0,
            'pushed_at' => $this->pushedAt,
        ];
    }

    public function tenantId(): ?int
    {
        return $this->tenantId;
    }
}
