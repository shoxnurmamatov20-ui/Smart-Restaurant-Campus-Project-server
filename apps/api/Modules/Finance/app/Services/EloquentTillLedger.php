<?php

declare(strict_types=1);

namespace Modules\Finance\Services;

use App\Contracts\Finance\CashCount as CountedDrawer;
use App\Contracts\Finance\RefundResult;
use App\Contracts\Finance\ShiftTotals;
use App\Contracts\Finance\Tender;
use App\Contracts\Finance\TillLedger;
use App\Support\Finance\AcquirerFees;
use App\Support\Tenancy\BusinessDay;
use App\Support\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Modules\Finance\Models\CashMovement;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;
use Modules\Finance\Models\PaymentMethod;
use RuntimeException;
use Throwable;

/**
 * Finance answering the platform's write contract for money.
 *
 * The POS never touches a payment row. It asks for one, and this class decides
 * whether that is allowed — which is the only arrangement where "what did we
 * take today" can have a single answer.
 *
 * Note what is *not* here: any way for a caller to state the expected cash in a
 * drawer. `CashShift::close()` derives it from what was taken and paid out, and
 * this class simply passes the count through. A collection mid-shift is recorded
 * as a cash expense for the same reason — the existing arithmetic already
 * subtracts cash paid out, so an inkassatsiya stops looking like a shortfall
 * without anybody editing that calculation.
 */
final class EloquentTillLedger implements TillLedger
{
    public function __construct(
        private readonly TenantContext $tenants,
        private readonly ShiftReporter $reporter,
        private readonly ShiftCloser $closer,
        /*
         * The fiscal registrar — the tax office's copy of every sale.
         *
         * Injected rather than resolved on demand so the one rule P11 rests on is
         * structural: a dead fiscal module NEVER blocks an order. The registrar
         * answers null when the driver is unavailable, the queue absorbs the rest,
         * and money keeps moving. A restaurant that could not sell because a tax
         * endpoint was down would be closed by an outage it did not cause.
         */
        private readonly FiscalRegistrar $fiscal,
    ) {}

    public function openShift(int $userId, int $openingCash = 0): int
    {
        if ($openingCash < 0) {
            throw new RuntimeException('Boshlang\'ich naqd manfiy bo\'la olmaydi.');
        }

        return DB::transaction(function () use ($userId, $openingCash): int {
            /*
             * `unclosed()`, not `open()`.
             *
             * A shift being counted is still this cashier's shift. Asking only
             * about open ones would hand them a second drawer the moment they
             * locked the first to count it, and every sale afterwards would land
             * in whichever of the two the session happened to be holding.
             */
            $existing = CashShift::query()->unclosed()->where('opened_by_user_id', $userId)->first();

            if ($existing !== null) {
                // Two open shifts for one cashier means every payment after the
                // second one lands in an arbitrary drawer.
                throw new RuntimeException('Sizda allaqachon ochiq smena bor.');
            }

            $shift = CashShift::create([
                'number' => CashShift::nextNumber(),
                'opened_by_user_id' => $userId,
                'opened_at' => now(),
                'opening_cash' => $openingCash,
                'expected_cash' => 0,
                'counted_cash' => 0,
                'difference' => 0,
                'status' => 'open',
            ]);

            return (int) $shift->getKey();
        });
    }

    /**
     * The till this person is standing at, open or being counted.
     *
     * A shift locked for counting is still theirs: answering null would send the
     * client down the "open a new shift" path with a counted drawer sitting in
     * front of them. What a locked shift refuses is money, and it refuses it in
     * `capture()`, with a sentence that says why.
     */
    public function openShiftFor(int $userId): ?int
    {
        $id = CashShift::query()->unclosed()->where('opened_by_user_id', $userId)->value('id');

        return $id === null ? null : (int) $id;
    }

