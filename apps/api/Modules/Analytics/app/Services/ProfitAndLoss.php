<?php

declare(strict_types=1);

namespace Modules\Analytics\Services;

use App\Support\Tenancy\TenantContext;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Analytics\Models\DailyFact;
use Modules\Finance\Models\Expense;
use Modules\Finance\Services\Depreciation;

/**
 * One calendar month's profit and loss.
 *
 * ---------------------------------------------------------------------------
 * Why a calendar month, when every other report here takes `?period=`
 *
 * `ReportWindow` speaks `today | week | month`, and `month` means the trailing
 * thirty trading days ending today — never "July". That is the right window for
 * a dashboard and the wrong one for a statement: a P&L is a document with a
 * month's name at the top, filed against a month's tax return, compared against
 * the month before it. A trailing thirty days cannot be any of those things, and
 * a statement that quietly meant "the last thirty days" while its heading said
 * "Iyul" is the kind of error nobody catches until an audit.
 *
 * So this takes `YYYY-MM` and nothing else, and the previous month comes with
 * it — the comparison column is the reason the document exists.
 *
 * ---------------------------------------------------------------------------
 * `analytics.daily_facts`, not the orders table
 *
 * Two figures on this statement cross a module boundary Analytics may not
 * cross: labour lives in Staff, waste in Inventory. Both arrive nightly through
 * `analytics:rollup` into `daily_facts`, which is what makes a month of labour
 * one scan instead of thirty contract calls. Revenue and cost of sales are in
 * the same table for the same window, so the whole statement is one query per
 * month rather than five over three modules.
 *
 * The cost of that: a figure here is at most a day old, and `computed_at` says
 * so. A statement that hid its own staleness would be worse.
 *
 * ---------------------------------------------------------------------------
 * What is still missing, named rather than invented
 *
 * **Cost of sales is partial and says so.** `cogs_coverage_percent` is the share
 * of what sold that has a costed recipe card. A gross profit derived from a
 * partial cost base overstates itself by exactly the share of the menu nobody
 * has costed — which is the number an owner is least able to check — so the
 * coverage travels with the figure and a client decides whether to draw it.
 * `overview-server.ts` already refuses to draw it for the same reason.
 *
 * **Loan interest and profit tax have no home on this platform.** No loan
 * schedule, no tax computation. They are absent rather than zeroed: a zero on a
 * statement is a claim that there were none.
 *
 * Depreciation IS here now — `finance.fixed_assets` and `Depreciation` — which
 * is the line this statement was missing and the reason a fit-out used to wipe
 * out the month it was bought in.
 */
final class ProfitAndLoss
{
    public function __construct(
        private readonly TenantContext $tenants,
        private readonly Depreciation $depreciation,
    ) {}

    /**
     * @param string $month `YYYY-MM`
     * @param int|null $branchId Null is the business, which is how an owner reads it
     *
     * @return array<string, mixed>
     */
    public function forMonth(string $month, ?int $branchId = null): array
    {
        $previous = $this->monthBefore($month);

        $now = $this->facts($month, $branchId);
        $before = $this->facts($previous, $branchId);

        $vat = $this->vatPercent();

        // Q1: the menu price includes VAT, so a statement shows takings net of
        // it — `total / 1.12`, with the restaurant's own rate rather than a
        // constant twelve. Integer arithmetic: `× 100 ÷ (100 + rate)`.
        $net = static fn (int $gross): int => $vat <= 0 ? $gross : intdiv($gross * 100, 100 + $vat);

        $expenses = $this->expensesByCategory($month);
        $expensesTotal = array_sum(array_column($expenses, 'amount_tiyin'));

        $depreciation = $this->depreciation->forMonth($month, $branchId);

        $revenueNet = $net($now['revenue_tiyin']);
        $previousNet = $net($before['revenue_tiyin']);

        /*
         * EBITDA before depreciation, operating profit after it — and both are
         * published rather than one derived from the other by the reader.
         *
         * Cost of sales is included in both even though it is partial, because
         * excluding it would overstate the profit by the whole food cost rather
         * than by the uncosted share of it. `cogs_coverage_percent` is what says
         * how much to trust the result.
         */
        $ebitda = $revenueNet - $now['cogs_tiyin'] - $now['labour_tiyin'] - $expensesTotal;

        return [
            'month' => $month,
            'previous_month' => $previous,
            'window' => ['from' => $now['from'], 'to' => $now['to']],
            'vat_percent' => $vat,
            'branch_id' => $branchId,

            /*
             * The revenue split the statement is drawn with, by menu category.
             *
             * Not in `daily_facts` — the projection carries one revenue figure —
             * so it is read live from the bills, which Analytics may do: Menu
             * and Orders are both recorded edges. It is the one figure on this
             * statement that is NOT a day old, and that asymmetry is fine: the
             * split is a proportion of a total the projection already agrees
             * with.
             *
             * Keyed by the category's SLUG rather than its name, because a name
             * is jsonb in three languages and a client grouping by it would be
             * grouping by whichever one it happened to read.
             */
            'revenue_by_category' => $this->revenueByCategory($month, $branchId),

            'revenue' => [
                'gross_tiyin' => $now['revenue_tiyin'],
                'net_tiyin' => $revenueNet,
                'previous_net_tiyin' => $previousNet,
                'discounts_tiyin' => $now['discounts_tiyin'],
                // Null rather than 0% when there is nothing to compare against:
                // a first month showing "+0.0%" claims it matched a month that
                // does not exist.
                'delta_percent' => $previousNet === 0
                    ? null
                    : round((($revenueNet - $previousNet) / $previousNet) * 100, 1),
            ],

            'cost_of_sales' => [
                'tiyin' => $now['cogs_tiyin'],
                'coverage_percent' => $now['cogs_coverage_percent'],
            ],

            'labour' => [
                'tiyin' => $now['labour_tiyin'],
                'previous_tiyin' => $before['labour_tiyin'],
            ],

            'waste' => ['tiyin' => $now['waste_tiyin']],

            'expenses' => $expenses,
            'expenses_total_tiyin' => $expensesTotal,
            'depreciation_tiyin' => $depreciation,

            'totals' => [
                'ebitda_tiyin' => $ebitda,
                'operating_profit_tiyin' => $ebitda - $depreciation,
            ],

            'counts' => [
                'orders' => $now['orders_count'],
                'guests' => $now['guests_count'],
            ],

            /*
             * How much of the month the projection actually covers, and when it
             * was last built.
             *
             * A month with eleven days of facts is not a month, and a client
             * that could not tell would draw a July statement out of eleven
             * days of July. `analytics:rollup --from --to` backfills the rest.
             */
            'source' => [
                'days' => $now['days'],
                'expected_days' => $now['expected_days'],
                'computed_at' => $now['computed_at'],
            ],
        ];
    }

