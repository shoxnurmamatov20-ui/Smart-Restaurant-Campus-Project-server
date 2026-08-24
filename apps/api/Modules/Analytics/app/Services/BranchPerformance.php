<?php

declare(strict_types=1);

namespace Modules\Analytics\Services;

use App\Models\Branch;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Modules\Analytics\Models\DailyFact;

/**
 * Every venue side by side, over one window and against the one before it.
 *
 * ---------------------------------------------------------------------------
 * Why this reads the projection rather than the orders
 *
 * `SalesInsights` derives the restaurant's headline figures live and argues
 * well for it. That argument does not survive being asked nine questions about
 * five venues at once: revenue, covers and discounts could still be scanned out
 * of `orders.orders`, but **labour** could not — it lives in Staff, a module
 * `ModuleBoundaryTest` does not let this one read, and it arrives through
 * `App\Contracts\Staff\Roster` one branch-day at a time. A month of labour
 * share for five venues is a hundred and fifty contract calls made one by one,
 * or one grouped scan of `analytics.daily_facts`.
 *
 * So this report reads only the projection. Mixing sources would be worse than
 * slow: the revenue on a row would be live to the second while the labour
 * beside it was last night's, and the percentage between them would be a ratio
 * of two different days that nobody could reproduce.
 *
 * ---------------------------------------------------------------------------
 * Two figures the projection deliberately leaves at zero per venue
 *
 * `expenses_tiyin` and `waste_tiyin` are written only onto the business
 * roll-up row — `DailyRollup` explains why: an expense and a shelf carry no
 * branch on this platform, and copying either to five venues would make the
 * venues sum to five times the truth. Neither appears in a column here and
 * neither is a guard-rail below, because a rail that fires identically on
 * every venue is not telling anyone which venue to visit.
 *
 * ---------------------------------------------------------------------------
 * Percentages are of the venue's own revenue
 *
 * `branches-data.ts` states the reason: it is the only way a 96-seat room in
 * Chilonzor and a 52-seat one in Termiz can be read on the same row. A labour
 * cost expressed as a share of the GROUP's revenue would rank the venues by
 * size and say nothing about how any of them is run.
 *
 * @phpstan-type Totals array{revenue: int, takings: int, discounts: int, cogs: int, labour: int, orders: int, guests: int, coverage_weight: int}
 */
final class BranchPerformance
{
    /**
     * Ingredients above this share of a venue's own revenue.
     *
     * 35 rather than a rounder number because it is already this platform's
     * line: `foodCostTone()` on the console's Branches screen reddens the
     * column above 35, and `RoleDashboards::attention()` raises the
     * restaurant-wide card at the same figure. A second threshold invented here
     * would count a venue as an alert on one screen and not on the next.
     */
    private const FOOD_COST_CEILING_PERCENT = 35;

    /**
     * Payroll above this share of a venue's own revenue.
     *
     * Same argument, same pair of existing call sites: `labourTone()` reddens
     * above 30 and the dashboard card warns above 30. The fix is a rota, which
     * is why the console's card points at `/staff/shifts` rather than at a
     * report.
     */
    private const LABOUR_CEILING_PERCENT = 30;

    /**
     * Taking less than this share of the window's slice of the venue's own
     * monthly target.
     *
     * Raised only for a venue that HAS a target. A branch nobody has configured
     * has no rail to cross, and drawing an alert on it would send a manager
     * looking for a trading problem that is really a settings one. 90 rather
     * than 100 because a target met to the som never happens; a tenth short is
     * where the month stops being recoverable by one ordinary weekend.
     */
    private const TARGET_ATTAINMENT_FLOOR_PERCENT = 90;

    /**
     * Discounts above this share of revenue.
     *
     * Every discount on this platform is somebody's approval (P9), so a venue
     * giving away a tenth of what it rang up is an approval log to read rather
     * than a generous week. Blunt on purpose: the rail is a prompt to look, not
     * a verdict about anyone.
     */
    private const DISCOUNT_CEILING_PERCENT = 10;

