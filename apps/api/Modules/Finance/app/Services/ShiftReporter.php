<?php

declare(strict_types=1);

namespace Modules\Finance\Services;

use App\Contracts\Finance\ShiftTotals;
use Illuminate\Support\Facades\DB;
use Modules\Finance\Models\CashCount;
use Modules\Finance\Models\CashMovement;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\FiscalReceipt;
use Modules\Finance\Support\VariancePolicy;

/**
 * The X-report and the Z-report, which are one document read at two moments.
 *
 * The plan names its four sections and their order, and the order is the
 * argument: turnover, then how it was paid, then the drawer, then the
 * adjustments. A cashier reads down it and each section explains the next —
 * this is what we sold, this is which of it came in notes, this is therefore
 * what should be in the box, and these are the reasons the box is not exactly
 * that. Put the adjustments first and the same figures become a defence; put
 * them last and they are an explanation.
 *
 * ---------------------------------------------------------------------------
 * Two properties this class exists to hold
 *
 * **The X and the Z name the same expected cash.** Both read it from
 * `CashShift::computeExpectedCash()` — the one formula, on the model, which
 * `close()` also uses. It was written twice once, and the two copies agreed
 * until tips and cash rounding entered one of them; what a restaurant saw was a
 * cashier counting against a figure the terminal had shown her all evening and
 * being held to a different one. See ShiftReportAgreementTest.
 *
 * **A closed Z never changes.** It is a document — it gets two signatures and
 * goes in a folder — so it is written to `cash_shifts.z_report` at closing and
 * read back verbatim afterwards. Recomputing it was not a hypothetical problem:
 * refund one of yesterday's bills this afternoon and yesterday's takings, split
 * by method and bill count all move, with nothing to say they did. The stored
 * `expected_cash` was already frozen for exactly this reason; this is the rest
 * of the same page.
 */
final class ShiftReporter
{
    public function __construct(private readonly VariancePolicy $variance) {}

    /**
     * The document, as it stands or as it was signed.
     *
     * An open shift is computed now, because that is the question an X-report
     * asks. A closed one comes back from the row, because that is the question a
     * Z-report answered.
     *
     * @return array<string, mixed>
     */
    public function document(CashShift $shift): array
    {
        $stored = $shift->z_report;

        if ($shift->status === 'closed' && is_array($stored) && $stored !== []) {
            return $stored;
        }

        return $this->report($shift);
    }

    /**
     * Work the whole thing out from the rows, now.
     *
     * @return array<string, mixed>
     */
    public function report(CashShift $shift): array
    {
        $terms = $shift->expectedCashTerms();
        $isClosed = $shift->status === 'closed';
        $difference = $isClosed ? (int) $shift->difference : null;

        return [
            'shift' => $this->identity($shift),
            'turnover' => $this->turnover($shift),
            'methods' => $this->methods($shift),
            'drawer' => $this->drawer($shift, $terms),
            'adjustments' => $this->adjustments($shift, $terms),
            /*
             * What the difference demands, on the X as well as the Z.
             *
             * Deliberately answered before the drawer is counted: a cashier who
             * is told at eight o'clock that tonight's gap will need the manager
             * can fetch them while they are still on the floor, rather than
             * discovering it at midnight with the notes already counted and the
             * manager gone home.
             */
            'variance' => $this->variance->verdictFor($difference ?? 0)->toArray(),
            'fiscal' => $this->fiscal($shift),
            'signatures' => $this->signatures($shift),
        ];
    }