    // ============ Internals ============

    /**
     * One month of the projection, summed.
     *
     * @return array{
     *     from: string, to: string, days: int, expected_days: int,
     *     computed_at: string|null, revenue_tiyin: int, discounts_tiyin: int,
     *     cogs_tiyin: int, cogs_coverage_percent: int, labour_tiyin: int,
     *     waste_tiyin: int, orders_count: int, guests_count: int
     * }
     */
    private function facts(string $month, ?int $branchId): array
    {
        [$from, $to] = $this->bounds($month);

        $query = DailyFact::query()
            ->whereBetween('business_date', [$from, $to]);

        /*
         * A null branch means the roll-up row, NOT every venue.
         *
         * `BelongsToBranch` does the platform's usual thing — an unset branch
         * does not filter — so summing without this would add the group total to
         * every venue that makes it up and report a restaurant that earned
         * twice. `DailyFact::scopeRollup()` exists for exactly this.
         */
        $query = $branchId === null
            ? $query->rollup()
            : $query->where('branch_id', $branchId);

        $row = $query->toBase()->selectRaw(
            'count(*) as days,'
            .' max(computed_at) as computed_at,'
            .' coalesce(sum(revenue_tiyin), 0) as revenue_tiyin,'
            .' coalesce(sum(discounts_tiyin), 0) as discounts_tiyin,'
            .' coalesce(sum(cogs_tiyin), 0) as cogs_tiyin,'
            .' coalesce(sum(labour_tiyin), 0) as labour_tiyin,'
            .' coalesce(sum(waste_tiyin), 0) as waste_tiyin,'
            .' coalesce(sum(orders_count), 0) as orders_count,'
            .' coalesce(sum(guests_count), 0) as guests_count,'
            /*
             * Coverage weighted by revenue, not averaged across days.
             *
             * A quiet Monday where the only dish sold happened to be costed
             * would otherwise pull a month's coverage up by a whole day's worth.
             * The weight is the day's own takings, which is what the percentage
             * is a share of.
             */
            .' case when coalesce(sum(revenue_tiyin), 0) = 0 then 0'
            .'   else round(sum(cogs_coverage_percent * revenue_tiyin)::numeric'
            .'     / nullif(sum(revenue_tiyin), 0)) end as cogs_coverage_percent',
        )->first();

        return [
            'from' => $from,
            'to' => $to,
            'days' => (int) ($row->days ?? 0),
            'expected_days' => (int) Carbon::parse($from)->daysInMonth,
            'computed_at' => $row?->computed_at === null ? null : (string) $row->computed_at,
            'revenue_tiyin' => (int) ($row->revenue_tiyin ?? 0),
            'discounts_tiyin' => (int) ($row->discounts_tiyin ?? 0),
            'cogs_tiyin' => (int) ($row->cogs_tiyin ?? 0),
            'cogs_coverage_percent' => (int) ($row->cogs_coverage_percent ?? 0),
            'labour_tiyin' => (int) ($row->labour_tiyin ?? 0),
            'waste_tiyin' => (int) ($row->waste_tiyin ?? 0),
            'orders_count' => (int) ($row->orders_count ?? 0),
            'guests_count' => (int) ($row->guests_count ?? 0),
        ];
    }