    /**
     * Revenue that never became takings, above this share.
     *
     * Revenue is what the bills totalled and takings are what arrived; a credit
     * sale (P13) is the first without the second and is entirely legitimate. A
     * twentieth of a venue's revenue sitting unpaid is a debtor list somebody
     * has stopped working, which is the failure this rail is for — not the
     * credit tender itself.
     */
    private const UNBANKED_CEILING_PERCENT = 5;

    /**
     * The month a monthly target is divided by, to get the window's slice.
     *
     * Thirty because `ReportWindow`'s own `month` is thirty trading days, not
     * because months are thirty days long. Using 30 in one place and a calendar
     * length in the other would make every venue's attainment jump on the first
     * of a long month for no reason a manager could explain.
     */
    private const TARGET_MONTH_DAYS = 30;

    /**
     * The report the console's Branches screen draws.
     *
     * Scoped exactly as the caller is: with no `X-Branch` the branch scope does
     * not narrow and an owner gets every venue, while a manager pinned to one
     * gets one row. That is the platform's own "an empty branch is a roll-up"
     * rule, and it is what stops this endpoint being a way to read the estate
     * from inside a single venue.
     *
     * @return array{window: array{period: string, from: string, to: string, days: int}, currency: string, branches: list<array<string, mixed>>}
     */
    public function forWindow(ReportWindow $window): array
    {
        $pinned = app(BranchContext::class)->id();

        $venues = Branch::query()
            ->when($pinned !== null, fn (Builder $query): Builder => $query->whereKey($pinned))
            ->orderBy('name')
            ->get();

        $now = $this->factsByBranch($window->from, $window->to);
        $before = $this->factsByBranch($window->previousFrom, $window->previousTo);
        $headcount = $this->headcountByBranch();

        $rows = [];

        foreach ($venues as $venue) {
            $id = (int) $venue->getKey();

            $rows[] = $this->row(
                $venue,
                $window,
                $now[$id] ?? $this->nothing(),
                $before[$id] ?? $this->nothing(),
                $headcount[$id] ?? 0,
            );
        }

        /*
         * Biggest first, which is the order the screen's share rail is drawn
         * against: the rail measures each venue against the leader and reads
         * backwards if the leader is not the first row.
         */
        usort($rows, static fn (array $a, array $b): int => $b['revenue_tiyin'] <=> $a['revenue_tiyin']);

        return [
            'window' => $window->toArray(),
            'currency' => 'UZS',
            'branches' => $rows,
        ];
    }

