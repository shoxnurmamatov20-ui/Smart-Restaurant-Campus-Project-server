<?php

declare(strict_types=1);

namespace App\Support\Orders;

/**
 * The canonical order state ladder.
 *
 * There were five vocabularies for this one concept before this enum: this
 * model's nine STATUSES, the kitchen ticket's six, the console's six, a
 * ten-entry translation map in tables-server.ts, and the design file's twelve.
 * `in_kitchen` was the sharpest symptom — a value that exists in no design
 * artefact and in no handoff document, invented here and then read by three
 * surfaces that each guessed what it meant.
 *
 * Keys come from the design file rather than DATABASE.md, because the bundle's
 * own rule is that the file wins where the two disagree, and they disagree on
 * four: the file has `enroute`, `handed` and `topay` where the document has
 * `out_for_delivery`, `delivered`, and no waiting-to-pay state at all.
 * `comped` is the one addition — the file omits it, DECISIONS Q8 requires it,
 * and a comp is not a void: different money, different stock, different
 * revenue, and collapsing them makes the loss-prevention screen and the P&L
 * both wrong.
 *
 * The display words live in packages/i18n, keyed on (state, audience). This
 * enum deliberately carries no Uzbek: a state that reaches a screen as a
 * sentence has already lost the translation the other two audiences needed.
 * `OrderStateLadderTest` asserts the two files still agree.
 */
enum OrderState: string
{
    case Draft = 'draft';
    case Placed = 'placed';
    case Accepted = 'accepted';
    case Cooking = 'cooking';
    case Ready = 'ready';
    case Served = 'served';
    case Enroute = 'enroute';
    case Handed = 'handed';
    case ToPay = 'topay';
    case Paid = 'paid';
    case Voided = 'voided';
    case Refunded = 'refunded';
    case Comped = 'comped';

    /**
     * A bill nobody can add to any more.
     *
     * Three of them, not one, because the money, the stock and the revenue all
     * differ: a void moves nothing, a refund is negative revenue and does not
     * return stock, and a comp consumes stock and books as marketing cost.
     */
    public function isTerminal(): bool
    {
        return match ($this) {
            self::Paid, self::Voided, self::Refunded, self::Comped => true,
            default => false,
        };
    }

    public function isOpen(): bool
    {
        return ! $this->isTerminal();
    }

    /**
     * The channels this state can occur on.
     *
     * A dine-in bill is never `enroute` and a delivery never reaches `topay` —
     * the guest paid before the courier left. Without this the ladder would
     * have to be six ladders, which is how it fragmented the first time.
     *
     * @return list<OrderChannel>
     */
    public function channels(): array
    {
        return match ($this) {
            self::Draft, self::ToPay, self::Served => [OrderChannel::DineIn],
            self::Enroute => [OrderChannel::Delivery],
            self::Handed => [OrderChannel::Delivery, OrderChannel::Pickup],
            default => [OrderChannel::DineIn, OrderChannel::Delivery, OrderChannel::Pickup],
        };
    }

    public function appliesTo(OrderChannel $channel): bool
    {
        return in_array($channel, $this->channels(), true);
    }

    /**
     * Where this state may go next.
     *
     * Enforced rather than advisory: `transitionTo()` used to accept any value
     * that was in the list, so a bill could go from `draft` straight to `paid`
     * without a kitchen ticket ever existing, and the only thing stopping it
     * was that no screen offered the button.
     *
     * The three closing moves are reachable from anywhere still open, because
     * a manager voids a bill at whatever point the guest walked out.
     *
     * @return list<OrderState>
     */
    public function allowedNext(): array
    {
        $closing = [self::Voided, self::Comped];

        return match ($this) {
            self::Draft => [self::Placed, ...$closing],
            self::Placed => [self::Accepted, self::Cooking, ...$closing],
            self::Accepted => [self::Cooking, ...$closing],
            self::Cooking => [self::Ready, ...$closing],
            self::Ready => [self::Served, self::Enroute, self::Handed, ...$closing],
            self::Served => [self::ToPay, self::Paid, ...$closing],
            self::Enroute => [self::Handed, ...$closing],
            self::Handed => [self::Paid, ...$closing],
            self::ToPay => [self::Paid, ...$closing],
            // Paid is not the end of the story: money can still come back.
            self::Paid => [self::Refunded],
            self::Voided, self::Refunded, self::Comped => [],
        };
    }

    public function canMoveTo(self $next): bool
    {
        return in_array($next, $this->allowedNext(), true);
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $s): string => $s->value, self::cases());
    }

    /** @return list<string> */
    public static function openValues(): array
    {
        return array_values(array_map(
            static fn (self $s): string => $s->value,
            array_filter(self::cases(), static fn (self $s): bool => $s->isOpen()),
        ));
    }
}