    /**
     * The month's outgoings, grouped by the heading they were filed under.
     *
     * Read from `finance.expenses` rather than from `daily_facts.expenses_tiyin`,
     * and the difference is the whole point of the section: the projection
     * carries one total and a statement needs the split. The edge is the one
     * `ModuleBoundaryTest` records — *"Reporting reads payments and expenses for
     * the P&L"* — and it reads, never writes.
     *
     * Ranged on `business_date`, never `whereMonth()`: that wraps the column in
     * a function and PostgreSQL drops the index on the table that grows fastest.
     *
     * Expenses carry no `branch_id`, so a per-venue statement shows the venue's
     * revenue against the BUSINESS's overheads. That is stated in the payload
     * rather than silently corrected, because splitting rent between five venues
     * by a rule this module invented would be a made-up number on a signed
     * document.
     *
     * @return list<array{category: string, amount_tiyin: int, entries: int}>
     */
    private function expensesByCategory(string $month): array
    {
        [$from, $to] = $this->bounds($month);

        /** @var list<object{category: string, total: int|string, entries: int}> $rows */
        $rows = Expense::query()
            ->whereBetween('business_date', [$from, $to])
            ->toBase()
            ->select('category')
            ->selectRaw('coalesce(sum(amount), 0) as total, count(*) as entries')
            ->groupBy('category')
            ->orderByRaw('sum(amount) desc')
            ->get()
            ->all();

        return array_map(static fn (object $row): array => [
            'category' => (string) $row->category,
            'amount_tiyin' => (int) $row->total,
            'entries' => (int) $row->entries,
        ], $rows);
    }

    /**
     * What each part of the menu earned this month.
     *
     * Joined through `menu_item_id` rather than grouped on the bill line's own
     * `sku` snapshot, and that is the same choice `SalesInsights::byCategory()`
     * makes with the same reasoning: a category is a property of the CATALOGUE,
     * so a dish moved from Salads to Starters last month reports under Starters
     * today. The snapshot exists to freeze the price and the name a guest paid,
     * not the shelf the dish sits on.
     *
     * Row-level security is what scopes this to one restaurant — a raw builder
     * carries no Eloquent global scope, which is exactly the query class the
     * database policies exist for. The BRANCH has no such backstop and is
     * applied by hand, because an unset branch means "all of them" and a raw
     * query that forgot it would report the estate's revenue as one venue's.
     *
     * @return list<array{slug: string, name: mixed, revenue_tiyin: int}>
     */
    private function revenueByCategory(string $month, ?int $branchId): array
    {
        [$from, $to] = $this->bounds($month);

        $rows = DB::table('orders.order_items as i')
            ->join('orders.orders as o', 'o.id', '=', 'i.order_id')
            ->join('menu.menu_items as m', 'm.id', '=', 'i.menu_item_id')
            ->join('menu.menu_categories as c', 'c.id', '=', 'm.menu_category_id')
            ->where('o.status', 'paid')
            ->whereBetween('o.business_date', [$from, $to])
            ->whereNull('i.deleted_at')
            ->whereNull('o.deleted_at')
            ->where('i.status', '<>', 'cancelled')
            ->when($branchId !== null, fn ($query) => $query->where('o.branch_id', $branchId))
            // By the primary key alone — naming a `json` column in a GROUP BY is
            // an error in PostgreSQL rather than a style question.
            ->groupBy('c.id')
            ->selectRaw('c.id, c.slug, c.name')
            ->selectRaw('coalesce(sum(i.total_price), 0)::bigint as revenue')
            ->orderByRaw('revenue desc')
            ->get();

        return $rows->map(fn (object $row): array => [
            'slug' => (string) $row->slug,
            'name' => json_decode((string) $row->name, true) ?: (string) $row->name,
            'revenue_tiyin' => (int) $row->revenue,
        ])->all();
    }

    /** @return array{0: string, 1: string} */
    private function bounds(string $month): array
    {
        $start = Carbon::parse($month.'-01')->startOfDay();

        return [$start->toDateString(), $start->copy()->endOfMonth()->toDateString()];
    }

    private function monthBefore(string $month): string
    {
        return Carbon::parse($month.'-01')->subMonthNoOverflow()->format('Y-m');
    }

    /**
     * The restaurant's own rate.
     *
     * Twelve is the fallback and the platform's default (`TenantProvisioner`), not
     * a constant: a business that is not registered for VAT sets its own, and a
     * statement that divided its takings by 1.12 anyway would understate revenue
     * by twelve per cent on a document going to a bank.
     */
    private function vatPercent(): int
    {
        return (int) ($this->tenants->tenant()?->settings['vat_percent'] ?? 12);
    }
}
