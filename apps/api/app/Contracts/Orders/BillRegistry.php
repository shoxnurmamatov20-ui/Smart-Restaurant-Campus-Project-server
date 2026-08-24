<?php

declare(strict_types=1);

namespace App\Contracts\Orders;

use App\Contracts\Tables\FloorBoard;
use App\Support\Orders\BillSplit;
use Illuminate\Support\Carbon;
use RuntimeException;

/**
 * The one way to work on a bill from outside the Orders module.
 *
 * The POS is the reason this exists. A till has to open a bill, add lines to it,
 * split it between four guests, move it to another table and finally close it —
 * and if it did that by importing `Modules\Orders\Models\Order`, the two modules
 * could never be deployed or reasoned about separately, and every schema change
 * in Orders would be a change to the till.
 *
 * Everything here is expressed in ids and tiyin. Nothing leaks an Eloquent
 * model. Money is never accepted from the caller where it can be derived:
 * `addLine` takes a quantity and lets Orders decide the price, because a client
 * that can name its own price is a client that can undercharge.
 *
 * Implemented by Orders, resolved through the container, and always scoped to
 * the current restaurant by the caller's tenant context.
 */
interface BillRegistry
{
    /**
     * How many bills one table may be paying on at once.
     *
     * Four, from the design's cart. Not a limit for its own sake: it is how
     * many segments fit across a tablet's cart column while each stays readable
     * at arm's length, and a table needing a fifth is a table that should have
     * been seated as two.
     *
     * On the CONTRACT rather than on the Eloquent implementation, because the
     * POS validates against it and a module may not import another module —
     * a number two modules must agree on is part of what they agree on.
     */
    public const BILLS_PER_TABLE = 4;

    /**
     * Open a new bill on a channel.
     *
     * @param  string  $channel  One of dine_in|takeaway|delivery|aggregator.
     */
    public function open(
        string $channel,
        ?int $tableId = null,
        ?string $tableLabel = null,
        ?int $waiterUserId = null,
        ?int $customerId = null,
        int $guests = 1,
    ): Bill;

    /** One bill by id, or null if this restaurant has no such bill. */
    public function find(int $billId): ?Bill;

    /**
     * Who served each of these bills, and how many they sat.
     *
     * For the till's tip sheet: a tip is a column on `finance.payments`, the
     * server who earned it is on the order, and Finance may not read Orders
     * (`ModuleBoundaryTest`). One call rather than `find()` in a loop —
     * a busy evening is three hundred bills and this runs while a cashier
     * waits to close the drawer.
     *
     * @param  list<int>  $billIds
     * @return array<int, array{waiter_user_id: int|null, waiter_name: string|null, guests: int}>
     */
    public function servedBy(array $billIds): array;

    /**
     * Add a dish to an open bill.
     *
     * The price is read from the catalogue and snapshotted onto the line.
     * `$unitPriceOverride` exists for happy-hour and manager price overrides and
     * is the only way a caller may set money directly.
     *
     * `$seatNo` and `$billNo` default to 1 rather than being required, and the
     * default is honest for the two thirds of service that never splits
     * anything: a counter sale has one guest and one bill. Where it matters —
     * a table of four on two bills — the caller says so per line, as it is
     * taken, which is the whole reason Q4 put the seat on the line rather than
     * leaving the split to arithmetic at the end of the meal.
     *
     * `$modifierChoiceIds` are option ids from `MenuCatalog::questionsFor()`.
     * They are priced and validated through the catalogue, never trusted from
     * the client: the price goes onto the line frozen, and a choice that is not
     * offered for this dish or breaks its group's rules is refused rather than
     * dropped.
     *
     * @param  array<int, int>  $modifierChoiceIds
     *
     * ---------------------------------------------------------------------
     * Recording food that was already served
     *
     * A stopped dish is refused here, and that refusal is right for every
     * ordinary caller: 86 means the kitchen cannot cook it, and a waiter must
     * not promise a guest something that will never arrive.
     *
     * It is wrong for exactly one caller. An offline queue draining the next
     * morning is not ordering food — it is recording food that was cooked at
     * eight and carried to a table, before the kitchen ran out at nine. Refusing
     * that line means the stock left the building and no money arrived, which is
     * the version an inventory count cannot explain and the version a manager
     * blames on a person.
     *
     * `$servedBeforeStop` is how that caller says so, and it is a sentence
     * rather than a boolean on purpose: it is written onto the line, so the
     * answer to "why is there a sale of a dish we had stopped" is on the row
     * itself rather than inferred from timestamps six months later. A flag would
     * have been a bypass; a reason is a record.
     *
     * @throws RuntimeException when the bill is closed, the dish is unknown, a
     *                          modifier choice is not allowed for it, or the dish
     *                          is stopped and no `$servedBeforeStop` was given
     */
    /**
     * @param  string|null  $servedBeforeStop  Why this line may carry a dish that is
     *                                         on the stop list. See below — null is
     *                                         the normal case and refuses.
     */
    public function addLine(
        int $billId,
        int $menuItemId,
        int $quantity = 1,
        ?int $unitPriceOverride = null,
        ?string $note = null,
        int $seatNo = 1,
        int $billNo = 1,
        array $modifierChoiceIds = [],
        ?string $servedBeforeStop = null,
    ): Bill;

