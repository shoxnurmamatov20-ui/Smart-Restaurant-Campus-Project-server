<?php

declare(strict_types=1);

namespace Modules\Analytics\Services;

use App\Support\Tenancy\BranchContext;
use Carbon\CarbonImmutable;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;

/**
 * Money in and money out, month by month.
 *
 * The console's finance screen draws six bars — in and out for each of the last
 * six months — and until now it could not: the only thing that answered "what
 * came in and what went out" was `GET /analytics/profit-loss?month=`, one month
 * per call. Six months meant six round trips for one sparkline, so the panel was
 * hidden rather than drawn from the design's own figures. A cash-flow chart is
 * the kind of picture an owner repeats to a bank.
 *
 * ---------------------------------------------------------------------------
 * This is CASH, not profit, and the two disagree on purpose
 *
 * `in` is what was actually taken — captured payments, at face value. `out` is
 * what was actually spent — expense rows. Neither is the P&L: revenue there is
 * net of VAT and includes credit sales nobody has paid for yet, and the cost of
 * sales is what was consumed rather than what was bought. A month can be
 * profitable and short of cash, which is precisely the thing this chart exists
 * to show, so netting the two against the statement would erase it.
 *
 * ---------------------------------------------------------------------------
 * Grouped on `business_date`
 *
 * The trading day, never the calendar one (see `ReportWindow` for the full
 * reasoning). A payment taken at 01:30 on the 1st belongs to the evening of the
 * 31st and to the month that is closing — which is the month an accountant is
 * about to sign off.
 *
 * ---------------------------------------------------------------------------
 * The venue narrows the takings and not the outgoings
 *
 * `finance.payments` carries `branch_id`; `finance.expenses` does not, because
 * an expense is filed by the business (rent, an accountant's fee, a licence)
 * and the ones that do belong to a venue reach it through the till that paid
 * them. So a branch-scoped read answers that venue's takings against the whole
 * business's outgoings — stated here and in the response's own `scope` field,
 * rather than quietly showing a branch a profit it does not have.
 */
final class CashflowSeries
{
    /** As many months as the console's chart has room for. */
    public const MAX_MONTHS = 24;

    public function __construct(private readonly BranchContext $branches) {}

    /**
     * The last `$months` calendar months, oldest first.
     *
     * Every month in the range is present even when nothing happened in it: a
     * chart that skipped an empty February would draw eleven bars for a year
     * and put March where February was.
     *
     * @return array<string, mixed>
     */
    public function forMonths(int $months): array
    {
        $months = min(max($months, 1), self::MAX_MONTHS);
        $branchId = $this->branches->id();

        // The current trading month is included: an owner opening this in the
        // third week wants to see how the running month compares, and a chart
        // that stopped at last month would be answering a question nobody asked.
        $last = CarbonImmutable::now()->startOfMonth();
        $first = $last->subMonths($months - 1);

        $takings = Payment::query()
            ->captured()
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->whereBetween('business_date', [$first->toDateString(), $last->endOfMonth()->toDateString()])
            // `to_char`, not a PHP grouping: a month of a chain's payments is
            // tens of thousands of rows and none of them need to be hydrated to
            // be added up.
            ->groupByRaw("to_char(business_date, 'YYYY-MM')")
            ->selectRaw("to_char(business_date, 'YYYY-MM') as month")
            ->selectRaw('coalesce(sum(amount), 0)::bigint as total')
            ->toBase()
            ->pluck('total', 'month');

        $outgoings = Expense::query()
            ->whereBetween('business_date', [$first->toDateString(), $last->endOfMonth()->toDateString()])
            ->groupByRaw("to_char(business_date, 'YYYY-MM')")
            ->selectRaw("to_char(business_date, 'YYYY-MM') as month")
            ->selectRaw('coalesce(sum(amount), 0)::bigint as total')
            ->toBase()
            ->pluck('total', 'month');

        $series = [];

        for ($index = 0; $index < $months; $index++) {
            $month = $first->addMonths($index)->format('Y-m');
            $in = (int) ($takings[$month] ?? 0);
            $out = (int) ($outgoings[$month] ?? 0);

            $series[] = [
                'month' => $month,
                'in_tiyin' => $in,
                'out_tiyin' => $out,
                // Stated rather than left to the client. Three readers each
                // subtracting is three places a sign can be flipped, and this
                // one is drawn as a bar above or below a line.
                'net_tiyin' => $in - $out,
            ];
        }

        return [
            'months' => $months,
            'from' => $first->format('Y-m'),
            'to' => $last->format('Y-m'),
            'branch_id' => $branchId,
            /*
             * What the two halves are actually scoped to, said out loud.
             *
             * A reader looking at one venue's page has to know that the money
             * going out is the whole business's — see the class comment. This
             * is the field a screen prints its footnote from.
             */
            'scope' => [
                'in' => $branchId === null ? 'business' : 'branch',
                'out' => 'business',
            ],
            'series' => $series,
        ];
    }
}
