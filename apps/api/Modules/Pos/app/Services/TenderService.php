<?php

declare(strict_types=1);

namespace Modules\Pos\Services;

use App\Contracts\Crm\GuestAccounts;
use App\Contracts\Finance\Tender;
use App\Contracts\Finance\TillLedger;
use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillRegistry;
use App\Support\Auth\ActingPerson;
use App\Support\Finance\TenderPlan;
use Illuminate\Support\Facades\DB;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Sync\ShiftChoice;
use RuntimeException;

/**
 * Settling a bill, in however many pieces the guests want.
 *
 * A table of four paying with two cards and a handful of notes is one bill and
 * three tenders. Getting that right is mostly arithmetic, and all of it in
 * tiyin — the moment a float appears here, a hundredth of a so'm per line
 * multiplied by a day's covers becomes a real difference in a real drawer.
 *
 * Two rules are worth stating because they are easy to get backwards:
 *
 *  - Change only ever comes out of cash. Overpaying by card is not generosity,
 *    it is a mistake, and handing back notes for it turns a card terminal into
 *    a cash machine.
 *  - Everything happens in one transaction. A settlement that captured two of
 *    three tenders and then failed would leave a bill that is neither open nor
 *    paid, and a guest who has been charged twice for a meal they still owe for.
 *  - **Cash is rounded, the difference is recorded, and nothing is lost.**
 *    DECISIONS Q7: a drawer cannot pay out 312 tiyin, so the cash side of a
 *    settlement moves to the nearest 1 000 so'm and the difference goes on the
 *    payment row. The expected drawer follows it exactly, so a shift still
 *    reconciles to the tiyin — which is the whole point of recording it rather
 *    than quietly keeping it.
 *  - **A tip is not revenue.** DECISIONS Q6: it is money the guest handed over on
 *    top of the bill. It never reduces what is owed, never enters the total the
 *    bill was taxed on, and is still in the drawer at counting time if it came in
 *    notes. So it travels beside the amount and never inside it.
 */
final class TenderService
{
    public function __construct(
        private readonly BillRegistry $bills,
        private readonly TillLedger $till,
        private readonly GuestAccounts $accounts,
    ) {}

    /**
     * Whose tab this is.
     *
     * From the BILL, never from the request. A tender line that could name a
     * customer would let a till put one guest's meal on another guest's account —
     * and the person who finds out is the one who gets the bill on Friday.
     *
     * A bill with no customer cannot be signed for: there is nobody to sign. That
     * is a refusal rather than a silent cash fallback, because the guest has been
     * told their meal went on the account and a till that quietly took nothing
     * leaves the restaurant unpaid with everyone believing otherwise.
     */
    private function guestFor(Bill $bill): int
    {
        if ($bill->customerId === null) {
            throw new RuntimeException(
                'Qarzga sotish uchun hisobda mijoz ko\'rsatilishi shart.',
            );
        }

        return $bill->customerId;
    }

