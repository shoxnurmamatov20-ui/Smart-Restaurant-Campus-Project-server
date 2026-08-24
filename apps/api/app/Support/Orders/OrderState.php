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
            // A courier is a courier whether it is ours or an aggregator's.
            self::Enroute => [OrderChannel::Delivery, OrderChannel::Aggregator],
            self::Handed => [
                OrderChannel::Takeaway,
                OrderChannel::Delivery,
                OrderChannel::Aggregator,
            ],
            default => OrderChannel::cases(),
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
     * So are the two settling moves, and that needs saying because the first
     * version of this table did not allow them. It put `paid` at the end of the
     * fulfilment chain — reachable only from `served`, `handed` or `topay` —
     * which is table service and nothing else. At a counter the guest pays
     * before a single pan is hot, and `Modules/Pos` names fast food and bar as
     * two of its four modes, so pay-first is not an edge case here; for two of
     * four modes it is the only case. A bill fired and paid in one action moved
     * `draft → placed → paid`, and that second step was refused: ten till tests
     * and four bill-registry tests failed on `Hisobni yopib bo'lmadi`, which
     * read as a broken till rather than as this table having an opinion about
     * when money arrives.
     *
     * Paying early does not lose the food. Fulfilment is tracked on the kitchen
     * ticket, which carries its own status and its own lifecycle; the design
     * file says the same thing by giving `paid`, `topay`, `handed` and `enroute`
     * a null kitchen label — the kitchen audience never renders the bill's
     * payment state, because the kitchen is not waiting on it. An order at
     * `paid` with a ticket still `cooking` is the normal state of every fast
     * food counter in the world.
     *
     * What is still enforced is the fulfilment order itself: no `placed → ready`
     * with nothing cooked, no `draft → served`, no going back once refunded. The
     * ladder's job is to refuse the impossible, not to encode one venue's
     * payment policy — and which point in the meal money arrives at is policy.
     *
     * `topay` follows the same rule for a smaller reason: the design file's own
     * staff pipeline is placed → accepted → cooking → ready → topay → paid,
     * which skips `served` entirely. A table that refused `ready → topay` was
     * refusing the sequence its own screens draw.
     *
     * `draft` is the one open state with no path to money, and that is not an
     * oversight: a draft has not been fired, so its lines are not confirmed, and
     * presenting a bill for it would be asking to be paid for an order nobody
     * has agreed to yet. The till fires first — one action, two steps.
     *
     * @return list<OrderState>
     */
    public function allowedNext(): array
    {
        $closing = [self::Voided, self::Comped];
        $settling = [self::ToPay, self::Paid, ...$closing];

        return match ($this) {
            self::Draft => [self::Placed, ...$closing],
            self::Placed => [self::Accepted, self::Cooking, ...$settling],
            self::Accepted => [self::Cooking, ...$settling],
            self::Cooking => [self::Ready, ...$settling],
            self::Ready => [self::Served, self::Enroute, self::Handed, ...$settling],
            self::Served => $settling,
            self::Enroute => [self::Handed, ...$settling],
            self::Handed => $settling,
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
