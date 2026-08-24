<?php

declare(strict_types=1);

namespace Modules\Pos\Sync;

/**
 * The six ways a till's offline queue can disagree with the world it comes back to.
 *
 * Six, and not one generic "sync failed", because they are six different
 * questions and only a human can answer them. A failure a screen cannot phrase
 * is a failure a cashier resolves by tapping Retry until the queue empties or
 * they give up — and the queue holds real money.
 *
 * What makes something a conflict rather than an error: the write was VALID when
 * the cashier made it, and the world moved underneath. A malformed payload is a
 * bug, a closed bill is a conflict. That distinction is why these come back as
 * 409 with options rather than 422 with a sentence.
 *
 * ---------------------------------------------------------------------------
 * The options are a contract with the console
 *
 * Each kind names the choices a human actually has, as stable ids. The screen
 * renders them (translations live in packages/i18n, keyed `pos.conflict.*`), the
 * person picks one, and the till sends it back to `POST sync/resolve`. Adding an
 * option here without a resolver is how a screen ends up offering a button that
 * does nothing, so {@see ConflictResolution} implements every id below or says
 * out loud which module has to move first.
 */
enum ConflictKind: string
{
    /**
     * The bill was closed while this till was away.
     *
     * Another terminal settled table 12 and the queue is still holding two
     * lines for it. The lines are real — the guest ate them — so discarding is
     * the one answer that is usually wrong, and it is offered last.
     */
    case BillSettled = 'bill_settled';

    /**
     * The bill is already paid, and this queued tender would charge again.
     *
     * The most expensive one to get wrong in either direction: apply it and the
     * guest is charged twice, drop it silently and the drawer is short by a
     * meal. Both tills genuinely took a payment as far as their operators knew.
     */
    case PaymentDuplicate = 'payment_duplicate';

    /**
     * The dish went on the stop list while the till was offline.
     *
     * Note what this is NOT: a guest being sold something unavailable. The food
     * was cooked and carried out at eight o'clock; the kitchen ran out at nine.
     * Refusing the sale now means the stock left the building and no money
     * arrived, which is the version an inventory count cannot explain.
     */
    case ItemUnavailable = 'item_unavailable';

    /**
     * The price on the queued line is not the price in the catalogue now.
     *
     * A happy hour ended, or a manager repriced the board. The guest was told a
     * number and paid it, so the receipt and the catalogue disagree about a sale
     * that already happened — and only a person can say which one the books
     * should carry.
     */
    case PriceMoved = 'price_moved';

    /**
     * The table already has a live bill that this till has never seen.
     *
     * Two waiters, one table, one dead router. Neither did anything wrong and
     * neither bill is the "real" one.
     */
    case TableTaken = 'table_taken';

    /**
     * The money belongs to a drawer that has already been counted and sealed.
     *
     * The subtle one, and the one most likely to be resolved wrongly by reflex.
     * A cash sale at 23:50 that never reached the server puts real notes in the
     * drawer; the Z at 00:10 counts them and reports an unexplained overage.
     * Booking the sale into TODAY's shift then counts the same money twice —
     * once as yesterday's surplus, once as today's takings. The honest
     * resolution is usually to amend the shift that holds the notes.
     */
    case ShiftClosed = 'shift_closed';

    /**
     * What a person may choose, as ids the console renders and the resolver
     * accepts. Order matters: the first is the one a screen should default to.
     *
     * @return list<string>
     */
    public function options(): array
    {
        return match ($this) {
            // Reopening is deliberately first and deliberately expensive — it
            // needs a manager, because it is the operation that lets a settled
            // bill grow after the money has been counted.
            self::BillSettled => ['reopen', 'new_bill', 'discard'],

            // One sale, one payment. `refund_duplicate` exists for the case the
            // guest really did pay twice — both tills took a card — and it is
            // second because that case is rarer than the queue simply holding a
            // copy of the payment the other till already took.
            self::PaymentDuplicate => ['discard', 'refund_duplicate'],

            // `keep` first: the dish was served. See the case note.
            self::ItemUnavailable => ['keep', 'substitute', 'void_line'],

            // The guest was told a price and paid it. Honouring it is the
            // default because the alternative rewrites what happened.
            self::PriceMoved => ['honour_quoted', 'reprice'],

            self::TableTaken => ['merge', 'separate_bill', 'move_table'],

            // `amend_closed` first, against the reflex: the notes are in the
            // sealed drawer, so that is the shift whose figures are wrong.
            self::ShiftClosed => ['amend_closed', 'post_to_current'],
        };
    }

    /**
     * The catalogue code this kind answers with.
     *
     * One per kind rather than a single `pos.sync_conflict`, so a client can
     * branch on the code alone — the same reason every other refusal in this
     * platform has its own. `conflict_kind` travels in the meta as well, for a
     * client that would rather switch on one field than on six codes.
     */
    public function code(): string
    {
        return 'pos.conflict_'.$this->value;
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $kind): string => $kind->value, self::cases());
    }
}