    /**
     * One venue's row.
     *
     * @param Totals $now
     * @param Totals $before
     *
     * @return array<string, mixed>
     */
    private function row(Branch $venue, ReportWindow $window, array $now, array $before, int $staff): array
    {
        $revenue = $now['revenue'];
        $target = $this->monthlyTarget($venue);

        /*
         * Coverage, weighted by each day's revenue rather than averaged across
         * days — `SalesInsights::cogsCoverage()` gives the reason: a quiet
         * Monday whose only two dishes happened to be costed must not report
         * the menu as fully costed.
         */
        $coverage = $revenue > 0 ? (int) round($now['coverage_weight'] / $revenue) : 0;

        $foodCost = $this->share($now['cogs'], $revenue);

        return [
            'branch_id' => (int) $venue->getKey(),
            // A venue's name is a proper noun and is not a translated column.
            'name' => $venue->name,
            'city' => $venue->city,
            'revenue_tiyin' => $revenue,
            'orders_count' => $now['orders'],
            'guests_count' => $now['guests'],
            // Per BILL, like every other average cheque this module publishes:
            // a per-head figure moves whenever party sizes change rather than
            // when anything about the menu does.
            'average_cheque_tiyin' => $now['orders'] > 0 ? (int) round($revenue / $now['orders']) : 0,

            /*
             * Gross margin and food cost are two readings of one figure, and
             * are computed as one so a row can never show 62% margin beside
             * 39% food cost. Both are zero when nothing sold here has a costed
             * recipe: reporting a 100% margin because the cost base is empty is
             * the single most flattering possible lie about a kitchen, and
             * `cogs_coverage_percent` beside them is how a client tells "no
             * margin" apart from "nobody has costed the menu".
             */
            'margin_percent' => $now['cogs'] > 0 ? 100 - $foodCost : 0,
            'food_cost_percent' => $foodCost,
            'cogs_coverage_percent' => $coverage,

            'labour_percent' => $this->share($now['labour'], $revenue),
            'staff_count' => $staff,
            /*
             * The window's slice of the monthly target, in tiyin.
             *
             * Computed here and sent, rather than left for a caller to derive:
             * `alertsFor()` below already slices it exactly this way, and the
             * staff app draws an attainment bar against it. Three places
             * dividing a month by thirty is three places that can disagree
             * about a venue's day — and the one on a phone would be the one
             * nobody checks.
             *
             * Zero for a venue nobody has given a target, which the bar reads
             * as "no target set" rather than as a target of nothing.
             */
            'target_tiyin' => $target > 0
                ? intdiv($target * $window->days, self::TARGET_MONTH_DAYS)
                : 0,
            'open_alerts' => $this->alertsFor($now, $target, $window->days),

            /*
             * Against the previous window of the same length, which
             * `ReportWindow` derives once so that seven call sites cannot each
             * compare a week against a month and report a 400% rise.
             *
             * Zero when the venue took nothing in that window. There is no
             * percentage change from nothing, and "+100%" for a branch that
             * opened last Tuesday is a number somebody screenshots.
             */
            'delta_percent' => $before['revenue'] > 0
                ? (int) round(($revenue - $before['revenue']) * 100 / $before['revenue'])
                : 0,

            /*
             * Read straight off the venue's own settings column rather than
             * through `Branch::setting()`, which falls through to the business.
             * `config/settings.php` declares `target_monthly_tiyin` in the
             * branch group and nowhere else, so the fall-through can only ever
             * return the default — and a target inherited from the restaurant
             * would be the same number on every row of a comparison table.
             */
            'target_monthly_tiyin' => $target,
        ];
    }