    public function closeShift(
        int $shiftId,
        CountedDrawer $count,
        ?string $note = null,
        ?string $varianceReason = null,
        ?int $approvedByUserId = null,
        ?int $closedByUserId = null,
    ): ShiftTotals {
        $shift = $this->shiftOrFail($shiftId);

        /*
         * The closing ladder lives in ShiftCloser, and this is the door the POS
         * comes in through.
         *
         * Nothing here recomputes the drawer: the closer locks the till, derives
         * the expected figure from `CashShift::computeExpectedCash()`, judges the
         * gap and freezes the Z. Two places that both work out expected cash is
         * one place too many — that was the bug that made an X-report and a
         * Z-report name different numbers.
         */
        return $this->reporter->totals(
            $this->closer->close(
                shift: $shift,
                countedCash: $count->total(),
                denominations: $count->breakdown,
                reason: $varianceReason,
                note: $note,
                countedByUserId: $closedByUserId
                    ?? ($shift->opened_by_user_id === null ? null : (int) $shift->opened_by_user_id),
                approvedByUserId: $approvedByUserId,
            ),
        );
    }

    public function capture(
        int $shiftId,
        int $orderId,
        string $orderNumber,
        Tender $tender,
        int $rounding = 0,
    ): int {
        /*
         * A zero amount is legitimate when — and only when — there is a tip.
         *
         * The common flow it unblocks: the guest pays the whole bill by card and
         * leaves cash on the table. That is a cash tender whose entire value is a
         * tip, so nothing of it goes onto the bill and `amount` is 0. This guard
         * used to refuse it, inside the settlement's transaction, which rolled back
         * the CARD PAYMENT ALREADY WRITTEN — while the card had physically been
         * charged at the terminal and the tip notes were in the drawer. The till
         * answered "refused", the bill stayed open, and the money was gone from
         * both directions.
         *
         * A row with no amount and no tip is still refused: that is a payment that
         * did not happen, and recording it would put an empty line on a receipt.
         */
        $this->guardTender($tender);

        return DB::transaction(function () use ($shiftId, $orderId, $orderNumber, $tender, $rounding): int {
            $shift = $this->shiftOrFail($shiftId, forUpdate: true);

            $this->refuseUnlessSelling($shift, 'to\'lov yozib bo\'lmaydi');

            return (int) $this->writePayment($shift, $orderId, $orderNumber, $tender, $rounding)
                ->getKey();
        });
    }

    /**
     * The payment row itself, and the tax office's copy of it.
     *
     * Extracted because two doors reach it — an ordinary `capture()` into an open
     * drawer and an `amendClosedShift()` into a sealed one — and the *only* thing
     * that differs between them is which state the shift is allowed to be in.
     * Everything after that check is identical: the same fee snapshot, the same
     * row, the same fiscal document. Two copies of it would drift the first time
     * one of them learned about a new column, and the half that drifted would be
     * the rare path nobody reads.
     *
     * Assumes it is already inside a transaction with the shift row locked. It is
     * private for that reason: called on its own it would write a payment against
     * a drawer somebody else is closing.
     */
    /**
     * What a tender must look like before any drawer hears about it.
     *
     * Both doors into `writePayment()` check this and neither may skip it: an
     * amendment carries exactly the same risk of a zero-value row or an invented
     * method as an ordinary sale, and it is the path with fewer eyes on it.
     */
    private function guardTender(Tender $tender): void
    {
        /*
         * A zero amount is legitimate when — and only when — there is a tip.
         *
         * The common flow it unblocks: the guest pays the whole bill by card and
         * leaves cash on the table. That is a cash tender whose entire value is a
         * tip, so nothing of it goes onto the bill and `amount` is 0. This guard
         * used to refuse it, inside the settlement's transaction, which rolled back
         * the CARD PAYMENT ALREADY WRITTEN — while the card had physically been
         * charged at the terminal and the tip notes were in the drawer. The till
         * answered "refused", the bill stayed open, and the money was gone from
         * both directions.
         *
         * A row with no amount and no tip is still refused: that is a payment that
         * did not happen, and recording it would put an empty line on a receipt.
         */
        if ($tender->amount < 0 || ($tender->amount === 0 && $tender->tip <= 0)) {
            throw new RuntimeException('To\'lov summasi noldan katta bo\'lishi kerak.');
        }

        if (! in_array($tender->method, Payment::METHODS, true)) {
            throw new RuntimeException("Noma'lum to'lov usuli: {$tender->method}");
        }
    }

