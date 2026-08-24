<?php

declare(strict_types=1);

namespace Modules\Analytics\Services;

use App\Support\Tenancy\BranchContext;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Modules\Analytics\Models\DailyFact;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;

/**
 * Everything the dashboard and the analytics screen ask, computed in SQL.
 *
 * ---------------------------------------------------------------------------
 * Why the server and not the client
 *
 * A console cannot work these out. It never sees every branch's tickets — a
 * chain owner's screen is five venues wide and the API scopes each read to what
 * the caller may see — and even for one venue it would mean shipping a month of
 * order lines to a browser to compute a percentage. Every figure here is one
 * aggregate query with a `GROUP BY`, which is what a database is for.
 *
 * ---------------------------------------------------------------------------
 * Three rules that shape every query below
 *
 * **`business_date`, never `whereDate`.** The column exists precisely so a
 * report can use an index, and a restaurant's day runs 06:00 → 06:00 — grouping
 * by the calendar would move the 01:30 bill into tomorrow and make every report
 * disagree with the Z somebody signed. {@see ReportWindow}.
 *
 * **Revenue is `orders.total`, takings are `payments.amount`.** They are
 * different numbers and both are right: a bill settled half in cash and half by
 * card is one revenue figure and two takings rows, and a credit sale is revenue
 * with no takings at all. Mixing them is the classic restaurant reporting bug —
 * the day looks like it earned twice.
 *
 * **Nothing is invented.** A dish with no costed recipe reports a null margin
 * rather than 100%: an unknown must not read as a triumph, and a food-cost
 * average that silently included uncosted dishes would tell a chef their
 * kitchen is twice as profitable as it is.
 */
final class SalesInsights
{
    /** The statuses that mean money was actually earned. */
    private const SOLD = ['paid'];

    /**
     * The headline figures, and the same figures for the period before.
     *
     * @return array<string, mixed>
     */
    public function summary(ReportWindow $window): array
    {
        $now = $this->totals($window->from, $window->to);
        $before = $this->totals($window->previousFrom, $window->previousTo);

        return [
            'window' => $window->toArray(),
            'currency' => 'UZS',
            'revenue_tiyin' => $now['revenue'],
            'orders_count' => $now['orders'],
            'guests_count' => $now['guests'],
            // Per BILL, not per guest. That is the number restaurants steer on:
            // "average cheque" in this industry means what a table paid, and a
            // per-head figure moves whenever party sizes change rather than
            // when anything about the menu does.
            'average_cheque_tiyin' => $now['orders'] > 0
                ? (int) round($now['revenue'] / $now['orders'])
                : 0,
            'discounts_tiyin' => $now['discounts'],
            'takings_tiyin' => $this->takings($window->from, $window->to),
            'expenses_tiyin' => (int) Expense::query()
                ->whereBetween('business_date', [$window->from, $window->to])
                ->sum('amount'),

            /*
             * The deltas the KPI cards draw.
             *
             * Percent rather than an absolute, and null when there is nothing to
             * compare against: a restaurant's first week has no previous week,
             * and rendering "+100%" for it would be a number somebody screenshots.
             */
            'delta' => [
                'revenue_percent' => $this->change($before['revenue'], $now['revenue']),
                'orders_percent' => $this->change($before['orders'], $now['orders']),
                'average_cheque_percent' => $this->change(
                    $before['orders'] > 0 ? $before['revenue'] / $before['orders'] : 0,
                    $now['orders'] > 0 ? $now['revenue'] / $now['orders'] : 0,
                ),
            ],

            'hours' => $this->byHour($window),
            'categories' => $this->byCategory($window),
            'top_items' => $this->topItems($window, 5),
            'channels' => $this->byChannel($window),
            'food_cost_percent' => $this->foodCostPercent($window),

            /*
             * Cancelled lines as a share of all of them.
             *
             * One of the four service figures the design puts under the charts,
             * and the only one this module can answer honestly today: turn time
             * and ticket time come from kitchen ticket timestamps, and the
             * repeat share from CRM — two modules Analytics is not permitted to
             * read. Serving three real numbers and one invented one would make
             * the invented one the most trusted figure on the screen.
             */
            'void_rate_percent' => $this->voidRatePercent($window),

            /*
             * Labour share, from the projection rather than from a guess.
             *
             * This read null for a long time, and the note here explained why:
             * *"payroll lives in Staff — a module Analytics is not permitted to
             * read … deriving it from rostered hours × an assumed rate would put
             * a plausible number on a manager's screen that no payslip agrees
             * with."* Every word of that still holds, which is why the figure
             * does not come from a query in this file: `analytics:rollup` asks
             * Staff through `App\Contracts\Staff\Roster::payrollBetween()` and
             * writes the answer into `analytics.daily_facts`.
             *
             * Still null when the projection has not run for the window. That
             * is the same honest blank as before and it is the reason the value
             * is nullable rather than zero: a labour share of 0% and a labour
             * share nobody has computed look identical on a card, and only one
             * of them is a reason to check the rota.
             */
            'labour_cost_percent' => $this->labourCostPercent($window, $now['revenue']),

            /*
             * Gross profit and how much of the menu it actually covers.
             *
             * Two values, always together, and that pairing is the point.
             * `overview-server.ts` refuses to draw a gross profit at all today
             * and says why: *"a gross profit derived from a partial cost base
             * would overstate it by exactly the share of the menu nobody has
             * costed yet, which is the number an owner is least able to check."*
             * The coverage percentage is what lets a client make that decision
             * rather than inheriting it — draw the figure at 96% coverage,
             * withhold it at 40%.
             */
            'gross_profit_tiyin' => $this->grossProfit($window, $now['revenue']),
            'cogs_coverage_percent' => $this->cogsCoverage($window),
        ];
    }

