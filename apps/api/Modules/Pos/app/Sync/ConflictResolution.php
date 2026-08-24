<?php

declare(strict_types=1);

namespace Modules\Pos\Sync;

use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillRegistry;
use App\Support\Errors\ApiException;
use Modules\Pos\Models\TerminalSession;
use RuntimeException;

/**
 * Turning a person's answer into a write.
 *
 * {@see ConflictKind} asks six questions and names the choices for each;
 * this is where those choices become something that happens. Every option id
 * that enum lists is handled here, and the match is exhaustive on purpose: an
 * option offered to a cashier that no branch implements is a button that spins
 * and does nothing, which is worse than not offering it.
 *
 * ---------------------------------------------------------------------------
 * The shape, and why almost everything is a rewrite
 *
 * A resolution does not re-run the queue's logic. It produces a
 * {@see ResolvedEntry} — the same action with a corrected payload, or an
 * instruction to drop it — and the caller hands that to
 * {@see SyncDispatcher::apply()}. Two consequences fall out of that and both
 * are the point:
 *
 *   **The check that raised the conflict is not asked again.** `apply()` never
 *   ran conflict checks; only `conflictsFor()` does, and the resolve path does
 *   not call it. So "keep the line even though the dish is stopped" applies
 *   cleanly rather than bouncing off the same stop list a second time. Nothing
 *   needs a suppression flag, which is the design that would have rotted.
 *
 *   **A resolution cannot invent a new kind of write.** It can change a dish id,
 *   a price, a table or a bill; it cannot turn a line into a payment. That
 *   containment is what keeps this file reviewable — the blast radius of a wrong
 *   answer is one queued entry, not the queue.
 *
 * Two options do have to act before the rewrite, because the entry has nowhere
 * to land until they do: `reopen` unseals a settled bill, and `new_bill` opens a
 * fresh one. Both are recorded operations on the Orders side with a reason
 * attached, and both are the expensive answer their conflict offers first
 * precisely so a screen defaults to the careful one.
 *
 * ---------------------------------------------------------------------------
 * What this does NOT decide
 *
 * Whether the person is allowed to choose at all. `reopen` and `amend_closed`
 * both need a manager, and the ladder that says so is `ApprovalGate` at the
 * controller. Checking it here as well would put the permission model in two
 * places and let them disagree; a service that refuses a manager because it
 * cannot see their approval is the version that gets bypassed.
 */
final class ConflictResolution
{
    /**
     * Extra data an option cannot work without, by option id.
     *
     * Declared rather than checked inline so the request validator and this
     * class read from one list. An option that needs a value and did not get one
     * is a client bug, and it fails with the field name in the envelope rather
     * than as a null somewhere downstream.
     *
     * @var array<string, string>
     */
    public const REQUIRES = [
        'substitute' => 'substitute_menu_item_id',
        'move_table' => 'table_id',
        'merge' => 'into_bill_id',
    ];

    /**
     * Orders only, and deliberately no ledger.
     *
     * `refund_duplicate` moves money, and it is the one answer this class cannot
     * finish: the refund needs the payment ids that only exist once the entry has
     * been applied. So it returns `refundAfter` and the caller reverses what the
     * dispatcher produced. Holding a `TillLedger` here to do half of that would
     * put money in two files for one decision.
     */
    public function __construct(
        private readonly BillRegistry $bills,
    ) {}