    /**
     * Money that arrived without anybody opening a drawer.
     *
     * A guest paying through Payme at three in the morning is a real sale with
     * no till behind it: the delivery kitchen is running, the cashier went home
     * at midnight, and the notes never existed. `capture()` cannot serve it — it
     * needs a shift id, and there is no honest one to give.
     *
     * The alternative was to open a phantom shift for online money, and it is
     * worse in the way that matters: a Z-report is a document a person signs for
     * a drawer they counted, and one that nobody ever stood at is a signature on
     * nothing. So the payment simply has no `cash_shift_id`, which is what the
     * column has always allowed, and every report that groups by shift reports
     * it under "no till" rather than under somebody's name.
     *
     * When a till IS open at the venue the caller sends it through `capture()`
     * instead, so the evening's report shows the app money beside the cash. Only
     * cash moves `computeExpectedCash()`, so neither route can make a drawer
     * disagree with itself.
     *
     * @return int The payment id.
     */
    public function captureWithoutDrawer(
        ?int $orderId,
        string $orderNumber,
        Tender $tender,
        ?int $branchId = null,
    ): int {
        $this->guardTender($tender);

        if ($tender->method === 'cash') {
            // Cash with no drawer is not a thing that happened. Refusing it here
            // is what stops an integration bug from putting banknotes into a
            // till nobody counted.
            throw new RuntimeException('Naqd to\'lov ochiq smenasiz yozilmaydi.');
        }

        return DB::transaction(fn (): int => (int) $this
            ->writePayment(null, $orderId, $orderNumber, $tender, 0, $branchId)
            ->getKey());
    }

    private function writePayment(
        ?CashShift $shift,
        ?int $orderId,
        string $orderNumber,
        Tender $tender,
        int $rounding,
        ?int $branchId = null,
        ?string $businessDate = null,
    ): Payment {
        /*
         * The acquirer's cut, computed here and not by the till.
         *
         * A client that could send the fee could send zero, and card revenue
         * would reconcile against a bank statement that disagreed by exactly
         * the amount somebody chose not to declare. The rate is a snapshot on
         * the row — a contract renegotiated in March must not restate
         * February's margins, the same reason a bill line keeps its own copy
         * of the price.
         */
        $bps = AcquirerFees::bps($tender->method, $this->feeOverrides());

        $payment = Payment::create([
            'branch_id' => $shift === null ? $branchId : $shift->branch_id,
            'cash_shift_id' => $shift?->getKey(),
            'order_id' => $orderId,
            'order_number' => $orderNumber,
            'method' => $tender->method,
            'amount' => $tender->amount,
            'reference' => $tender->reference,
            'tip' => max(0, $tender->tip),
            'rounding' => $rounding,
            'fee_amount' => AcquirerFees::on($tender->amount, $bps),
            'fee_bps' => $bps,
            'status' => 'captured',
            'paid_at' => now(),
            /*
             * Null on the ordinary path, and `HasBusinessDate` fills it from
             * `paid_at` — the trading day the money was taken.
             *
             * An AMENDMENT sends the sealed shift's own day instead, and the
             * difference is not cosmetic. The contract's own docblock says why:
             * the notes are physically in yesterday's drawer, and posting them to
             * today "counts the same banknotes twice — once as yesterday's
             * surplus, once as today's takings". Stamped with today, every report
             * that groups by `business_date` did exactly that while the shift's
             * own Z-report did not, so the two disagreed by the amended amount.
             */
            'business_date' => $businessDate,
        ]);

        /*
         * The tax office's copy of this meal, raised in the same transaction
         * as the money and filed only after it commits.
         *
         * Both halves of that matter. Raising the document here means a sale
         * that rolls back takes its declaration with it, so the restaurant
         * never declares a meal it did not sell. Filing afterwards means no
         * network call is ever made while this transaction holds row locks on
         * the drawer — the registrar defers it to `DB::afterCommit` and, when
         * that attempt fails, to the `fiscal:relay` queue.
         *
         * `recordSale` is written not to throw: it answers null when no OFD is
         * configured and swallows its own failures. The catch is the belt for
         * the unexpected — a provider that threw something nobody anticipated.
         * An exception escaping here would roll back this transaction and,
         * with it, the payment and the bill the POS closes in the same one:
         * the guest has handed over notes, the card has already been charged
         * at the terminal, and the till would answer "refused". A dead fiscal
         * module NEVER blocks an order — a restaurant that cannot sell because
         * a tax endpoint is down has been closed by an outage it did not cause.
         */
        try {
            $this->fiscal->recordSale($shift, $payment);
        } catch (Throwable $unfiscalised) {
            Log::error('fiscal.capture_left_undeclared', [
                'payment_id' => $payment->getKey(),
                'order_id' => $orderId,
                'error' => $unfiscalised->getMessage(),
            ]);
        }

        return $payment;
    }