    /**
     * Menu engineering's four groups: stars, plowhorses, puzzles, dogs.
     *
     * The industry's own names, kept because a chef already knows what they
     * mean. The split is two medians — units sold and margin percent — rather
     * than fixed thresholds, and that is the whole method: a dish is a star
     * because it beats the REST OF THIS MENU on both, not because it crossed a
     * number somebody wrote in a book. A café where everything sells 400
     * portions still has a bottom half worth looking at.
     *
     * Margin and profit are derived from price, cost and units on every read.
     * Storing them would let a price change leave a stale margin behind, which
     * is the same rule `analytics-data.ts` states on the client side.
     *
     * @return array<string, mixed>
     */
    public function menuEngineering(ReportWindow $window): array
    {
        /*
         * Grouped by the catalogue row's primary key and nothing else.
         *
         * Two reasons, and the second one is a hard error rather than a
         * preference. PostgreSQL knows that every other column of `menu_items`
         * is functionally dependent on its own primary key, so selecting them
         * beside `m.id` is legal without naming them in the GROUP BY. Naming
         * them is not merely redundant — `name` is a `json` column, and json has
         * no equality operator, so `GROUP BY m.name` fails outright with
         * "could not identify an equality operator for type json".
         */
        $rows = $this->soldLines($window)
            ->join('menu.menu_items as m', 'm.id', '=', 'i.menu_item_id')
            ->groupBy('m.id')
            ->selectRaw('m.id as menu_item_id, m.sku, m.name, m.price, m.cost_price')
            ->selectRaw('sum(i.quantity)::bigint as sold')
            ->selectRaw('sum(i.total_price)::bigint as revenue')
            ->get();

        $dishes = $rows->map(function (object $row): array {
            $price = (int) $row->price;
            $cost = $row->cost_price === null ? null : (int) $row->cost_price;

            return [
                'menu_item_id' => (int) $row->menu_item_id,
                'sku' => (string) $row->sku,
                'name' => json_decode((string) $row->name, true) ?: (string) $row->name,
                'sold' => (int) $row->sold,
                'price_tiyin' => $price,
                'cost_tiyin' => $cost,
                'revenue_tiyin' => (int) $row->revenue,
                'margin_percent' => $cost !== null && $price > 0
                    ? (int) round(($price - $cost) / $price * 100)
                    : null,
                'profit_tiyin' => $cost === null ? null : ($price - $cost) * (int) $row->sold,
            ];
        })->all();

        $soldMedian = $this->median(array_column($dishes, 'sold'));
        $marginMedian = $this->median(array_values(array_filter(
            array_column($dishes, 'margin_percent'),
            static fn (?int $margin): bool => $margin !== null,
        )));

        foreach ($dishes as $index => $dish) {
            $dishes[$index]['group'] = $this->quadrant(
                $dish['sold'] >= $soldMedian,
                $dish['margin_percent'] === null ? null : $dish['margin_percent'] >= $marginMedian,
            );
        }

        return [
            'window' => $window->toArray(),
            // Published so a screen can say what the split was measured against.
            // "Above median" means nothing without the median beside it, and a
            // chef arguing with the classification deserves the number.
            'median_sold' => $soldMedian,
            'median_margin_percent' => $marginMedian,
            'data' => $dishes,
        ];
    }