    /**
     * @param array<string, mixed> $payload The entry exactly as it was queued.
     * @param array<string, mixed> $with What the person supplied alongside their
     *                                   choice — a substitute dish, a table, a reason.
     *
     * @throws ApiException when the option is not one this kind offers
     */
    public function resolve(
        ConflictKind $kind,
        string $option,
        string $action,
        array $payload,
        array $with,
        TerminalSession $session,
    ): ResolvedEntry {
        if (! in_array($option, $kind->options(), true)) {
            /*
             * Refused by name rather than ignored. A client sending an option
             * this kind does not offer has read a stale copy of the contract,
             * and silently falling through to a default would resolve somebody's
             * money the wrong way on the strength of a typo.
             */
            throw ApiException::of('pos.conflict_option_unknown', field: 'option', meta: [
                'conflict_kind' => $kind->value,
                'option' => $option,
                'options' => $kind->options(),
            ]);
        }

        $this->requireExtras($option, $with);

        return match ($kind) {
            ConflictKind::BillSettled => $this->billSettled($option, $action, $payload, $with),
            ConflictKind::PaymentDuplicate => $this->paymentDuplicate($option, $action, $payload),
            ConflictKind::ItemUnavailable => $this->itemUnavailable($option, $action, $payload, $with),
            ConflictKind::PriceMoved => $this->priceMoved($option, $action, $payload),
            ConflictKind::TableTaken => $this->tableTaken($option, $action, $payload, $with),
            ConflictKind::ShiftClosed => $this->shiftClosed($option, $action, $payload, $with, $session),
        };
    }

    // ============ The six ============

    /**
     * Somebody settled the bill while this till was away.
     *
     * @param array<string, mixed> $payload
     * @param array<string, mixed> $with
     */
    private function billSettled(string $option, string $action, array $payload, array $with): ResolvedEntry
    {
        $billId = (int) ($payload['bill_id'] ?? 0);

        return match ($option) {
            /*
             * Unseal it and let the entry land where it was always meant to.
             *
             * The reason is written onto the bill because this is the operation
             * an auditor looks for first: a bill that grew after the money was
             * counted. "Offline queue" with no more detail would be the answer
             * that makes the trail useless, so the person's own words ride along.
             */
            'reopen' => $this->reopened($billId, $action, $payload, $with),

            /*
             * A second bill on the same table, carrying the lines the first one
             * closed too early to take.
             *
             * The guest ate them and somebody has to be charged. Keeping them on
             * a fresh bill is what a waiter would do with a paper pad, and it
             * leaves the settled bill exactly as the guest signed for it.
             */
            'new_bill' => $this->onANewBill($billId, $action, $payload),

            // Offered last, and the answer that is usually wrong: the lines are
            // real food that left the kitchen.
            default => ResolvedEntry::discard($action, $payload, 'bill_settled:discard'),
        };
    }

    /**
     * The bill is already paid and this queued tender would charge again.
     *
     * @param array<string, mixed> $payload
     */
    private function paymentDuplicate(string $option, string $action, array $payload): ResolvedEntry
    {
        if ($option === 'discard') {
            // The ordinary case: the other till took the money and this queue is
            // holding a copy of the same event.
            return ResolvedEntry::discard($action, $payload, 'payment_duplicate:discard');
        }

        /*
         * Both tills really did take money, and the guest is out of pocket.
         *
         * Recorded and then reversed, rather than simply not recorded. The card
         * capture exists at the acquirer whatever this system decides; a
         * reconciliation against the bank statement has to find it here too, and
         * a refund with no payment behind it is a movement an accountant cannot
         * explain. Two rows that net to nothing is the honest shape of what
         * physically happened.
         */
        return ResolvedEntry::recordAndReverse(
            $action,
            $payload,
            'payment_duplicate:refund_duplicate',
        );
    }