    public function amendClosedShift(
        int $shiftId,
        int $orderId,
        string $orderNumber,
        Tender $tender,
        string $reason,
        ?int $amendedByUserId = null,
        int $rounding = 0,
    ): int {
        $this->guardTender($tender);

        if (trim($reason) === '') {
            throw new RuntimeException('Yopilgan smenaga tuzatish sababsiz kiritilmaydi.');
        }

        return DB::transaction(function () use (
            $shiftId, $orderId, $orderNumber, $tender, $reason, $amendedByUserId, $rounding
        ): int {
            $shift = $this->shiftOrFail($shiftId, forUpdate: true);

            /*
             * The mirror image of `refuseUnlessSelling`, and the reason it is
             * spelled out rather than reused inverted: a shift that is still open
             * must go through `capture()`. Letting an amendment through here
             * would put a `payment.amended_closed_shift` line in the audit trail
             * for an ordinary sale, and an auditor reading a year of them could
             * no longer tell which ones were real corrections.
             */
            if ($shift->status !== 'closed') {
                throw new RuntimeException(
                    "Smena hali yopilmagan — oddiy to'lov sifatida yozilishi kerak.",
                );
            }

            $payment = $this->writePayment(
                $shift,
                $orderId,
                $orderNumber,
                $tender,
                $rounding,
                // The sealed shift's own trading day — see `writePayment`. It is
                // also what puts an amendment inside the reach of the month lock:
                // a correction into a month an accountant has signed off is
                // refused like any other write into it.
                businessDate: app(BusinessDay::class)->dateFor(CarbonImmutable::parse($shift->opened_at)),
            );

            /*
             * The trail, and why it is a log line rather than a column.
             *
             * `payments` has no note field and this does not earn one: an
             * amendment is rare, and a column that is null on every row but a
             * handful is a column every query has to explain. The activity log is
             * already where "who changed what, and why" is answered for this
             * model — `finance.payment` — and it takes arbitrary properties.
             *
             * Recorded AFTER the row exists so the subject is the payment itself,
             * which is what somebody reading the shift back will click on.
             */
            activity('finance.payment')
                ->performedOn($payment)
                ->withProperties([
                    'cash_shift_id' => $shift->getKey(),
                    'shift_closed_at' => $shift->closed_at?->toIso8601String(),
                    'order_id' => $orderId,
                    'order_number' => $orderNumber,
                    'amount' => $tender->amount,
                    'method' => $tender->method,
                    'reason' => $reason,
                    'amended_by_user_id' => $amendedByUserId,
                ])
                ->log('payment.amended_closed_shift');

            return (int) $payment->getKey();
        });
    }