    // ============ Building blocks ============

    /**
     * Revenue, bills, guests and discounts over a date range.
     *
     * One query, four figures. Four queries would be four index scans over the
     * same rows, and this is called twice per summary — once for the window and
     * once for the one before it.
     *
     * @return array{revenue: int, orders: int, guests: int, discounts: int}
     */
    private function totals(string $from, string $to): array
    {
        /** @var object|null $row */
        $row = Order::query()
            ->whereIn('status', self::SOLD)
            ->whereBetween('business_date', [$from, $to])
            ->selectRaw('coalesce(sum(total), 0)::bigint as revenue')
            ->selectRaw('count(*)::bigint as orders')
            ->selectRaw('coalesce(sum(guests_count), 0)::bigint as guests')
            ->selectRaw('coalesce(sum(discount_total), 0)::bigint as discounts')
            /*
             * `toBase()` so the aggregate comes back as a plain row.
             *
             * `first()` on an Eloquent builder hydrates an Order — a model whose
             * columns are none of the four names above — and every read of them
             * is then an undefined property that only fails at runtime. The
             * global scopes are still applied: `toBase()` runs them and hands
             * back the underlying query, which is exactly what is wanted here
             * and is not what `getQuery()` would have done.
             */
            ->toBase()
            ->first();

        return [
            'revenue' => (int) ($row->revenue ?? 0),
            'orders' => (int) ($row->orders ?? 0),
            'guests' => (int) ($row->guests ?? 0),
            'discounts' => (int) ($row->discounts ?? 0),
        ];
    }

    /** Cancelled lines as a percentage of every line rung up in the window. */
    private function voidRatePercent(ReportWindow $window): ?float
    {
        $counts = $this->lineCounts($window);

        return $counts['lines'] > 0
            ? round($counts['cancelled'] / $counts['lines'] * 100, 1)
            : null;
    }

    /** What actually reached a till or an account, which is not the same as revenue. */
    private function takings(string $from, string $to): int
    {
        return (int) Payment::query()
            ->captured()
            ->whereBetween('business_date', [$from, $to])
            ->sum('amount');
    }

    /**
     * The trading day hour by hour, 00 to 23, with the gaps filled.
     *
     * Zeros for hours with no trade rather than missing keys: a chart that
     * silently closes a gap draws a restaurant that was busy through a closure.
     *
     * `extract(hour from placed_at)` is safe here even though function-wrapping
     * a column normally is not — the range on `business_date` has already cut
     * the rows down to a day or a month, and the extract only runs on those.
     *
     * @return array<int, array{hour: int, revenue_tiyin: int, average_tiyin: int|null, orders_count: int, guests_count: int}>
     */
    private function byHour(ReportWindow $window): array
    {
        $average = $this->weekdayAverageByHour($window);

        $rows = Order::query()
            ->whereIn('status', self::SOLD)
            ->whereBetween('business_date', [$window->from, $window->to])
            ->groupByRaw('extract(hour from placed_at)')
            ->selectRaw('extract(hour from placed_at)::int as hour')
            ->selectRaw('coalesce(sum(total), 0)::bigint as revenue')
            ->selectRaw('count(*)::bigint as orders')
            // Covers, not bills. The design's hourly chart is headed "mehmonlar"
            // and a restaurant staffs against people through the door: two
            // tables of eight and sixteen counter sales are the same bill count
            // and a completely different service.
            ->selectRaw('coalesce(sum(guests_count), 0)::bigint as guests')
            ->toBase()
            ->get()
            ->keyBy('hour');

        $series = [];

        for ($hour = 0; $hour < 24; $hour++) {
            $row = $rows[$hour] ?? null;
            $series[] = [
                'hour' => $hour,
                'revenue_tiyin' => (int) ($row->revenue ?? 0),
                /*
                 * The second line on the owner's chart: what this hour usually
                 * takes. Null rather than zero when there is nothing to average
                 * — a new restaurant has no history, and a flat zero baseline
                 * drawn under today's curve reads as a record-breaking day.
                 */
                'average_tiyin' => $average[$hour] ?? null,
                'orders_count' => (int) ($row->orders ?? 0),
                'guests_count' => (int) ($row->guests ?? 0),
            ];
        }

        return $series;
    }