    /**
     * How many of this venue's own guard-rails it crossed in the window.
     *
     * ---------------------------------------------------------------------
     * The definition, because nothing on the platform had one
     *
     * `openAlerts` was a column on the design's Branches screen with no source
     * anywhere — `branches-data.ts` said so, and named `RoleDashboards::
     * attention()` as the nearest thing, which is a rules engine over the whole
     * restaurant and therefore answers the same number for all five venues.
     *
     * An alert here is: **one threshold, crossed by this venue, over this
     * window, computed from `analytics.daily_facts` and the venue's own monthly
     * target.** The count is 0..5 and each rail is a named constant above with
     * its reasoning. In order:
     *
     *   1. food cost above {@see self::FOOD_COST_CEILING_PERCENT}% of revenue
     *   2. labour above {@see self::LABOUR_CEILING_PERCENT}% of revenue
     *   3. below {@see self::TARGET_ATTAINMENT_FLOOR_PERCENT}% of the window's
     *      slice of the venue's monthly target (skipped when it has none)
     *   4. discounts above {@see self::DISCOUNT_CEILING_PERCENT}% of revenue
     *   5. revenue that never arrived as takings, above
     *      {@see self::UNBANKED_CEILING_PERCENT}% of revenue
     *
     * Three properties were deliberate. It is **self-contained** — every input
     * is a column of the projection or a key of `branches.settings`, so
     * Analytics reaches into no other module to compute it. It is **per
     * venue** — every rail is a ratio of that venue's own revenue, which is
     * what makes the column worth sorting by. And it is **a count, not a
     * score**: four alerts is not twice as bad as two, it is four things to
     * look at, which is exactly what a manager does with the number.
     *
     * A venue that did not trade in the window scores zero rather than five.
     * Every rail is a share of revenue, and a branch closed for refurbishment
     * has no share to be below — an absence is not a performance problem, and a
     * closed venue lighting up the alert column is how a real one gets ignored.
     *
     * @param Totals $totals
     * @param int $target This venue's monthly target in tiyin, or 0 if unset
     * @param int $days How many trading days the window spans
     */
    private function alertsFor(array $totals, int $target, int $days): int
    {
        $revenue = $totals['revenue'];

        if ($revenue <= 0) {
            return 0;
        }

        $crossed = 0;

        // Only when something has actually been costed. A zero cost base is a
        // menu nobody has priced, not a kitchen that spends nothing.
        if ($totals['cogs'] > 0 && $this->share($totals['cogs'], $revenue) > self::FOOD_COST_CEILING_PERCENT) {
            $crossed++;
        }

        // Same shape, same reason: a zero payroll is a day the rollup has not
        // reached Staff for, not a venue that ran itself.
        if ($totals['labour'] > 0 && $this->share($totals['labour'], $revenue) > self::LABOUR_CEILING_PERCENT) {
            $crossed++;
        }

        if ($target > 0) {
            // The window's slice of a month's target, in tiyin. `intdiv` rather
            // than a float divide because money is an integer on this platform
            // and a target is money.
            $slice = intdiv($target * $days, self::TARGET_MONTH_DAYS);

            if ($slice > 0 && $this->share($revenue, $slice) < self::TARGET_ATTAINMENT_FLOOR_PERCENT) {
                $crossed++;
            }
        }

        if ($totals['discounts'] > 0 && $this->share($totals['discounts'], $revenue) > self::DISCOUNT_CEILING_PERCENT) {
            $crossed++;
        }

        // Takings above revenue is an ordinary Tuesday — yesterday's credit
        // sale being settled today — and is not a rail in either direction.
        $unbanked = $revenue - $totals['takings'];

        if ($unbanked > 0 && $this->share($unbanked, $revenue) > self::UNBANKED_CEILING_PERCENT) {
            $crossed++;
        }

        return $crossed;
    }

    /**
     * The projection summed per venue over a date range.
     *
     * One grouped scan rather than a query per branch: the index this table
     * carries is `(tenant_id, branch_id, business_date)`, which is exactly this
     * shape, and five venues × two windows would otherwise be ten round trips
     * to answer one screen.
     *
     * @return array<int, Totals>
     */
    private function factsByBranch(string $from, string $to): array
    {
        $rows = DailyFact::query()
            /*
             * The business roll-up lives in this table too, with a null branch.
             * Left in, it would come back as one more venue carrying the sum of
             * all the others — the exact failure `DailyFact::scopeRollup()` was
             * written to prevent, read the other way round.
             */
            ->whereNotNull('branch_id')
            /*
             * A range on `business_date`, never `whereDate()`. See
             * `ReportWindow`: the column exists so a report can use the index,
             * and a restaurant's day runs 06:00 → 06:00, so grouping by the
             * calendar would disagree with the Z a cashier signed.
             */
            ->whereBetween('business_date', [$from, $to])
            ->groupBy('branch_id')
            ->selectRaw('branch_id')
            ->selectRaw('coalesce(sum(revenue_tiyin), 0)::bigint as revenue')
            ->selectRaw('coalesce(sum(takings_tiyin), 0)::bigint as takings')
            ->selectRaw('coalesce(sum(discounts_tiyin), 0)::bigint as discounts')
            ->selectRaw('coalesce(sum(cogs_tiyin), 0)::bigint as cogs')
            ->selectRaw('coalesce(sum(labour_tiyin), 0)::bigint as labour')
            ->selectRaw('coalesce(sum(orders_count), 0)::bigint as orders')
            ->selectRaw('coalesce(sum(guests_count), 0)::bigint as guests')
            // Coverage is a percentage and percentages do not add up. Summing
            // revenue × coverage here lets the caller divide by revenue and get
            // the revenue-weighted share, which is the only meaningful one.
            ->selectRaw('coalesce(sum(revenue_tiyin * cogs_coverage_percent), 0)::bigint as coverage_weight')
            /*
             * `toBase()` so the aggregate comes back as a plain row rather than
             * being hydrated into a DailyFact whose columns are none of these
             * names. The global scopes — tenant, and branch when one is pinned
             * — still run: `toBase()` applies them and hands back the
             * underlying query, which `getQuery()` would not have done.
             */
            ->toBase()
            ->get();

        $totals = [];

        foreach ($rows as $row) {
            $totals[(int) $row->branch_id] = [
                'revenue' => (int) $row->revenue,
                'takings' => (int) $row->takings,
                'discounts' => (int) $row->discounts,
                'cogs' => (int) $row->cogs,
                'labour' => (int) $row->labour,
                'orders' => (int) $row->orders,
                'guests' => (int) $row->guests,
                'coverage_weight' => (int) $row->coverage_weight,
            ];
        }

        return $totals;
    }

