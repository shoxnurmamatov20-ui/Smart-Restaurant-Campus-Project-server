<?php

declare(strict_types=1);

namespace App\Contracts\Finance;

use RuntimeException;

/**
 * The one way to move money from outside the Finance module.
 *
 * The POS opens a shift, captures tenders, pays cash out of the drawer and
 * closes with a count — but it never owns any of that. Finance does, because
 * "what was taken today" has to have exactly one answer, and a second table of
 * payments living in the till would guarantee two.
 *
 * Every amount is an integer in tiyin. `expectedCash` is never accepted from a
 * caller: the whole purpose of counting a drawer is to compare it against what
 * the system believes should be in it, and a client that could send both numbers
 * could make the difference zero.
 */
interface TillLedger
{
    /**
     * Open a cash shift with a starting float.
     *
     * @return int The cash shift id.
     *
     * @throws RuntimeException when this user already has an open shift
     */
    public function openShift(int $userId, int $openingCash = 0): int;

    /** The shift this user currently has open, if any. */
    public function openShiftFor(int $userId): ?int;

    /**
     * Close the shift against a counted drawer and return the Z-report figures.
     *
     * Takes a {@see CashCount} rather than a bare total, and the difference is the
     * point: "45 000 000 tiyin" and "nine 50 000 notes" are not the same claim. The
     * second can be checked against itself; the first can only be believed. A
     * Z-report reconciling a shortfall should be able to say which one it is
     * looking at.
     *
     * @param  string|null  $varianceReason  Why the drawer disagrees. Required by the
     *                                       closing ladder above the first threshold — a shift that will not close
     *                                       without an explanation is the only thing that makes anyone write one.
     * @param  int|null  $approvedByUserId  The manager who authorised a large
     *                                      difference. Checked against `finance.manage`, and refused when it is
     *                                      the person who counted: a signature you can give yourself is not one.
     * @param  int|null  $closedByUserId  Who counted, which is not always who opened —
     *                                    a till handed over mid-day is closed by the second cashier, and the
     *                                    self-approval check rests on knowing the difference.
     *
     * @throws RuntimeException when the shift is unknown, already closed, locked,
     *                          or the difference needs an authorisation it lacks
     */
    public function closeShift(
        int $shiftId,
        CashCount $count,
        ?string $note = null,
        ?string $varianceReason = null,
        ?int $approvedByUserId = null,
        ?int $closedByUserId = null,
    ): ShiftTotals;

    /**
     * Record money actually taken for a bill.
     *
     * @param  int  $rounding  Tiyin that cash rounding added to this tender, signed —
     *                         DECISIONS Q7. Passed in rather than computed here
     *                         because the rounding step is a property of the terminal
     *                         (a counter that deals in exact change sets it to 1), and
     *                         Finance does not know which terminal took the money. The
     *                         caller has already applied it to `$tender->amount`; this
     *                         is the audit trail for how much it moved, and what makes
     *                         the drawer still reconcile afterwards.
     * @return int The payment id.
     *
     * @throws RuntimeException when the shift is closed or the method is unknown
     */
    public function capture(
        int $shiftId,
        int $orderId,
        string $orderNumber,
        Tender $tender,
        int $rounding = 0,
    ): int;