    /**
     * How many same-weekday trading days the baseline looks back over.
     *
     * Eight weeks. Long enough that one closure or one wedding does not move
     * the line, short enough that a menu change from the spring is not still
     * being compared against.
     */
    private const WEEKDAY_WINDOW = 8;

    /**
     * This weekday's usual shape, hour by hour.
     *
     * The design draws twelve bars, each carrying today against "the average
     * for this weekday" — and until now the console drew one line and said so,
     * because the endpoint had no second series to give it. This is that series.
     *
     * ---------------------------------------------------------------------------
     * Why per weekday rather than per day
     *
     * Because a restaurant's week is not flat. A Tuesday measured against the
     * mean of the last fourteen days is measured mostly against weekends, and
     * every Tuesday of the year then reads as a bad day. Comparing like with
     * like is the entire value of the baseline.
     *
     * ---------------------------------------------------------------------------
     * Only for a one-day window, and the empty array is the honest answer
     *
     * `?period=week` aggregates seven days into each bar. A weekday average
     * underneath that would be one day's takings drawn beneath seven, and the
     * chart would show the restaurant beating its own average by 600% every
     * week. The bars keep their single line instead.
     *
     * ---------------------------------------------------------------------------
     * Divided by the days that traded, not by eight
     *
     * A venue that opened three weeks ago, or one that shuts on Mondays, has
     * fewer than eight of them behind it. Dividing by the calendar rather than
     * by the days with sales on them would report an average a fraction of the
     * real one, and every ordinary Monday would look like a triumph.
     *
     * @return array<int, int> hour => average revenue in tiyin, sparse
     */
    private function weekdayAverageByHour(ReportWindow $window): array
    {
        if ($window->days !== 1) {
            return [];
        }

        $end = CarbonImmutable::parse($window->to);

        $dates = [];

        for ($week = 1; $week <= self::WEEKDAY_WINDOW; $week++) {
            $dates[] = $end->subWeeks($week)->toDateString();
        }

        /*
         * `whereIn` on `business_date` rather than a range: the eight dates are
         * seven days apart, so a BETWEEN would drag in the 48 days between them
         * and average this Tuesday against every Saturday of the last two
         * months. It is also still an index lookup, which `whereDate()` — banned
         * platform-wide — would not be.
         */
        $rows = Order::query()
            ->whereIn('status', self::SOLD)
            ->whereIn('business_date', $dates)
            ->groupByRaw('extract(hour from placed_at)')
            ->selectRaw('extract(hour from placed_at)::int as hour')
            ->selectRaw('coalesce(sum(total), 0)::bigint as revenue')
            ->toBase()
            ->get();

        $traded = (int) Order::query()
            ->whereIn('status', self::SOLD)
            ->whereIn('business_date', $dates)
            ->toBase()
            ->distinct()
            ->count('business_date');

        if ($traded === 0) {
            return [];
        }

        $average = [];

        foreach ($rows as $row) {
            $average[(int) $row->hour] = (int) round((int) $row->revenue / $traded);
        }

        return $average;
    }