    /**
     * The same figures as the contract DTO the POS reads.
     *
     * Built from {@see document()} rather than from a second set of queries, so
     * the till, the console and the printed sheet cannot disagree — including
     * after a close, where the document is the frozen one.
     */
    public function totals(CashShift $shift): ShiftTotals
    {
        $document = $this->document($shift);

        /** @var array<string, mixed> $turnover */
        $turnover = $document['turnover'];
        /** @var array<string, mixed> $drawer */
        $drawer = $document['drawer'];
        /** @var array<string, mixed> $adjustments */
        $adjustments = $document['adjustments'];
        /** @var list<array<string, mixed>> $methods */
        $methods = $document['methods'];

        $byMethod = [];

        foreach ($methods as $row) {
            $byMethod[(string) $row['method']] = (int) $row['amount'];
        }

        /** @var array<string, mixed> $tips */
        $tips = $adjustments['tips'];

        return new ShiftTotals(
            shiftId: (int) $shift->getKey(),
            status: (string) $shift->status,
            openingCash: (int) $drawer['opening_cash'],
            cashTaken: (int) $drawer['cash_taken'],
            cashPaidOut: (int) $drawer['cash_paid_out'],
            expectedCash: (int) $drawer['expected_cash'],
            countedCash: $drawer['counted_cash'] === null ? null : (int) $drawer['counted_cash'],
            difference: $drawer['difference'] === null ? null : (int) $drawer['difference'],
            totalTakings: (int) $turnover['takings'],
            refunded: (int) $turnover['refunded'],
            paymentCount: (int) $turnover['payments'],
            byMethod: $byMethod,
            tips: (int) $tips['total'],
            rounding: (int) $adjustments['rounding'],
            fees: (int) $adjustments['fees'],
        );
    }

    // ============ Sections ============

    /**
     * @return array<string, mixed>
     */
    private function identity(CashShift $shift): array
    {
        return [
            'id' => (int) $shift->getKey(),
            'number' => (string) $shift->number,
            'status' => (string) $shift->status,
            'branch_id' => $shift->branch_id === null ? null : (int) $shift->branch_id,
            'opened_at' => $shift->opened_at->toIso8601String(),
            'locked_at' => $shift->locked_at?->toIso8601String(),
            'closed_at' => $shift->closed_at?->toIso8601String(),
            'opened_by_user_id' => $shift->opened_by_user_id === null ? null : (int) $shift->opened_by_user_id,
            /*
             * Who opened it, by name.
             *
             * The console prints "opened at 09:00 by …" over the drawer, and
             * until now the name came from the message catalogue — one demo
             * cashier on every restaurant's till screen. An id cannot be shown
             * to a person, and the signatures block below already resolves
             * names the same way.
             */
            'opened_by' => $shift->openedBy?->name,
            'closed_by_user_id' => $shift->closed_by_user_id === null ? null : (int) $shift->closed_by_user_id,
            'approved_by_user_id' => $shift->approved_by_user_id === null ? null : (int) $shift->approved_by_user_id,
            'handed_over_to_shift_id' => $shift->handed_over_to_shift_id === null
                ? null
                : (int) $shift->handed_over_to_shift_id,
        ];
    }

    /**
     * What the restaurant sold, before anything about how it was paid.
     *
     * @return array<string, mixed>
     */
    private function turnover(CashShift $shift): array
    {
        $captured = $shift->payments()->where('status', 'captured');

        $takings = (int) (clone $captured)->sum('amount');

        /*
         * Bills, not payments. A table of four paying with two cards and a
         * handful of notes is one bill and three payment rows, and an average
         * cheque computed off the payment count would report a third of what
         * the restaurant actually charges a table.
         *
         * Rows with no order id are counted as one bill each — those are the
         * takings that arrived without a bill behind them, and folding them all
         * into a single phantom bill would be worse than counting them apart.
         */
        $bills = (int) (clone $captured)->distinct()->count(DB::raw('coalesce(order_id::text, \'p\' || id)'));

        return [
            'takings' => $takings,
            'refunded' => (int) $shift->payments()->where('status', 'refunded')->sum('amount'),
            'bills' => $bills,
            'payments' => (int) (clone $captured)->count(),
            // Integer division, in tiyin: an average cheque is a headline figure
            // and a fraction of a tiyin in it is noise pretending to be precision.
            'average_bill' => $bills > 0 ? intdiv($takings, $bills) : 0,
        ];
    }