    /**
     * Reverse a payment, and take the notes out of the drawer that pays them.
     *
     * This used to be one line — flip the row and return — and the line was
     * wrong in a way that produced two incorrect Z-reports from one button.
     *
     * The arithmetic that makes it subtle: `computeExpectedCash()` counts
     * CAPTURED payments only, so flipping a cash payment to `refunded` already
     * removes its money, its tip and its rounding from the expected drawer. For a
     * refund inside the shift that took the payment, that is exactly right and
     * nothing else must happen — writing a payout as well would subtract the
     * money twice and close the till over by the refunded amount.
     *
     * It goes wrong the moment the refund crosses shifts, and it crossed them
     * silently:
     *
     *   *Yesterday's shift, closed.* The notes come out of today's drawer and
     *   today's shift knows nothing about it, so today closes short by the
     *   refund — reported against whoever counted. Meanwhile last night's Z,
     *   which is a signed document in a folder, quietly reports different
     *   takings than the sheet does.
     *
     *   *Another till, open right now.* Worse. The other shift loses the payment
     *   from its expectation and closes OVER; this one hands out notes it never
     *   recorded and closes SHORT. Two wrong reports, both blamed on people.
     *
     * So: same shift, reverse it. Original shift closed, reverse it and pay the
     * cash out of the till that is open — a payout with a reason, which is what
     * it physically is. Another till still open: refused, and the message says to
     * refund at the till that took the money. That last rule is the only one that
     * costs a restaurant anything, and it costs them one walk across the room
     * rather than two unexplainable shifts.
     *
     * A card refund opens no drawer at all: the acquirer reverses it against an
     * account. Recording a payout for it would take notes out of a till for money
     * that was never in it.
     *
     * @param  int|null  $refundingShiftId  The drawer the notes come out of. Optional
     *                                      while the contract cannot carry it: with
     *                                      one till open there is no ambiguity, and
     *                                      with several this refuses rather than
     *                                      guessing.
     */
    /**
     * The same refund, answering with what it actually did.
     *
     * Orders needs two facts the POS cannot work out for itself: which bill the
     * money came off, and whether anything is still standing on it. The second is
     * the one a caller gets wrong — a table that paid with two cards and asks for
     * one of them back is a PARTIAL refund, and the bill is still a sale. Counted
     * here, inside the transaction that flipped the row, so no second query can
     * race it.
     */
    public function refundPayment(int $paymentId, string $reason, ?int $refundingShiftId = null): RefundResult
    {
        return DB::transaction(function () use ($paymentId, $reason, $refundingShiftId): RefundResult {
            [$payment, $cashReturned, $drawerId] = $this->applyRefund($paymentId, $reason, $refundingShiftId);

            return $this->refundResult($payment, $cashReturned, $drawerId);
        });
    }

    /**
     * Reverse the payment and move the notes, returning the facts about both.
     *
     * @return array{0: Payment, 1: int, 2: int|null} The payment, the tiyin that
     *                                                left a drawer, and which drawer.
     */
    private function applyRefund(int $paymentId, string $reason, ?int $refundingShiftId): array
    {
        return DB::transaction(function () use ($paymentId, $reason, $refundingShiftId): array {
            /** @var Payment|null $payment */
            $payment = Payment::query()->lockForUpdate()->find($paymentId);

            if ($payment === null) {
                throw new RuntimeException("#{$paymentId} to'lovi topilmadi.");
            }

            if ($payment->status === 'refunded') {
                throw new RuntimeException("#{$paymentId} to'lovi allaqachon qaytarilgan.");
            }

            $origin = $payment->cash_shift_id === null
                ? null
                : CashShift::query()->lockForUpdate()->find($payment->cash_shift_id);

            $isCash = $payment->method === 'cash';

            // ---- The ordinary case: the till that took it is still the till. ----
            if ($origin !== null && $origin->status !== 'closed') {
                if ($refundingShiftId !== null && $refundingShiftId !== (int) $origin->getKey()) {
                    throw new RuntimeException(
                        "Bu to'lov {$origin->number} smenasida olingan — qaytarishni o'sha kassada bajaring."
                    );
                }

                $this->refuseUnlessSelling($origin, 'qaytarib bo\'lmaydi');

                // Nothing else. The reversal is the drawer movement — see above.
                $payment->refund($reason);

                $cashReturned = $isCash ? (int) $payment->amount : 0;
                $this->declareRefund($payment, $origin, $cashReturned);

                return [$payment, $cashReturned, (int) $origin->getKey()];
            }

            // ---- The original shift is closed, or the payment never had one. ----
            $payment->refund($reason);

            if (! $isCash) {
                // Card, Click, Payme, corporate: the bank reverses it against an
                // account, days later. No notes move and no drawer opens, so no
                // shift's expected cash may move either. The declaration is
                // corrected all the same — the sale was declared and is being
                // taken back, whichever way the money travels.
                $this->declareRefund($payment, null, 0);

                return [$payment, 0, $refundingShiftId];
            }

            $drawer = $this->drawerFor($refundingShiftId);

            Expense::create([
                'branch_id' => $drawer->branch_id,
                'cash_shift_id' => $drawer->getKey(),
                'category' => 'refund',
                'description' => sprintf(
                    'Qaytarish: %s to\'lovi #%d%s',
                    $payment->order_number ?? '—',
                    (int) $payment->getKey(),
                    $origin === null ? '' : " ({$origin->number})",
                ),
                'amount' => $payment->amount,
                'paid_in_cash' => true,
                'spent_at' => now(),
            ]);

            $this->declareRefund($payment, $drawer, (int) $payment->amount);

            return [$payment, (int) $payment->amount, (int) $drawer->getKey()];
        });
    }