    /**
     * Active people, counted by the venue they are pinned to.
     *
     * ---------------------------------------------------------------------
     * Scoped by hand, and this is the one table where that matters
     *
     * `public.users` carries no global tenant scope, for the reason its own
     * docblock gives: identity is what DISCOVERS the tenant, so scoping it
     * would make signing in impossible. Every other read in this class is
     * scoped for free by `BelongsToTenant`; this one has to say so, and
     * forgetting it would count another restaurant's staff into this one's
     * headcount. `DeliveryController` scopes the same table the same way and
     * for the same reason.
     *
     * Unpinned people — an owner, an accountant, anyone who works across the
     * estate — are counted at no venue rather than at every one. The column
     * asks how many people work at this address; one owner appearing five
     * times would answer a different question, and a wrong one.
     *
     * @return array<int, int>
     */
    private function headcountByBranch(): array
    {
        $rows = User::query()
            ->where('tenant_id', app(TenantContext::class)->id())
            ->active()
            ->whereNotNull('branch_id')
            ->groupBy('branch_id')
            ->selectRaw('branch_id')
            ->selectRaw('count(*)::int as people')
            ->toBase()
            ->get();

        $counts = [];

        foreach ($rows as $row) {
            $counts[(int) $row->branch_id] = (int) $row->people;
        }

        return $counts;
    }

    /**
     * This venue's target for the month, in tiyin, or zero when it has none.
     */
    private function monthlyTarget(Branch $venue): int
    {
        $target = data_get($venue->settings, 'target_monthly_tiyin');

        return is_numeric($target) ? (int) $target : 0;
    }

    /**
     * A venue that has no projected rows in the window.
     *
     * Zeros rather than an absent key, so every row of the report has the same
     * shape and a branch that was closed appears with a zero instead of
     * vanishing — which is the whole reason the register is read alongside the
     * facts rather than the facts alone.
     *
     * @return Totals
     */
    private function nothing(): array
    {
        return [
            'revenue' => 0,
            'takings' => 0,
            'discounts' => 0,
            'cogs' => 0,
            'labour' => 0,
            'orders' => 0,
            'guests' => 0,
            'coverage_weight' => 0,
        ];
    }

    /**
     * A whole-integer percentage, and zero rather than a division by nothing.
     *
     * Whole rather than one decimal, unlike the rest of this module: these nine
     * columns sit side by side on one row of a comparison table, and "31.2%"
     * against "22.4%" is two more glyphs per cell for a precision nobody acts
     * on. A venue is not re-staffed because labour moved from 30.4 to 30.6.
     */
    private function share(int $part, int $whole): int
    {
        return $whole > 0 ? (int) round($part * 100 / $whole) : 0;
    }
}