    /**
     * How the money arrived, one row per method.
     *
     * `net` is what the restaurant actually receives: the acquirer's cut comes
     * off later and from an account rather than from tonight's notes, so it
     * never touches `amount` — but an owner comparing card revenue against a
     * bank statement is comparing two figures that differ by exactly this, and
     * doing that subtraction by hand is how a margin report gets guessed at.
     *
     * @return list<array<string, mixed>>
     */
    private function methods(CashShift $shift): array
    {
        /*
         * `toBase()`: these are aggregates, not payments.
         *
         * Hydrating five sums into a Payment model would produce something that
         * looks like a payment row and is not one — an object with an `amount`
         * that is the sum of many and an `id` that belongs to none of them. Rows
         * of plain values cannot be mistaken for that.
         */
        $rows = $shift->payments()
            ->where('status', 'captured')
            ->selectRaw('method, count(*) as payments, sum(amount) as amount, sum(tip) as tips, sum(fee_amount) as fees')
            ->groupBy('method')
            ->orderByRaw('sum(amount) desc')
            ->toBase()
            ->get();

        return $rows->map(static function (object $row): array {
            $amount = (int) $row->amount;
            $fees = (int) $row->fees;

            return [
                'method' => (string) $row->method,
                'payments' => (int) $row->payments,
                'amount' => $amount,
                'tips' => (int) $row->tips,
                'fees' => $fees,
                'net' => $amount - $fees,
            ];
        })->values()->all();
    }

    /**
     * The box: every term of the expected figure, then what was found in it.
     *
     * The terms are listed rather than summarised because the sum is the number
     * a person is held to, and "expected 900 000" with no working is not
     * something anybody can check. They come from the model's own
     * `cashMovements()` — the same array `computeExpectedCash()` adds up — so a
     * report cannot show one set of components and a total derived from another.
     *
     * @param array{opening: int, cash_in: int, rounding: int, cash_tips: int, brought_in: int, cash_out: int} $terms
     *
     * @return array<string, mixed>
     */
    private function drawer(CashShift $shift, array $terms): array
    {
        $isClosed = $shift->status === 'closed';

        return [
            'opening_cash' => $terms['opening'],
            'cash_taken' => $terms['cash_in'],
            'cash_rounding' => $terms['rounding'],
            'cash_tips' => $terms['cash_tips'],
            'cash_brought_in' => $terms['brought_in'],
            'cash_paid_out' => $terms['cash_out'],
            'expected_cash' => $isClosed ? (int) $shift->expected_cash : $shift->computeExpectedCash(),
            'counted_cash' => $isClosed ? (int) $shift->counted_cash : null,
            'difference' => $isClosed ? (int) $shift->difference : null,
            'difference_reason' => $shift->difference_reason,
            'counts' => $this->counts($shift),
        ];
    }

    /**
     * Every time this drawer was counted, and by whom.
     *
     * @return list<array<string, mixed>>
     */
    private function counts(CashShift $shift): array
    {
        return $shift->cashCounts()
            ->with(['countedBy:id,name', 'witnessedBy:id,name'])
            ->orderBy('counted_at')
            ->get()
            ->map(static fn (CashCount $count): array => [
                'id' => (int) $count->getKey(),
                'kind' => $count->kind,
                'total' => $count->total,
                'note_count' => $count->note_count,
                'breakdown' => $count->breakdown,
                'counted_at' => $count->counted_at->toIso8601String(),
                'counted_by' => $count->countedBy?->name,
                'witnessed_by' => $count->witnessedBy?->name,
                'note' => $count->note,
            ])->all();
    }

    /**
     * The reasons the drawer is not simply "float plus sales".
     *
     * This section exists so that a gap of a few thousand so'm has a name.
     * Without it every one of these lands on the person who counted, and a
     * cashier who is blamed for the acquirer's percentage twice stops reading
     * the report at all.
     *
     * @param array{opening: int, cash_in: int, rounding: int, cash_tips: int, brought_in: int, cash_out: int} $terms
     *
     * @return array<string, mixed>
     */
    private function adjustments(CashShift $shift, array $terms): array
    {
        $captured = $shift->payments()->where('status', 'captured');

        $tips = (int) (clone $captured)->sum('tip');
        $refunded = $shift->payments()->where('status', 'refunded');

        return [
            'rounding' => $terms['rounding'],
            'tips' => [
                'total' => $tips,
                // Split, because the waiter is owed both and the drawer holds
                // only one. A report that counted all of them into the box would
                // show a surplus every night a guest tipped on a card.
                'cash' => $terms['cash_tips'],
                'non_cash' => $tips - $terms['cash_tips'],
            ],
            'fees' => (int) (clone $captured)->sum('fee_amount'),
            'refunds' => [
                'count' => (int) (clone $refunded)->count(),
                'amount' => (int) (clone $refunded)->sum('amount'),
            ],
            'payouts' => $this->payouts($shift, $terms),
            'brought_in' => $this->broughtIn($shift, $terms),
        ];
    }