    /**
     * Which parts of the menu earn the money.
     *
     * Joined through `menu_item_id` rather than grouped by the line's own `sku`
     * snapshot, because a category is a property of the catalogue and not of the
     * bill. A dish moved from Salads to Starters last month should report under
     * Starters today — the snapshot exists to freeze the PRICE and the NAME a
     * guest paid, not the shelf it sits on.
     *
     * @return array<int, array<string, mixed>>
     */
    private function byCategory(ReportWindow $window): array
    {
        $rows = $this->soldLines($window)
            ->join('menu.menu_items as m', 'm.id', '=', 'i.menu_item_id')
            ->join('menu.menu_categories as c', 'c.id', '=', 'm.menu_category_id')
            // By the category's primary key alone — see menuEngineering() for
            // why naming a `json` column in a GROUP BY is an error and not a
            // style question.
            ->groupBy('c.id')
            ->selectRaw('c.id, c.slug, c.name')
            ->selectRaw('coalesce(sum(i.total_price), 0)::bigint as revenue')
            ->selectRaw('coalesce(sum(i.quantity), 0)::bigint as sold')
            ->orderByRaw('revenue desc')
            ->get();

        $total = (int) $rows->sum('revenue');

        return $rows->map(fn (object $row): array => [
            'id' => (int) $row->id,
            'slug' => (string) $row->slug,
            'name' => json_decode((string) $row->name, true) ?: (string) $row->name,
            'revenue_tiyin' => (int) $row->revenue,
            'sold' => (int) $row->sold,
            'share_percent' => $total > 0 ? round((int) $row->revenue / $total * 100, 1) : 0.0,
        ])->all();
    }

    /**
     * The best sellers, by revenue.
     *
     * Grouped on the line's own snapshot (`sku`, `title`) rather than joined to
     * the catalogue: this list is read beside a receipt, and a dish renamed last
     * week should appear under the name it was sold as. The opposite choice from
     * `byCategory()`, for the opposite reason, and both are deliberate.
     *
     * @return array<int, array<string, mixed>>
     */
    private function topItems(ReportWindow $window, int $limit): array
    {
        return $this->soldLines($window)
            ->groupBy('i.sku', 'i.title')
            ->selectRaw('i.sku, i.title')
            ->selectRaw('coalesce(sum(i.quantity), 0)::bigint as sold')
            ->selectRaw('coalesce(sum(i.total_price), 0)::bigint as revenue')
            ->orderByRaw('revenue desc')
            ->limit($limit)
            ->get()
            ->map(fn (object $row): array => [
                'sku' => (string) $row->sku,
                'title' => (string) $row->title,
                'sold' => (int) $row->sold,
                'revenue_tiyin' => (int) $row->revenue,
            ])
            ->all();
    }

    /**
     * Where the orders came from — the room, the phone, an aggregator.
     *
     * @return array<int, array<string, mixed>>
     */
    private function byChannel(ReportWindow $window): array
    {
        return Order::query()
            ->whereIn('status', self::SOLD)
            ->whereBetween('business_date', [$window->from, $window->to])
            ->groupBy('channel')
            ->selectRaw('channel')
            ->selectRaw('coalesce(sum(total), 0)::bigint as revenue')
            ->selectRaw('count(*)::bigint as orders')
            ->orderByRaw('revenue desc')
            ->toBase()
            ->get()
            ->map(fn (object $row): array => [
                'channel' => (string) $row->channel,
                'orders_count' => (int) $row->orders,
                'revenue_tiyin' => (int) $row->revenue,
                'average_cheque_tiyin' => (int) $row->orders > 0
                    ? (int) round((int) $row->revenue / (int) $row->orders)
                    : 0,
            ])
            ->all();
    }

    /**
     * Cost of goods as a share of what they sold for.
     *
     * Computed from the catalogue's costed price × units, NOT from stock
     * movements — and the difference matters enough to state. Movements measure
     * what left the store, which includes waste, staff meals and theft; this
     * measures what the recipes say the sold dishes should have cost. A chef
     * comparing the two learns something; conflating them hides exactly the gap
     * that is worth finding.
     *
     * Null when nothing sold has a recipe cost. A restaurant mid-way through
     * costing its menu would otherwise be shown a food cost computed from the
     * three dishes an accountant happened to finish first.
     */
    private function foodCostPercent(ReportWindow $window): ?float
    {
        /** @var object|null $row */
        $row = $this->soldLines($window)
            ->join('menu.menu_items as m', 'm.id', '=', 'i.menu_item_id')
            ->whereNotNull('m.cost_price')
            ->selectRaw('coalesce(sum(m.cost_price * i.quantity), 0)::bigint as cost')
            ->selectRaw('coalesce(sum(i.total_price), 0)::bigint as revenue')
            ->first();

        $revenue = (int) ($row->revenue ?? 0);

        return $revenue > 0 ? round((int) ($row->cost ?? 0) / $revenue * 100, 1) : null;
    }