    /**
     * The dish went on the stop list while the till was offline.
     *
     * @param array<string, mixed> $payload
     * @param array<string, mixed> $with
     */
    private function itemUnavailable(string $option, string $action, array $payload, array $with): ResolvedEntry
    {
        return match ($option) {
            /*
             * The default, against the reflex. The food was cooked and carried
             * out at eight; the kitchen ran out at nine. Refusing the sale now
             * means the stock left the building and no money arrived, which is
             * the version an inventory count cannot explain.
             */
            'keep' => ResolvedEntry::apply(
                $action,
                /*
                 * Orders refuses a stopped dish, and it is right to for every
                 * ordinary caller. This is the one that is not ordering food but
                 * recording food already served, and the reason travels onto the
                 * line so the row itself answers "why is there a sale of a dish
                 * we had stopped" — see `BillRegistry::addLine()`.
                 */
                array_merge($payload, [
                    'served_before_stop' => $this->reasonFrom(
                        $with,
                        'Oflayn navbat: taom stop-listdan oldin berilgan.',
                    ),
                ]),
                'item_unavailable:keep',
            ),

            'substitute' => ResolvedEntry::apply(
                $action,
                /*
                 * The price is dropped along with the dish id.
                 *
                 * A quoted price belongs to the dish it was quoted for. Carrying
                 * it onto a substitute charges the guest for lamb at the price of
                 * chicken, or the reverse — and the reverse is the one that ends
                 * up in a complaint. With no override the catalogue decides,
                 * which is the only defensible answer for a dish nobody quoted.
                 */
                array_merge($payload, [
                    'menu_item_id' => (int) $with['substitute_menu_item_id'],
                    'unit_price' => null,
                ]),
                'item_unavailable:substitute',
            ),

            default => ResolvedEntry::discard($action, $payload, 'item_unavailable:void_line'),
        };
    }

    /**
     * The price moved between the quote and the queue draining.
     *
     * @param array<string, mixed> $payload
     */
    private function priceMoved(string $option, string $action, array $payload): ResolvedEntry
    {
        if ($option === 'honour_quoted') {
            // The guest was told a number and paid it. The entry already carries
            // that number, so honouring it is the entry untouched.
            return ResolvedEntry::apply($action, $payload, 'price_moved:honour_quoted');
        }

        /*
         * Drop the override and let the catalogue answer.
         *
         * `null` rather than unsetting the key, because the payload is written
         * back onto the queue entry and a missing key reads as "the till never
         * quoted a price" — which is a different fact and would stop the
         * conflict being raised at all if this were ever replayed.
         */
        return ResolvedEntry::apply(
            $action,
            array_merge($payload, ['unit_price' => null]),
            'price_moved:reprice',
        );
    }

    /**
     * Two waiters, one table, one dead router.
     *
     * @param array<string, mixed> $payload
     * @param array<string, mixed> $with
     */
    private function tableTaken(string $option, string $action, array $payload, array $with): ResolvedEntry
    {
        return match ($option) {
            /*
             * There is nothing to open: the table's live bill becomes this
             * entry's answer, and everything queued behind it that pointed at
             * "the bill this entry opened" now points at that one.
             *
             * Discarded rather than applied, and the distinction matters. The
             * entry's *effect* is achieved — a bill exists for these guests —
             * so opening a second one would be the one thing merging was chosen
             * to avoid.
             */
            'merge' => ResolvedEntry::discard(
                $action,
                array_merge($payload, ['merged_into_bill_id' => (int) $with['into_bill_id']]),
                'table_taken:merge',
            ),

            /*
             * Open it anyway. A table legitimately carries several bills — two
             * couples on one six-top is not an error — and `BILLS_PER_TABLE` is
             * what stops it becoming absurd.
             */
            'separate_bill' => ResolvedEntry::apply($action, $payload, 'table_taken:separate_bill'),

            default => ResolvedEntry::apply(
                $action,
                array_merge($payload, [
                    'table_id' => (int) $with['table_id'],
                    // The label goes with the id or it names the old table on the
                    // new one, which is what a runner reads off the docket.
                    'table_label' => isset($with['table_label']) ? (string) $with['table_label'] : null,
                ]),
                'table_taken:move_table',
            ),
        };
    }