    /**
     * Money that left the drawer, by why.
     *
     * A collection to the safe and a supplier paid in notes are both cash out
     * and neither is a shortfall, but they are not the same event and a manager
     * reading one number cannot tell them apart.
     *
     * @param array{opening: int, cash_in: int, rounding: int, cash_tips: int, brought_in: int, cash_out: int} $terms
     *
     * @return array<string, mixed>
     */
    private function payouts(CashShift $shift, array $terms): array
    {
        $byCategory = $shift->expenses()
            ->where('paid_in_cash', true)
            ->selectRaw('category, sum(amount) as total')
            ->groupBy('category')
            ->pluck('total', 'category')
            ->map(static fn ($total): int => (int) $total)
            ->all();

        return [
            'cash' => $terms['cash_out'],
            'by_category' => $byCategory,
            // Recorded against the shift but never out of the box — a rent
            // transfer does not move a banknote, and counting it would report
            // the drawer short by the rent.
            'non_cash' => (int) $shift->expenses()->where('paid_in_cash', false)->sum('amount'),
        ];
    }

    /**
     * Notes somebody put in that nobody bought anything with.
     *
     * Listed rather than netted into the takings, because it is not takings: a
     * manager fetching 50 000 so'm of small notes so the till can give change has
     * not sold anything. Before it was recorded the drawer simply came out over
     * by that much at closing, which reads as a cashier who cannot count.
     *
     * @param array{opening: int, cash_in: int, rounding: int, cash_tips: int, brought_in: int, cash_out: int} $terms
     *
     * @return array<string, mixed>
     */
    private function broughtIn(CashShift $shift, array $terms): array
    {
        return [
            'cash' => $terms['brought_in'],
            'movements' => $shift->cashMovements()
                ->where('direction', 'in')
                ->orderBy('occurred_at')
                ->get()
                ->map(static fn (CashMovement $movement): array => [
                    'id' => (int) $movement->getKey(),
                    'amount' => $movement->amount,
                    'reason' => $movement->reason,
                    'occurred_at' => $movement->occurred_at->toIso8601String(),
                ])->all(),
        ];
    }

    /**
     * Whether tonight's meals were actually declared.
     *
     * On the Z because a shift closes whether or not the tax service was
     * answering — a dead fiscal module never blocks a sale, which is the right
     * rule and the reason this figure has to appear somewhere a person reads.
     * Without it the deferral becomes a quiet way of never filing anything.
     *
     * `expired` is the number that matters. `pending` is a queue and will
     * probably clear itself; expired means the window closed on a meal that was
     * sold and never declared, and no amount of waiting fixes it.
     *
     * @return array<string, mixed>
     */
    private function fiscal(CashShift $shift): array
    {
        $counts = FiscalReceipt::query()
            ->where('cash_shift_id', $shift->getKey())
            ->selectRaw('status, count(*) as documents, sum(total) as total')
            ->groupBy('status')
            ->toBase()
            ->get()
            ->keyBy('status');

        $of = static fn (string $status, string $column): int => (int) ($counts[$status]->{$column} ?? 0);

        return [
            'registered' => $of('registered', 'documents'),
            'pending' => $of('pending', 'documents') + $of('sent', 'documents'),
            'expired' => $of('expired', 'documents'),
            'voided' => $of('void', 'documents'),
            // In tiyin, so a manager can see what the undeclared meals came to
            // rather than only how many of them there were.
            'pending_total' => $of('pending', 'total') + $of('sent', 'total'),
            'expired_total' => $of('expired', 'total'),
        ];
    }

    /**
     * The two names the Z prints a line under.
     *
     * @return array<string, mixed>
     */
    private function signatures(CashShift $shift): array
    {
        /** @var CashCount|null $closing */
        $closing = $shift->cashCounts()
            ->whereIn('kind', ['close', 'handover'])
            ->with(['countedBy:id,name', 'witnessedBy:id,name'])
            ->latest('counted_at')
            ->first();

        return [
            'counted_by' => $closing?->countedBy?->name,
            'witnessed_by' => $closing?->witnessedBy?->name,
            'approved_by' => $shift->approvedBy?->name,
        ];
    }
}