    /**
     * Lines on bills that were actually sold, as a query builder to hang joins on.
     *
     * `orders.order_items` has no `business_date` of its own, so the window is
     * applied to the bill it belongs to — which is also the correct definition:
     * a line's trading day is its bill's, whatever hour the kitchen rang it in.
     *
     * `i.status <> 'cancelled'` is not decoration. A voided line stays on the
     * bill on purpose ("which lines were removed, by whom, and why" is the most
     * useful question in a fraud investigation), so a report that forgot it
     * would count food nobody ate as revenue.
     *
     * @return Builder
     */
    private function soldLines(ReportWindow $window)
    {
        /*
         * The two scopes a raw builder does NOT get for free, and what happens
         * to each.
         *
         * **Tenant** is row-level security's job here. A raw query carries no
         * Eloquent global scope, which is exactly the query class the database
         * policies exist for: `app.tenant_id` is set by ResolveTenant, the
         * policy on both tables checks it, and a request that reached here
         * without one reads nothing rather than everything. See
         * tests/Feature/RowLevelSecurityTest.php.
         *
         * **Branch** has no such backstop and is applied by hand below. It
         * cannot be a policy — an unset branch means "all of them", which is
         * what an owner's dashboard wants — so a raw query that forgot it would
         * report the whole estate's revenue as one venue's. That is CLAUDE.md's
         * third rule read the wrong way round, and it is the bug this line
         * exists to prevent.
         */
        $branchId = app(BranchContext::class)->id();

        return DB::table('orders.order_items as i')
            ->join('orders.orders as o', 'o.id', '=', 'i.order_id')
            ->whereIn('o.status', self::SOLD)
            ->whereBetween('o.business_date', [$window->from, $window->to])
            ->whereNull('i.deleted_at')
            ->whereNull('o.deleted_at')
            ->where('i.status', '<>', 'cancelled')
            ->when($branchId !== null, fn ($query) => $query->where('o.branch_id', $branchId));
    }

    /** Percent change, or null when there is nothing to compare against. */
    /**
     * Payroll ÷ revenue, over whatever the projection has for the window.
     *
     * Null when no day in the window has been rolled up — see the note at the
     * call site. Rounded to one decimal, like every other percentage this
     * module publishes, because a labour share printed to four figures invites
     * an argument about the fourth.
     */
    private function labourCostPercent(ReportWindow $window, int $revenue): ?float
    {
        if ($revenue <= 0) {
            return null;
        }

        $labour = $this->facts($window)->sum('labour_tiyin');

        return $labour <= 0 ? null : round((int) $labour / $revenue * 100, 1);
    }

    /**
     * Revenue minus cost of goods, in tiyin — or null when nothing is costed.
     *
     * Read from the projection rather than recomputed here, so that the figure
     * and the coverage beside it are derived from the same rows. Two queries
     * against different windows is how a screen ends up drawing a profit whose
     * own caveat disagrees with it.
     */
    private function grossProfit(ReportWindow $window, int $revenue): ?int
    {
        $cogs = (int) $this->facts($window)->sum('cogs_tiyin');

        return $cogs <= 0 ? null : $revenue - $cogs;
    }

    /**
     * What share of the window's sales came from dishes with a costed recipe.
     *
     * Weighted by the day's revenue rather than averaged across days: a quiet
     * Monday where the only two dishes sold happened to be costed must not
     * report the menu as fully costed.
     */
    private function cogsCoverage(ReportWindow $window): ?int
    {
        $rows = $this->facts($window)->get(['revenue_tiyin', 'cogs_coverage_percent']);

        if ($rows->isEmpty()) {
            return null;
        }

        $revenue = (int) $rows->sum('revenue_tiyin');

        if ($revenue <= 0) {
            return null;
        }

        $weighted = $rows->sum(
            static fn (DailyFact $row): int => $row->revenue_tiyin * $row->cogs_coverage_percent,
        );

        return (int) round((int) $weighted / $revenue);
    }