    /**
     * Record money into a shift that has already been counted and sealed.
     *
     * The one write this interface allows into a closed shift, and it exists for
     * exactly one situation: a till sold something offline at 23:50, the Z was
     * taken at 00:10, and the queue drained the next morning. The notes are
     * physically in yesterday's sealed drawer. Yesterday's Z already counted them
     * — as an unexplained overage nobody could account for — so the shift whose
     * figures are wrong is yesterday's, and this is how they are corrected.
     *
     * **Why not just use `capture()` with the old shift id.** Because it refuses,
     * and it is right to: every ordinary caller writing into a sealed drawer is a
     * bug, and relaxing that check for all of them to serve one case would remove
     * the guard that makes a Z-report mean anything. This is a separate door with
     * its own name, its own reason and its own audit trail.
     *
     * **Why not post it to today instead.** That is the reflex and it counts the
     * same banknotes twice — once as yesterday's surplus, once as today's takings
     * — so a week of this leaves two shifts wrong instead of one. The choice
     * between the two is a human's; `ConflictKind::ShiftClosed` is where it is
     * asked, and it defaults to amending precisely because the reflex is wrong.
     *
     * @param  string  $reason  Why a sealed shift is being written into. Not
     *                          optional: an amendment with no explanation is
     *                          indistinguishable from a mistake when it is read
     *                          back six months later in an audit.
     * @param  int|null  $amendedByUserId  Who authorised it. Recorded, never
     *                                     checked here — Finance cannot see the
     *                                     POS's approval ladder, so the caller
     *                                     owns the permission.
     * @return int The payment id.
     *
     * @throws RuntimeException when the shift is unknown, is still open, or the
     *                          method is unknown. A shift that never closed must
     *                          go through `capture()`, or the audit trail claims
     *                          an amendment that was an ordinary sale.
     */
    public function amendClosedShift(
        int $shiftId,
        int $orderId,
        string $orderNumber,
        Tender $tender,
        string $reason,
        ?int $amendedByUserId = null,
        int $rounding = 0,
    ): int;

    /**
     * Reverse a payment, and say what that did to the bill behind it.
     *
     * A refund is two halves that must move together: the money goes back
     * (Finance) and the bill stops being a sale (Orders). Neither module can see
     * the other, so the half that happens first hands over enough for the caller
     * to complete the second in the same transaction. {@see RefundResult}.
     *
     * Two of those facts a caller must not work out for itself. Whether the order
     * is now FULLY refunded depends on what is still captured against it — a table
     * that paid with two cards and asks for one back is a partial refund and the
     * bill is still a sale. And how much cash left the drawer is not the refunded
     * amount: a card refund reaches a bank days later and the box never opens.
     *
     * @param  int|null  $refundingShiftId  The shift paying it out, which is not
     *                                      necessarily the one that took it — yesterday's takings come
     *                                      out of today's drawer, and that shift's Z-report is the one
     *                                      that has to account for it. Null resolves it from the caller's
     *                                      own open shift.
     *
     * @throws RuntimeException when the payment is unknown, already refunded, or
     *                          the paying shift cannot be resolved
     */
    public function refundPayment(
        int $paymentId,
        string $reason,
        ?int $refundingShiftId = null,
    ): RefundResult;

    /**
     * Money leaving the drawer that is not a refund: a collection, a supplier
     * paid in cash, a tip-out.
     *
     * Recording it here rather than in the till is what keeps the Z-report
     * honest — the expected-cash calculation already subtracts cash paid out,
     * so a collection stops looking like a shortfall without anyone touching
     * that arithmetic.
     *
     * @return int The expense id.
     */
    public function recordCashOut(int $shiftId, int $amount, string $description): int;

    /**
     * Money going INTO the drawer that is not a sale: a float top-up, a correction
     * after a miscount, small notes brought for change.
     *
     * The mirror of `recordCashOut()`, and its absence was a real defect. The till
     * recorded these as drawer movements and nothing else, so a manager bringing
     * 50 000 so'm of change at six o'clock produced a shift that closed exactly
     * 50 000 over — and the cashier looked like somebody who could not count.
     *
     * Not `opening_float`: the opening count is already carried by the shift's own
     * `opening_cash`, and sending it here would count it twice.
     *
     * @return int The movement id.
     */
    public function recordCashIn(int $shiftId, int $amount, string $description): int;

    /**
     * X-report: the same figures as a close, without closing anything.
     *
     * @throws RuntimeException when the shift is unknown
     */
    public function shiftTotals(int $shiftId): ShiftTotals;

    /**
     * Payment methods this restaurant can accept.
     *
     * @return array<int, string>
     */
    public function methods(): array;
}