    /**
     * Tell the tax authority the meal came back.
     *
     * A declaration that has been filed cannot be unfiled; it can only be
     * corrected by another document. So every path that hands money back raises
     * one — all three of them, which is the point of this being a method rather
     * than a line repeated where somebody remembered it. Two of the three used to
     * forget, and the ordinary case was one of them: a guest refunded at the till
     * that served them left the restaurant declared on, and taxed on, a meal it
     * had given the money back for.
     *
     * Swallowed for the same reason the sale path swallows: this runs inside the
     * transaction that flipped the payment row and, for cash, wrote the payout. An
     * exception escaping here would roll both back — the notes are already out of
     * the drawer and in the guest's hand, and the till would say the refund never
     * happened. `fiscal:relay` picks up whatever this could not raise.
     */
    private function declareRefund(Payment $payment, ?CashShift $drawer, int $cashReturned): void
    {
        try {
            $this->fiscal->recordRefund($payment, $drawer, $cashReturned);
        } catch (Throwable $uncorrected) {
            Log::error('fiscal.refund_left_uncorrected', [
                'payment_id' => $payment->getKey(),
                'order_id' => $payment->order_id,
                'error' => $uncorrected->getMessage(),
            ]);
        }
    }

    public function recordCashOut(int $shiftId, int $amount, string $description): int
    {
        if ($amount <= 0) {
            throw new RuntimeException('Chiqim summasi noldan katta bo\'lishi kerak.');
        }

        return DB::transaction(function () use ($shiftId, $amount, $description): int {
            $shift = $this->shiftOrFail($shiftId, forUpdate: true);

            $this->refuseUnlessSelling($shift, 'pul chiqarib bo\'lmaydi');

            $expense = Expense::create([
                'cash_shift_id' => $shift->getKey(),
                'category' => 'other',
                'description' => $description,
                'amount' => $amount,
                'paid_in_cash' => true,
                'spent_at' => now(),
            ]);

            return (int) $expense->getKey();
        });
    }

