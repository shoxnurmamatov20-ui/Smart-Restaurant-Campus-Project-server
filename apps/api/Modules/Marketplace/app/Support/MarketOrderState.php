<?php

declare(strict_types=1);

namespace Modules\Marketplace\Support;

/**
 * How far along a marketplace order is.
 *
 * Nine rungs where the design draws five, and that gap is deliberate rather
 * than sloppy. `MP_LADDER` in `packages/surfaces/src/mp/data.ts` is what a
 * hungry person watches — placed · accepted · cooking · courier · delivered —
 * and five dots is the right number to watch. The server has to answer
 * questions the guest never asks: has the kitchen finished but nobody collected
 * it (`ready`), did the merchant refuse it (`rejected`) or did the guest change
 * their mind (`cancelled`). Collapsing those into the guest's five would leave
 * the merchant's queue unable to tell a rejection from a cancellation, which are
 * opposite things on a performance report.
 *
 * {@see self::rung()} is the mapping down to the five, and it lives here so
 * both sides read one table rather than each keeping half of it.
 *
 * `enum: string` and not an integer, because these values are stored, indexed,
 * and read by three clients that branch on them. A number would need a legend
 * in four places.
 */
enum MarketOrderState: string
{
    case Placed = 'placed';
    case Accepted = 'accepted';
    case Cooking = 'cooking';
    case Ready = 'ready';
    case CourierAssigned = 'courier_assigned';
    case Enroute = 'enroute';
    case Delivered = 'delivered';
    case Cancelled = 'cancelled';
    case Rejected = 'rejected';

    /**
     * Where this order may go next.
     *
     * Enforced rather than advisory. Without a table like this an order can go
     * from `placed` straight to `delivered` — no acceptance, no kitchen ticket,
     * no courier — and the only thing standing in the way is that no screen
     * offers the button. The merchant panel is not the only caller; a courier
     * app and an operator console are both coming.
     *
     * Two rules run through it. Anything still live can be `cancelled`, because
     * a guest walks away at any point and a kitchen fire does not consult a
     * ladder. And `rejected` is reachable only from `placed`, because refusing
     * an order you have already started cooking is not a rejection — it is a
     * cancellation, and the merchant's acceptance rate should say so.
     *
     * @return list<self>
     */
    public function next(): array
    {
        return match ($this) {
            self::Placed => [self::Accepted, self::Rejected, self::Cancelled],
            self::Accepted => [self::Cooking, self::Cancelled],
            self::Cooking => [self::Ready, self::Cancelled],
            self::Ready => [self::CourierAssigned, self::Cancelled],
            self::CourierAssigned => [self::Enroute, self::Cancelled],
            self::Enroute => [self::Delivered, self::Cancelled],
            self::Delivered, self::Cancelled, self::Rejected => [],
        };
    }

    public function canBecome(self $target): bool
    {
        return in_array($target, $this->next(), true);
    }

    /** Nothing moves after this. */
    public function isTerminal(): bool
    {
        return $this->next() === [];
    }

    public function isLive(): bool
    {
        return ! $this->isTerminal();
    }

    /**
     * The guest may still call it off — `placed` and `accepted`, nothing later.
     *
     * The line is drawn where the food starts costing money. Once a pan is hot
     * the restaurant has spent the ingredients, and a cancellation that costs
     * them nothing to grant is a cancellation somebody will abuse. After this
     * the guest opens a dispute instead, which a human reads.
     */
    public function guestMayCancel(): bool
    {
        return $this === self::Placed || $this === self::Accepted;
    }

    /**
     * The column that gets stamped when an order reaches this rung.
     *
     * A column per rung rather than one `state_changed_at`: the tracking screen
     * prints five times down the ladder and the performance screen measures the
     * gap between two of them. `rejected` shares `cancelled_at` — it is the same
     * event from the other side of the counter, and the reason column says which.
     *
     * Every rung has one, so this never answers null — a rung that arrived
     * without a column would be a rung nothing could measure.
     */
    public function stampColumn(): string
    {
        return match ($this) {
            self::Placed => 'placed_at',
            self::Accepted => 'accepted_at',
            self::Cooking => 'cooking_at',
            self::Ready => 'ready_at',
            self::CourierAssigned => 'courier_assigned_at',
            self::Enroute => 'enroute_at',
            self::Delivered => 'delivered_at',
            self::Cancelled, self::Rejected => 'cancelled_at',
        };
    }

    /**
     * Which of the design's five dots this lights — `MP_LADDER`.
     *
     * A cancelled or rejected order lights none: the tracking screen swaps the
     * whole ladder for a refund notice rather than drawing a journey that
     * stopped.
     */
    public function rung(): ?string
    {
        return match ($this) {
            self::Placed => 'placed',
            self::Accepted => 'accepted',
            self::Cooking, self::Ready => 'cooking',
            self::CourierAssigned, self::Enroute => 'courier',
            self::Delivered => 'delivered',
            self::Cancelled, self::Rejected => null,
        };
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $state): string => $state->value, self::cases());
    }
}