    /**
     * The projected rows for this window, scoped the way the caller is.
     *
     * `rollup()` when no venue is in context, because `BelongsToBranch` does
     * the platform's usual thing — an unset branch does not filter — and this
     * table holds BOTH a row per venue and a row for the business. Summing them
     * together would report a restaurant that earned twice.
     *
     * @return EloquentBuilder<DailyFact>
     */
    private function facts(ReportWindow $window): EloquentBuilder
    {
        return DailyFact::query()
            ->when(
                app(BranchContext::class)->id() === null,
                fn ($query) => $query->rollup(),
            )
            ->whereBetween('business_date', [$window->from, $window->to]);
    }

    private function change(float|int $before, float|int $after): ?float
    {
        if ($before <= 0) {
            return null;
        }

        return round(($after - $before) / $before * 100, 1);
    }

    /**
     * The middle value, or zero for an empty menu.
     *
     * The average would not do: one banquet order of 300 portions drags a mean
     * above every ordinary dish and reclassifies the whole menu as
     * under-performing. A median is what makes the four quadrants describe the
     * menu rather than its outlier.
     *
     * @param array<int, int> $values
     */
    private function median(array $values): int
    {
        if ($values === []) {
            return 0;
        }

        sort($values);
        $middle = intdiv(count($values), 2);

        return count($values) % 2 === 1
            ? $values[$middle]
            : (int) round(($values[$middle - 1] + $values[$middle]) / 2);
    }

    /**
     * Sells well? Earns well? — the two questions that name the four groups.
     *
     * A dish with no recipe cost cannot be placed: `null` margin means the
     * second question has no answer, and guessing would put a dish in `dogs`
     * for the sole reason that nobody has costed it yet. `uncosted` is its own
     * group so a screen can say so and a chef knows what to do about it.
     */
    private function quadrant(bool $sellsWell, ?bool $earnsWell): string
    {
        if ($earnsWell === null) {
            return 'uncosted';
        }

        return match (true) {
            $sellsWell && $earnsWell => 'stars',
            $sellsWell => 'plowhorses',
            $earnsWell => 'puzzles',
            default => 'dogs',
        };
    }

    /**
     * Menu items that have never been sold in the window.
     *
     * Kept out of `menuEngineering()` on purpose: a dish with zero sales has no
     * quadrant — it has a question, which is whether it should be on the card at
     * all. Answering it as a `dog` would bury it among dishes that at least sell.
     *
     * @return array<int, array<string, mixed>>
     */
    public function neverSold(ReportWindow $window): array
    {
        $sold = $this->soldLines($window)->distinct()->pluck('i.menu_item_id')->filter()->all();

        return MenuItem::query()
            ->active()
            ->when($sold !== [], fn ($query) => $query->whereNotIn('id', $sold))
            ->get(['id', 'sku', 'name', 'price'])
            ->map(fn (MenuItem $item): array => [
                'menu_item_id' => (int) $item->getKey(),
                'sku' => $item->sku,
                'name' => $item->name,
                'price_tiyin' => (int) $item->price,
            ])
            ->all();
    }

    /**
     * How many distinct bills carried a line — used by the reports screen.
     *
     * @return array<string, int>
     */
    public function lineCounts(ReportWindow $window): array
    {
        $branchId = app(BranchContext::class)->id();

        /** @var object|null $row */
        $row = DB::table('orders.order_items as i')
            ->join('orders.orders as o', 'o.id', '=', 'i.order_id')
            ->whereBetween('o.business_date', [$window->from, $window->to])
            ->whereNull('i.deleted_at')
            ->whereNull('o.deleted_at')
            ->when($branchId !== null, fn ($query) => $query->where('o.branch_id', $branchId))
            ->selectRaw('count(*)::bigint as lines')
            ->selectRaw("count(*) filter (where i.status = 'cancelled')::bigint as cancelled")
            ->first();

        return [
            'lines' => (int) ($row->lines ?? 0),
            'cancelled' => (int) ($row->cancelled ?? 0),
        ];
    }
}