    /**
     * Money put INTO the drawer that nobody bought anything with.
     *
     * Change fetched from the safe so the till can break a 200 000 note, a
     * miscount corrected, notes swapped for smaller ones. The mirror of
     * `recordCashOut()`, and it was missing — so every one of these came back at
     * closing as a drawer inexplicably over, which reads as a cashier who cannot
     * count or, worse, one holding the difference back for later.
     *
     * Not takings, and it must never reach them: nothing was sold. It goes to
     * `finance.cash_movements`, which `CashShift::expectedCashTerms()` names as
     * its own term.
     *
     * **Never send the opening float through here.** `opening_cash` already
     * counts it, and a float passed through this door is counted twice — the
     * drawer then expects money that was never there and the cashier closes
     * short by exactly the float.
     *
     * @return int The movement id.
     */
    public function recordCashIn(int $shiftId, int $amount, string $description): int
    {
        if ($amount <= 0) {
            throw new RuntimeException('Kirim summasi noldan katta bo\'lishi kerak.');
        }

        return DB::transaction(function () use ($shiftId, $amount, $description): int {
            $shift = $this->shiftOrFail($shiftId, forUpdate: true);

            $this->refuseUnlessSelling($shift, 'pul qo\'shib bo\'lmaydi');

            $movement = CashMovement::create([
                'branch_id' => $shift->branch_id,
                'cash_shift_id' => $shift->getKey(),
                'direction' => 'in',
                'amount' => $amount,
                'reason' => $description,
                'recorded_by_user_id' => $shift->opened_by_user_id,
                'occurred_at' => now(),
            ]);

            return (int) $movement->getKey();
        });
    }

    /**
     * Captured payments still standing on a bill. Zero means every one of them
     * has been reversed.
     *
     * Here rather than in the POS because this is where payment rows live, and a
     * till counting them itself would be the module boundary crossed for one
     * `where`.
     */
    public function liveTendersFor(int $orderId): int
    {
        return Payment::query()
            ->where('order_id', $orderId)
            ->where('status', 'captured')
            ->count();
    }

    public function shiftTotals(int $shiftId): ShiftTotals
    {
        return $this->reporter->totals($this->shiftOrFail($shiftId));
    }

    /**
     * The tenders this restaurant offers, in the order its till draws them.
     *
     * Read from `finance.payment_methods` when the restaurant has configured
     * any, and the platform's whole set when it has not — a venue that has never
     * opened the settings screen must not be handed an empty tender sheet.
     *
     * **A disabled tender is removed from this list and is still accepted by
     * `capture()`.** That asymmetry is deliberate. This list is what a till DRAWS;
     * `guardTender()` is what the ledger ACCEPTS, and between the two sits an
     * offline queue that may be holding a sale taken through Uzcard on Friday
     * and draining on Monday, after somebody switched Uzcard off. Refusing it
     * would lose money that has already left a guest's card, to enforce a
     * preference about which buttons appear.
     *
     * @return array<int, string>
     */
    public function methods(): array
    {
        $configured = PaymentMethod::query()
            ->enabled()
            ->ordered()
            ->pluck('method')
            ->all();

        if ($configured === []) {
            return Payment::METHODS;
        }

        /*
         * Only the ones the platform still knows how to settle.
         *
         * A row can outlive its tender — a method removed from `Payment::METHODS`
         * leaves its configuration behind — and handing that name to a till would
         * draw a button whose payment `guardTender()` then refuses, in front of a
         * guest.
         */
        return array_values(array_filter(
            $configured,
            static fn (string $method): bool => in_array($method, Payment::METHODS, true),
        ));
    }

    // ============ Internals ============

    /**
     * @param  bool  $forUpdate  Take the row lock. Only on write paths: it serialises
     *                           everything touching this drawer, which is what keeps a
     *                           payment from landing between "what should be in the
     *                           till" and "write down the difference". A read that
     *                           locked would block a sale to answer an X-report.
     */
    private function shiftOrFail(int $shiftId, bool $forUpdate = false): CashShift
    {
        $query = CashShift::query();

        if ($forUpdate) {
            $query->lockForUpdate();
        }

        /** @var CashShift|null $shift */
        $shift = $query->find($shiftId);

        if ($shift === null) {
            throw new RuntimeException("#{$shiftId} smenasi topilmadi.");
        }

        return $shift;
    }