    /**
     * Take a line off a bill, with a reason.
     *
     * Voiding is not deletion: the line is cancelled and stays visible, because
     * "which lines were removed, by whom, and why" is the single most useful
     * question in a restaurant fraud investigation.
     *
     * @throws RuntimeException when the bill is closed or the line is not on it
     */
    public function voidLine(int $billId, int $lineId, string $reason): Bill;

    /**
     * Apply a discount to the whole bill, in tiyin.
     *
     * @param  int  $amountTiyin  Positive; it is subtracted from the total.
     *
     * @throws RuntimeException when the bill is closed or the discount exceeds the subtotal
     */
    public function applyDiscount(int $billId, int $amountTiyin, string $reason): Bill;

    /*
     * There is deliberately no applyServiceCharge().
     *
     * There was one, taking an amount in tiyin, and it collided with the rule
     * the moment the rule existed: totals are recalculated on every change and
     * derive the charge from the channel and the restaurant's own percentage, so
     * whatever a caller wrote was overwritten on the next line added. Two
     * mechanisms for one number, one of them silently losing.
     *
     * The rule wins. A charge a client can set to any figure is a charge that
     * can be 90%, and DECISIONS Q2 is not a default — it is the rule: ten
     * percent, dine-in only, at whatever rate the restaurant configured. A
     * different rate is a setting; a party-size surcharge would be another rule
     * here, not an amount passed in from a screen.
     */

    /**
     * Send the bill to the kitchen.
     *
     * @throws RuntimeException when the bill has no lines or is already closed
     */
    public function send(int $billId): Bill;

    /**
     * Move some lines onto a new bill.
     *
     * The classic "four people, four cards" case. The new bill inherits the
     * table and the waiter; the original keeps whatever was not moved.
     *
     * @param  array<int, int>  $lineIds
     *
     * @throws RuntimeException when a line is not on the bill, or all lines would move
     */
    public function split(int $billId, array $lineIds): Bill;

    /**
     * Divide a bill into equal shares of MONEY, not of food.
     *
     * The other two buttons on the design's split sheet. `split()` above hands
     * lines over — four friends who each ate their own thing — and it cannot
     * express "four equal bills", because there are no lines to move: the
     * division is by money. So the server mints the siblings itself.
     *
     * What comes back is the whole family, the bill that was split first. Every
     * one of them carries a fixed share rather than a sum of its lines, and the
     * shares add back up to what the bill was worth — see
     * {@see BillSplit} for where the rounding lands and
     * why the flooring is not a rounding.
     *
     * The parent keeps every line. The kitchen cooked them and the shelf paid
     * for them, so food cost is joined through the parent; the siblings hold no
     * lines and exist to be settled and printed. That means `addLine()` refuses
     * a bill that has been divided: ordering another coffee after the money has
     * been carved up is undoing the split, not adding to a share.
     *
     * ---------------------------------------------------------------------
     * `BILLS_PER_TABLE` and this are two different numbers
     *
     * Four is how many bills may be OPENED on a table — a table needing a fifth
     * is a table that should have been seated as two. Twelve is how many people
     * may divide one of them, and it is the guest app's own stepper.
     *
     * They interact, and the interaction is right rather than a gap: a table of
     * six that splits six ways has six open bills on it and cannot open a
     * seventh until they settle. That is exactly what is true — the table is
     * mid-payment — and the shares are minted at the end of the meal.
     *
     * @param  int  $ways  2..12 — one guest is not a split, and twelve is the
     *                     guest app's own stepper.
     * @return array<int, Bill> The parent first, then each sibling in payment order.
     *
     * @throws RuntimeException when the bill is closed, empty, already part of a
     *                          split, or `$ways` is out of range
     */
    public function splitEvenly(int $billId, int $ways): array;