    /**
     * The money belongs to a drawer that has already been counted and sealed.
     *
     * @param array<string, mixed> $payload
     * @param array<string, mixed> $with
     */
    private function shiftClosed(
        string $option,
        string $action,
        array $payload,
        array $with,
        TerminalSession $session,
    ): ResolvedEntry {
        if ($option === 'amend_closed') {
            $sealed = (int) ($payload['shift_id'] ?? 0);

            if ($sealed <= 0) {
                // Only reachable if the entry that raised this conflict has been
                // rewritten since. Refused rather than guessed: there is no safe
                // default for which drawer a night's takings belong to.
                throw new RuntimeException('Tuzatiladigan smena ko\'rsatilmagan.');
            }

            return ResolvedEntry::apply(
                $action,
                $payload,
                'shift_closed:amend_closed',
                shift: new ShiftChoice(
                    shiftId: $sealed,
                    amendReason: $this->reasonFrom($with, 'Oflayn navbat: pul shu smenada olingan.'),
                    decidedByUserId: (int) $session->user_id,
                ),
            );
        }

        /*
         * Post it to whatever drawer is open now.
         *
         * Defensible when the notes never reached the sealed till — a card sale,
         * or cash the cashier carried over — and wrong when they did, which is
         * why it is offered second. No `ShiftChoice`: with none, the dispatcher
         * resolves the session's own shift, which is exactly "the drawer open
         * now" and needs no second way of saying so.
         */
        return ResolvedEntry::apply(
            $action,
            // The stale pointer goes, or the same conflict is raised on replay.
            array_merge($payload, ['shift_id' => null]),
            'shift_closed:post_to_current',
        );
    }

    // ============ The two that act first ============

    /**
     * @param array<string, mixed> $payload
     * @param array<string, mixed> $with
     */
    private function reopened(int $billId, string $action, array $payload, array $with): ResolvedEntry
    {
        $this->bills->reopen(
            $billId,
            $this->reasonFrom($with, 'Oflayn navbat: yopilgan hisobga yozuv.'),
        );

        return ResolvedEntry::apply($action, $payload, 'bill_settled:reopen');
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function onANewBill(int $billId, string $action, array $payload): ResolvedEntry
    {
        $settled = $this->bills->find($billId);

        if ($settled === null) {
            throw new RuntimeException("#{$billId} hisobi topilmadi.");
        }

        $fresh = $this->openLike($settled);

        return ResolvedEntry::apply(
            $action,
            array_merge($payload, ['bill_id' => $fresh->id]),
            'bill_settled:new_bill',
        );
    }

    /**
     * A bill for the same guests, at the same table, on the same channel.
     *
     * The waiter is carried over because the lines are theirs — the tips and the
     * sales report both read that field, and attributing a night's work to
     * whoever happened to drain the queue is how a waiter loses a shift's
     * commission to an outage.
     */
    private function openLike(Bill $settled): Bill
    {
        return $this->bills->open(
            channel: $settled->channel,
            tableId: $settled->tableId,
            tableLabel: $settled->tableLabel,
            waiterUserId: $settled->waiterUserId,
            customerId: $settled->customerId,
            guests: max(1, $settled->guestsCount),
        );
    }

    // ============ Internals ============

    /**
     * @param array<string, mixed> $with
     */
    private function requireExtras(string $option, array $with): void
    {
        $needed = self::REQUIRES[$option] ?? null;

        if ($needed === null) {
            return;
        }

        if (! isset($with[$needed]) || (int) $with[$needed] <= 0) {
            throw ApiException::of('pos.conflict_option_incomplete', field: $needed, meta: [
                'option' => $option,
                'required' => $needed,
            ]);
        }
    }

    /**
     * The person's own words, or a sentence that at least says where it came from.
     *
     * Never empty. A reopened bill or an amended shift with a blank reason is a
     * row an auditor cannot tell from a mistake, and the two operations this
     * feeds are the two most abusable in the module.
     *
     * @param array<string, mixed> $with
     */
    private function reasonFrom(array $with, string $fallback): string
    {
        $given = isset($with['reason']) ? trim((string) $with['reason']) : '';

        return $given === '' ? $fallback : $given;
    }
}