    /**
     * What the refund did, counted after the row was flipped.
     *
     * `liveTenders` is read here rather than by the caller and inside the same
     * transaction rather than after it: two tills refunding two halves of one
     * bill at the same moment would otherwise both see one payment still
     * standing, and the order would never be marked refunded by either.
     */
    private function refundResult(Payment $payment, int $cashReturned, ?int $refundingShiftId): RefundResult
    {
        /*
         * A payment with no bill behind it is an ordinary case, not an error:
         * money recorded straight into Finance rather than taken at a till.
         * `orderId` is nullable for exactly that, and a caller reading it sees
         * "there is no bill to move" rather than a refusal.
         *
         * `liveTenders` stays at zero there. Counting captured rows against a
         * null order would sweep up every other order-less payment in the
         * restaurant and answer a question nobody asked.
         */
        $orderId = $payment->order_id === null ? null : (int) $payment->order_id;
        $live = $orderId === null ? 0 : $this->liveTendersFor($orderId);

        return new RefundResult(
            paymentId: (int) $payment->getKey(),
            orderId: $orderId,
            orderNumber: $payment->order_number,
            method: (string) $payment->method,
            amount: (int) $payment->amount,
            cashReturned: $cashReturned,
            liveTenders: $live,
            // Nothing captured is left on the bill. With no bill at all this is
            // true and harmless: the caller checks `orderId` before moving one.
            orderFullyRefunded: $live === 0,
            refundingShiftId: $refundingShiftId,
        );
    }

    /**
     * A drawer takes money only while it is open.
     *
     * Two refusals rather than one, because a cashier can act on the difference.
     * "Closed" means fetch a manager and open a shift; "being counted" means the
     * count in progress has to finish first, and the money in your hand is not
     * lost — which is not what "this shift is closed" sounds like at a counter
     * with a guest waiting.
     */
    private function refuseUnlessSelling(CashShift $shift, string $action): void
    {
        if ($shift->status === 'counting') {
            throw new RuntimeException("Smena sanalmoqda — sanoq tugagunicha {$action}.");
        }

        if ($shift->status !== 'open') {
            throw new RuntimeException("Yopilgan smenada {$action}.");
        }
    }

    /**
     * The till the notes come out of, when the payment's own is gone.
     *
     * Refuses rather than picks when there is more than one open. A wrong guess
     * here is a shift that closes short with no record of why, which is precisely
     * the failure this whole method exists to end.
     */
    private function drawerFor(?int $shiftId): CashShift
    {
        if ($shiftId !== null) {
            $shift = $this->shiftOrFail($shiftId, forUpdate: true);
            $this->refuseUnlessSelling($shift, 'qaytarib bo\'lmaydi');

            return $shift;
        }

        $open = CashShift::query()->open()->orderBy('id')->get();

        if ($open->count() === 1) {
            /** @var CashShift $only */
            $only = $open->first();

            return $only;
        }

        throw new RuntimeException($open->isEmpty()
            ? 'Naqd qaytarish uchun ochiq kassa smenasi kerak.'
            : 'Bir nechta kassa ochiq — qaysi kassadan qaytarilayotganini ko\'rsating.');
    }

    /**
     * This restaurant's negotiated rates, if it has any.
     *
     * `tenants.settings` rather than a table of its own: there are ten methods and
     * one row per restaurant, and a chain that renegotiates its Uzcard rate should
     * be one settings edit rather than a migration.
     *
     * @return array<string, int|string>
     */
    private function feeOverrides(): array
    {
        $tenant = $this->tenants->tenant();

        if ($tenant === null) {
            return [];
        }

        $fees = ($tenant->settings ?? [])['acquirer_fees_bps'] ?? null;
        $fees = is_array($fees) ? $fees : [];

        /*
         * A configured row wins over the settings key, and both win over the
         * platform default.
         *
         * Two sources for one number is how drift starts, so the precedence is
         * written down here rather than left to whichever is read first. The
         * settings key came first and is what provisioned tenants carry; the
         * table is what the console can edit, which makes it the newer and more
         * specific answer. A row with a NULL `fee_bps` states no rate at all and
         * deliberately does not overwrite the settings key with a zero — see the
         * `payment_methods` migration for why null and zero cannot be the same
         * value here.
         */
        $rows = PaymentMethod::query()
            ->whereNotNull('fee_bps')
            ->pluck('fee_bps', 'method')
            ->all();

        return array_merge($fees, $rows);
    }
}