    /**
     * Take a named amount off a bill onto a sibling of its own.
     *
     * "Summa bo'yicha": one guest is putting in 100 000 and the table settles
     * the rest. Two bills, always — the amount, then the remainder — and the
     * amount is NOT floored to a note, because it is money somebody has already
     * handed over or typed into a card terminal.
     *
     * @param  int  $amountTiyin  Strictly greater than zero and strictly less than
     *                            the bill's total. Paying all of it is not a split.
     * @return array<int, Bill> The parent (carrying the amount) first, then the remainder.
     *
     * @throws RuntimeException when the bill is closed, already part of a split,
     *                          or the amount is not strictly inside it
     */
    public function splitAmount(int $billId, int $amountTiyin): array;

    /**
     * Move every line from one bill onto another and close the source.
     *
     * @throws RuntimeException when either bill is closed
     */
    public function merge(int $sourceBillId, int $targetBillId): Bill;

    /**
     * Move a bill to another table, another waiter, or both.
     *
     * @throws RuntimeException when the bill is closed
     */
    public function transfer(
        int $billId,
        ?int $tableId = null,
        ?string $tableLabel = null,
        ?int $waiterUserId = null,
    ): Bill;

    /**
     * The guest has asked for the bill.
     *
     * Moves an open bill to `topay`, which is the rung every screen in the
     * building reads as "this table is waiting to pay rather than eating". No
     * money moves and none is promised — that is `TillLedger`'s, and it happens
     * when somebody carries a terminal over.
     *
     * Deliberately forgiving where the rest of this interface is strict: a bill
     * the ladder will not move — a `draft` nobody has fired, because a bill with
     * no confirmed lines has nothing to present — comes back UNCHANGED rather
     * than throwing. The request is real either way: a guest tapped "hisobni
     * so'rash" and a waiter is walking over, and losing that because of the
     * bill's internal state would be answering the wrong question.
     *
     * Its own method rather than a general `transitionTo()` on this interface,
     * and that is the whole reason it exists: a caller that could name any state
     * could mark a bill `paid`, and taking money is not something a QR code at a
     * table gets to do.
     *
     * @throws RuntimeException when the bill is closed or does not exist
     */
    public function awaitPayment(int $billId): Bill;

    /**
     * The rider has picked it up, left, or handed it over.
     *
     * The one verb on this interface that is about a person outside the
     * building. It exists because a courier's phone queues `delivery_status`
     * offline and drains it through `POST /api/v1/staff/actions`, and Staff may
     * not import Orders — the same argument that put `waste_log` behind
     * `StockLedger`.
     *
     * Two writes, and both matter. The bill moves along the ladder — `enroute`
     * for "left", `handed` for "delivered" — which is what the guest's tracking
     * screen reads; and the dispatch row records WHEN, which is what a payroll
     * question and a late-delivery argument read. A caller that only moved the
     * bill would leave the console's delivery tab unable to say who has what.
     *
     * `false`, not an exception, when there is nothing to move: no such bill,
     * no delivery on it, or a status that would wind a completed drop backwards
     * because a stale queue entry arrived late. A courier's queue is a batch
     * like every other, and one entry that cannot land must not strand the
     * eleven beside it.
     *
     * @param  string  $status  One of picked|enroute|delivered|failed.
     * @param  Carbon|null  $at  When the rider did it, not when
     *                           we heard. An entry queued in a
     *                           stairwell at 19:12 and drained
     *                           at 21:00 belongs to 19:12.
     */
    public function markDelivery(int $billId, string $status, ?Carbon $at = null): bool;