    /**
     * @param array<int, array{method: string, amount: int, reference?: string|null, tip?: int|null, approval_id?: int|null}> $tenders
     *
     * @return array{bill: array<string, mixed>, payment_ids: array<int, int>, change: int, settled: bool}
     */
    public function settle(
        Terminal $terminal,
        int $billId,
        int $shiftId,
        array $tenders,
        ?ShiftChoice $into = null,
    ): array {
        /*
         * A person's decision about which drawer, when there was one to make.
         *
         * `$into` arrives only from `ConflictResolution` answering
         * `ConflictKind::ShiftClosed` — a queued sale whose notes are in a
         * drawer that has since been counted. It overrides `$shiftId` because
         * the session's shift is precisely the answer that was found wanting.
         */
        if ($into !== null) {
            $shiftId = $into->shiftId;
        }

        if ($tenders === []) {
            throw new RuntimeException('Kamida bitta to\'lov usuli ko\'rsatilishi kerak.');
        }

        return DB::transaction(function () use ($terminal, $billId, $shiftId, $tenders, $into): array {
            $bill = $this->bills->find($billId);

            if ($bill === null) {
                throw new RuntimeException("#{$billId} hisobi topilmadi.");
            }

            if (! $bill->isOpen()) {
                throw new RuntimeException("#{$bill->number} hisobi allaqachon yopilgan.");
            }

            /*
             * The arithmetic, worked out once and somewhere else.
             *
             * TenderPlan is the same calculator the payment screen quotes from, and
             * that is the whole reason it is not inline here. The two used to differ:
             * the screen rounded the bill total, this rounded the cash remainder, and
             * for a cash-only sale they agree — which is why it looked correct. Split
             * a bill with a card amount that is not a round number and they diverge,
             * the screen says the guest is square, this records a part payment, and
             * the table walks out owing money nobody knows about.
             *
             * It throws for everything a cashier must be told rather than have
             * silently adjusted, and those come back as pos.tender_refused with the
             * sentence attached.
             */
            $plan = TenderPlan::of($bill->total, $tenders, $terminal->cashRoundingStep());

            $paymentIds = [];

            foreach ($tenders as $line) {
                $method = (string) $line['method'];
                $tip = max(0, (int) ($line['tip'] ?? 0));

                /*
                 * The amount RECORDED is what stayed, not what was handed over.
                 *
                 * This was the offered figure, change included, which meant a guest
                 * paying 50 000 for a 47 000 bill produced a 50 000 payment row — and
                 * an expected drawer 3 000 too high, on every single sale that gave
                 * change. The shortfall then surfaced at counting time as a cashier
                 * who could not count.
                 */
                $applied = $plan->appliedFor($line);

                if ($applied <= 0 && $tip <= 0) {
                    // A cash line that turned out to be pure change: the bill was
                    // already covered by card. Nothing stayed, so there is nothing to
                    // record and the notes go straight back.
                    continue;
                }

                $captured = new Tender(
                    method: $method,
                    amount: max(0, $applied),
                    reference: isset($line['reference']) ? (string) $line['reference'] : null,
                    tip: $tip,
                );

                /*
                 * Rounding rides on the cash line and nowhere else.
                 *
                 * `computeExpectedCash()` sums `rounding` across EVERY captured
                 * payment, not just the cash ones — so a non-zero here on any
                 * other method would move the expected drawer by an amount no
                 * notes accounted for. `credit` in particular: a tab charge that
                 * carried rounding would make a shift that took no cash at all
                 * expect some.
                 */
                $carriedRounding = $method === 'cash' ? $plan->rounding : 0;

                /*
                 * Two doors into Finance, and the sealed one is never the
                 * default. `capture()` refuses a closed shift on purpose; when a
                 * person has decided the sealed drawer is the one holding these
                 * notes, the amendment door records that decision with its reason
                 * instead of quietly relaxing the guard for everybody.
                 */
                $paymentId = $into !== null && $into->amends()
                    ? $this->till->amendClosedShift(
                        shiftId: $shiftId,
                        orderId: $bill->id,
                        orderNumber: $bill->number,
                        tender: $captured,
                        reason: (string) $into->amendReason,
                        amendedByUserId: $into->decidedByUserId,
                        rounding: $carriedRounding,
                    )
                    : $this->till->capture(
                        shiftId: $shiftId,
                        orderId: $bill->id,
                        orderNumber: $bill->number,
                        tender: $captured,
                        rounding: $carriedRounding,
                    );

                $paymentIds[] = $paymentId;

                /*
                 * A tab, put on the guest's own account.
                 *
                 * Inside this transaction on purpose, and it is the whole reason
                 * the settlement is one: money and debt have to land together. The
                 * state between them — a payment row saying `credit` with no
                 * balance behind it — is a meal the restaurant has recorded as sold
                 * and has no line to collect against.
                 *
                 * The ceiling is enforced by `charge()` itself; when a manager has
                 * already signed for going past it, the approval id rides along and
                 * is recorded. CRM cannot verify that signature — checking it means
                 * reading this module — so the POS is what spends it, and the ledger
                 * merely says which one was spent.
                 */
                if ($method === 'credit') {
                    $this->accounts->charge(
                        customerId: $this->guestFor($bill),
                        amount: max(0, $applied),
                        orderId: $bill->id,
                        orderNumber: $bill->number,
                        paymentId: $paymentId,
                        userId: ActingPerson::id(),
                        approvalId: isset($line['approval_id']) ? (int) $line['approval_id'] : null,
                    );
                }
            }

            $settled = $plan->settled;

            // A bill taken at a counter is fired and settled in one action, so
            // it can still be `draft` when the money arrives — and closing a
            // draft used to fail with "Hisobni yopib bo'lmadi", which told the
            // cashier the till was broken and told nobody why.
            //
            // Firing it here rather than widening the state ladder is the point:
            // `draft` means the lines are not confirmed and no kitchen ticket
            // exists. Settle it without firing and the guest has paid for food
            // that no station will ever see — the drawer balances and the order
            // is simply lost. So the money and the ticket are created in the
            // same transaction, and if the bill is empty `send` refuses it,
            // which is the right answer to being paid for nothing.
            if ($settled && $bill->status === 'draft') {
                $bill = $this->bills->send($bill->id);
            }

            // Underpaying is legitimate — a deposit, or one guest of four paying
            // early — so the bill simply stays open rather than being refused.
            $bill = $settled ? $this->bills->close($bill->id) : $this->bills->find($bill->id);

            /*
             * The plan's own figures go back, so the screen shows what was charged
             * rather than what it predicted.
             *
             * `change` is exact and no longer rounded here. It used to be rounded
             * down to the nearest so'm, which quietly kept the remainder: the drawer
             * then held more than the expected figure and nothing recorded why.
             * Rounding the DUE instead — the contract in DECISIONS Q7 — means the
             * change falls on a note boundary whenever the guest hands over notes,
             * and the one place the difference lives is `Payment.rounding`.
             */
            return $plan->toArray() + [
                'bill' => $bill?->toArray() ?? [],
                'payment_ids' => $paymentIds,
            ];
        });
    }
}
