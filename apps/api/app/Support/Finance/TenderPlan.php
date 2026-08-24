<?php

declare(strict_types=1);

namespace App\Support\Finance;

use App\Support\Orders\BillTotals;
use RuntimeException;

/**
 * How a settlement adds up, before any of it is written down.
 *
 * A pure calculator in the shape of {@see BillTotals}:
 * integers in, integers out, no database and no request. It exists because four
 * things have to agree about the same settlement and the only way to be sure they
 * do is for there to be one place it is worked out —
 *
 *   the payment screen, which tells a cashier what to ask the guest for;
 *   the settlement, which writes the payment rows;
 *   the receipt, which prints what was taken and what came back;
 *   the Z report, which reconciles the drawer against all of it.
 *
 * The first two are the pair that made this necessary. The screen used to round
 * the bill total itself while the settlement rounded the cash REMAINDER, and for a
 * cash-only sale the two agree — which is why it looked fine. Split a bill with a
 * card amount that is not a round number and they disagree: the screen says the
 * guest is square, the server records a part payment, and the table walks out
 * owing money nobody knows about.
 *
 * ---------------------------------------------------------------------------
 * The rules, stated once
 *
 * **A tip is part of what was handed over, never part of what was owed** (Q6).
 * So each tender contributes `amount − tip` to the bill. A tip never reduces the
 * bill and never enters the total it was taxed on, but a tip left in notes is in
 * the drawer at counting time — which is why it is tracked separately rather than
 * subtracted and forgotten.
 *
 * **Only cash is rounded, and only the remainder** (Q7). A card charges the exact
 * figure; a drawer cannot pay out 312 tiyin. So whatever is left for cash to cover
 * after the other methods have been applied is rounded to a note that exists, and
 * the signed difference is recorded rather than kept.
 *
 * **Rounding applies only to a settlement that completes.** A part payment is not
 * rounded: the guest is coming back with the rest, and rounding a running balance
 * moves the goalposts between two halves of one transaction.
 *
 * **Change comes out of cash and nothing else.** Overpaying by card is a mistake,
 * not generosity, and handing back notes for it turns a card terminal into a cash
 * machine.
 */