    /**
     * Mark the bill paid.
     *
     * Called only after money has actually been captured — Orders has no way to
     * check that, so the caller owns the ordering.
     *
     * @throws RuntimeException when the bill is already closed
     */
    public function close(int $billId): Bill;

    /**
     * The money for this bill arrived before the food did.
     *
     * The other half of a rule `PublicOrderController` has been enforcing on
     * its own since guests could order from a phone: an online order is not
     * cooked until it is paid. It waits at `draft` with
     * `payment_state = 'pending'` — no docket, no pass, no station — because a
     * kitchen that cooks before the money lands pays for every abandoned
     * checkout. That controller's docblock names this call by name: "when it
     * is, it moves this one column and calls `send()`".
     *
     * So this is not `close()`. Closing a bill says the meal is over; this says
     * it may now begin. A prepaid delivery still has to be cooked, picked up
     * and carried, and marking it `paid` on arrival of the money would leave
     * the guest's tracking screen with nothing left to show — every rung of the
     * ladder skipped at once, and the food still forty minutes away.
     *
     * Firing is conditional on the bill still being at `draft`. A bill already
     * on a pass is left exactly where it is: this is also the call for a guest
     * who pays online halfway through a meal, and re-firing that would put a
     * second docket on a cook's rail for food already plated.
     *
     * @throws RuntimeException when the bill is closed or does not exist
     */
    public function markPrepaid(int $billId): Bill;

    /**
     * Reopen a settled bill.
     *
     * Deliberately awkward: it exists because a guest sometimes orders one more
     * coffee after the card has gone through, and it is the single most abusable
     * operation in the module. Callers are expected to have a manager's
     * authorisation in hand before calling it.
     *
     * @throws RuntimeException when the bill was never closed
     */
    public function reopen(int $billId, string $reason): Bill;

    /**
     * The bills still open on a table, newest first.
     *
     * Empty when the table is free, which is the answer a host wants and the one
     * an offline queue needs: a waiter who took an order on a dead network cannot
     * know whether somebody else seated that table meanwhile, and `find()` only
     * answers about a bill whose id you already have.
     *
     * It is also the only way anything can enforce `BILLS_PER_TABLE`. This
     * interface has documented that limit since it was written and left the check
     * to "the POS", which had no way to count — so four bills was a number in a
     * comment rather than a rule.
     *
     * Whole bills rather than a count, because the screen that uses this offers to
     * merge with one of them or open beside it, and somebody choosing between two
     * open bills needs the number, the waiter and the total to tell them apart.
     * {@see FloorBoard::tally()} when a count is all that
     * is wanted.
     *
     * @return array<int, Bill>
     */
    public function openBillsOn(int $tableId): array;

    /**
     * Cancel an open bill outright — it becomes `voided`.
     *
     * One of three ways a bill ends without money staying, and they are three
     * separate operations rather than one with a flag because they are three
     * different lines in an accountant's ledger. See `comp()` and `refund()`; a
     * caller that treats them as interchangeable will produce a Z-report nobody
     * can reconcile.
     */
    public function cancel(int $billId, string $reason): Bill;

    /**
     * The restaurant is paying for this one — it becomes `comped`.
     *
     * A dish sent back, a regular's birthday, an apology for a forty-minute wait.
     * The food WAS made and the stock WAS consumed; what did not happen is the
     * money. That is exactly why it cannot be a `cancel()`: a voided bill says the
     * sale never occurred, and food cost calculated against voided bills would show
     * a kitchen wasting ingredients on orders nobody placed.
     *
     * @throws RuntimeException when the bill is already closed
     */
    public function comp(int $billId, string $reason): Bill;

    /**
     * The money went back — the bill becomes `refunded`.
     *
     * The order side of a refund, and only the order side. `TillLedger::refund()`
     * moves the money; this moves the bill. A caller must do both, in one
     * transaction, because the state between them — money returned, bill still
     * `paid` — is the one an audit cannot explain and a guest can exploit.
     *
     * Full refunds only. A partial refund leaves the bill `paid`, because it still
     * was: that is a different operation and it arrives with credit sales.
     *
     * @throws RuntimeException when the bill was never settled
     */
    public function refund(int $billId, string $reason): Bill;
}