final readonly class TenderPlan
{
    /**
     * @param  int  $due  What the bill came to, tiyin.
     * @param  int  $offered  Everything handed over across all methods, tiyin.
     * @param  int  $applied  What went onto the bill — offered minus tips, minus change.
     * @param  int  $cashRevenue  The cash share of `applied`, un-rounded. This is
     *                            revenue; the rounding below is a separate gain or loss.
     * @param  int  $rounding  Signed. What rounding the cash remainder moved (Q7).
     * @param  int  $tips  Tiyin handed over as tips across all methods (Q6).
     * @param  int  $cashTips  The share of them in notes — the part that is in the drawer.
     * @param  int  $change  Tiyin to hand back. Cash only, and exact.
     * @param  bool  $settled  Whether this closes the bill.
     * @param  int  $remaining  What is still owed, tiyin. Zero on a settled bill.
     */
    private function __construct(
        public int $due,
        public int $offered,
        public int $applied,
        public int $cashRevenue,
        public int $rounding,
        public int $tips,
        public int $cashTips,
        public int $change,
        public bool $settled,
        public int $remaining,
    ) {}

    /**
     * Work out a settlement.
     *
     * @param  array<int, array{method: string, amount: int|string, tip?: int|string|null}>  $tenders
     * @param  int  $step  How far this terminal rounds cash — see Terminal::cashRoundingStep().
     *
     * @throws RuntimeException on anything a cashier must be told rather than have
     *                          silently adjusted: a non-positive amount, a tip
     *                          bigger than the tender it rode in on, two cash
     *                          lines, or an overpayment by card.
     */
    public static function of(int $due, array $tenders, int $step): self
    {
        if ($tenders === []) {
            throw new RuntimeException('Kamida bitta to\'lov usuli ko\'rsatilishi kerak.');
        }

        $offered = 0;
        $cashOffered = 0;
        $tips = 0;
        $cashTips = 0;
        $cashLines = 0;

        foreach ($tenders as $line) {
            $method = (string) $line['method'];
            $amount = (int) $line['amount'];
            $tip = max(0, (int) ($line['tip'] ?? 0));

            if ($amount <= 0) {
                throw new RuntimeException('To\'lov summasi noldan katta bo\'lishi kerak.');
            }

            if ($tip > $amount) {
                // The tip rides inside what was handed over. A tip larger than the
                // tender would mean the guest tipped money they did not give.
                throw new RuntimeException('Choypuli to\'lov summasidan katta bo\'la olmaydi.');
            }

            $offered += $amount;
            $tips += $tip;

            if ($method === 'cash') {
                $cashOffered += $amount;
                $cashTips += $tip;
                $cashLines++;
            }
        }

        /*
         * One cash line per settlement, and this is a real restriction rather than
         * an implementation shortcut.
         *
         * Rounding and change both attach to the cash side, and with two cash lines
         * there is no non-arbitrary answer to which of them carries them. A drawer
         * does not care whose notes they were: two guests putting in cash is one
         * number a cashier adds up, which is what they do anyway.
         */
        if ($cashLines > 1) {
            throw new RuntimeException('Bitta hisobda faqat bitta naqd to\'lov bo\'ladi.');
        }

        $nonCashApplied = ($offered - $cashOffered) - ($tips - $cashTips);
        $cashHanded = $cashOffered - $cashTips;

        if ($nonCashApplied > $due) {
            throw new RuntimeException('Ortiqcha to\'lov faqat naqddan qaytariladi.');
        }

        $cashDue = max(0, $due - $nonCashApplied);
        $rounding = 0;
        $change = 0;

        /*
         * Does cash close this bill?
         *
         * Three conditions, and the first one is not redundant however much it
         * looks it. Without `$cashLines > 0` this branch is entered on a settlement
         * with NO CASH IN IT: `$cashHanded` is 0, and `CashRounding::round()`
         * answers 0 for any remainder below half a step — so `0 >= 0` holds, a
         * remainder nobody tendered is "rounded away", and the bill closes.
         *
         * That was not hypothetical. A 50 490 so'm bill paid with 50 000 so'm on a
         * card closed as fully settled: `cashRevenue` became 49 000 tiyin the guest
         * never handed over, `rounding` became −49 000 and was then dropped on the
         * floor because the payment loop only writes rounding onto a cash row. 490
         * so'm of revenue disappeared with nothing naming it, on every card-only
         * settlement falling short by less than half a step — up to 499.99 so'm a
         * bill, systematically, in the restaurant's favour on the screen and against
         * it in the books.
         */
        $settlesInCash = $cashLines > 0
            && $cashDue > 0
            && $cashHanded >= CashRounding::round($cashDue, $step);

        if ($settlesInCash) {
            $cashRevenue = $cashDue;
            $rounding = CashRounding::difference($cashDue, $step);
            $change = $cashHanded - $cashDue - $rounding;
        } else {
            /*
             * Not settled by cash: a part payment, or notes on the counter for a
             * bill a card has already covered.
             *
             * Capped at what the bill still needs, and this cap is the whole
             * correction. `$cashRevenue` used to be initialised to `$cashHanded` and
             * only narrowed inside the branch above — so when a card covered the
             * bill exactly, `$cashDue` was 0, the branch was skipped, and cash left
             * on the counter was recorded as revenue with `change` still 0. A guest
             * paying a 50 000 so'm bill by card and putting 10 000 so'm down got two
             * payment rows totalling 60 000 and no change back, and the drawer
             * reconciled perfectly against a Z-report 10 000 above the bill.
             *
             * Anything over what the bill needs is change, not takings.
             */
            $cashRevenue = min($cashHanded, $cashDue);
            $change = $cashHanded - $cashRevenue;
        }

        $applied = $nonCashApplied + $cashRevenue;

        return new self(
            due: $due,
            offered: $offered,
            applied: $applied,
            cashRevenue: $cashRevenue,
            rounding: $rounding,
            tips: $tips,
            cashTips: $cashTips,
            change: $change,
            settled: $applied >= $due,
            remaining: max(0, $due - $applied),
        );
    }

    /**
     * What cash would settle this bill for, given everything else offered.
     *
     * The number a cashier reads out loud. Answered by the same arithmetic that
     * will charge it, which is the entire point of this class: a screen that
     * computed it separately would eventually quote a figure the receipt disagrees
     * with, in front of a guest, with notes already on the counter.
     */
    public function cashToCollect(): int
    {
        return $this->cashRevenue + $this->rounding;
    }

    /**
     * What one tender contributes to the bill, for the row that records it.
     *
     * Cash is answered from the plan rather than from the line, because what STAYS
     * out of a cash tender is not what was handed over — the difference walked out
     * as change.
     *
     * @param  array{method: string, amount: int|string, tip?: int|string|null}  $line
     */
    public function appliedFor(array $line): int
    {
        $tip = max(0, (int) ($line['tip'] ?? 0));

        return (string) $line['method'] === 'cash'
            ? $this->cashRevenue
            : (int) $line['amount'] - $tip;
    }

    /**
     * @return array<string, int|bool>
     */
    public function toArray(): array
    {
        return [
            'due' => $this->due,
            'offered' => $this->offered,
            'applied' => $this->applied,
            'cash_to_collect' => $this->cashToCollect(),
            'rounding' => $this->rounding,
            'tips' => $this->tips,
            'change' => $this->change,
            'settled' => $this->settled,
            'remaining' => $this->remaining,
        ];
    }
}
