<?php

declare(strict_types=1);

namespace Modules\Analytics\Services;

use App\Contracts\Inventory\ConsumedLine;
use App\Contracts\Inventory\StockReport;
use App\Contracts\Staff\Roster;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;

/**
 * The five reports the console can actually open.
 *
 * `analytics/reports` draws eleven cards; five of them carry an id and open a
 * viewer, and these are those five. The other six say they are being built and
 * will be emailed, which is the design's own arrangement and not a gap here.
 *
 * ---------------------------------------------------------------------------
 * One shape for all of them, because of the export
 *
 * Every report answers `{columns, rows, totals}` rather than a bespoke object.
 * That is what lets `POST /api/v1/reports/export` turn any of them into CSV
 * without knowing which one it was handed — and it is what stops the CSV and
 * the screen drifting, which they do the moment the exporter is given its own
 * query. A column added here appears in both, or in neither.
 *
 * `columns` carries the type as well as the key, because a CSV writer has to
 * know that a money column is tiyin and must be divided, and a spreadsheet that
 * received `45000000` for a 450 000 so'm total is a report nobody can use.
 */
final class StandardReports
{
    /**
     * Every report this module can build, and the four that were added later.
     *
     * The console's catalogue draws eleven cards. Five carried an id from the
     * start; `zreport`, `items`, `vat` and `branches` are the four of the
     * remaining six that can be answered without crossing a module boundary
     * this platform does not open. The two that stay closed say why at their
     * own methods: `stock`/stock movement needs Inventory, and labour needs
     * per-person attendance, which the Staff contract deliberately withholds.
     */
    public const KINDS = [
        'waiters', 'dishes', 'voids', 'stock', 'cashflow',
        'zreport', 'items', 'vat', 'branches', 'labour',
    ];

    public function __construct(
        private readonly LossControl $control,
        private readonly BranchPerformance $branchReport,
        private readonly TenantContext $tenants,
        private readonly StockReport $shelf,
        private readonly Roster $roster,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function build(string $kind, ReportWindow $window): array
    {
        return match ($kind) {
            'waiters' => $this->waiters($window),
            'dishes' => $this->dishes($window),
            'voids' => $this->voids($window),
            'stock' => $this->stock($window),
            'cashflow' => $this->cashflow($window),
            'zreport' => $this->zreport($window),
            'items' => $this->items($window),
            'vat' => $this->vat($window),
            'branches' => $this->branches($window),
            'labour' => $this->labour($window),
            default => $this->unavailable($window, "Noma'lum hisobot turi: {$kind}"),
        };
    }

    /**
     * Who sold how much — the report that gets read at the end of every shift.
     *
     * Built from the same query as the loss-control screen on purpose. Two
     * queries producing "revenue by waiter" is two numbers a manager can hold up
     * beside each other, and one of them will be wrong.
     *
     * @return array<string, mixed>
     */
    private function waiters(ReportWindow $window): array
    {
        $staff = $this->control->report($window)['staff'];

        return $this->table(
            $window,
            'waiters',
            [
                ['key' => 'name', 'type' => 'text'],
                ['key' => 'paid_bills', 'type' => 'count'],
                ['key' => 'revenue_tiyin', 'type' => 'money'],
                ['key' => 'average_cheque_tiyin', 'type' => 'money'],
                ['key' => 'discounts_tiyin', 'type' => 'money'],
                ['key' => 'voided_bills', 'type' => 'count'],
                ['key' => 'cancelled_lines', 'type' => 'count'],
            ],
            array_map(static fn (array $row): array => [
                'name' => $row['name'],
                'paid_bills' => $row['paid_bills'],
                'revenue_tiyin' => $row['revenue_tiyin'],
                'average_cheque_tiyin' => $row['paid_bills'] > 0
                    ? (int) round($row['revenue_tiyin'] / $row['paid_bills'])
                    : 0,
                'discounts_tiyin' => $row['discounts_tiyin'],
                'voided_bills' => $row['voided_bills'],
                'cancelled_lines' => $row['cancelled_lines'],
            ], $staff),
        );
    }

    /**
     * Units, cost and profit per dish, sorted by margin.
     *
     * @return array<string, mixed>
     */
    private function dishes(ReportWindow $window): array
    {
        $branchId = app(BranchContext::class)->id();

        $rows = DB::table('orders.order_items as i')
            ->join('orders.orders as o', 'o.id', '=', 'i.order_id')
            ->leftJoin('menu.menu_items as m', 'm.id', '=', 'i.menu_item_id')
            ->where('o.status', 'paid')
            ->whereBetween('o.business_date', [$window->from, $window->to])
            ->whereNull('i.deleted_at')
            ->whereNull('o.deleted_at')
            ->where('i.status', '<>', 'cancelled')
            ->when($branchId !== null, fn ($query) => $query->where('o.branch_id', $branchId))
            ->groupBy('i.sku', 'i.title')
            ->selectRaw('i.sku, i.title')
            ->selectRaw('coalesce(sum(i.quantity), 0)::bigint as sold')
            ->selectRaw('coalesce(sum(i.total_price), 0)::bigint as revenue')
            // `max`, not `sum`: the cost is a per-unit property of the dish and
            // grouping does not change it. Summing it would multiply the cost by
            // the number of bills the dish appeared on.
            ->selectRaw('max(m.cost_price)::bigint as unit_cost')
            ->orderByRaw('revenue desc')
            ->get()
            ->map(function (object $row): array {
                $revenue = (int) $row->revenue;
                $cost = $row->unit_cost === null ? null : (int) $row->unit_cost * (int) $row->sold;

                return [
                    'sku' => (string) $row->sku,
                    'title' => (string) $row->title,
                    'sold' => (int) $row->sold,
                    'revenue_tiyin' => $revenue,
                    'cost_tiyin' => $cost,
                    'profit_tiyin' => $cost === null ? null : $revenue - $cost,
                    // Null rather than 100 for an uncosted dish — an unknown
                    // must not read as a triumph, and a chef sorting by margin
                    // would find every un-costed dish at the top.
                    'margin_percent' => $cost !== null && $revenue > 0
                        ? round(($revenue - $cost) / $revenue * 100, 1)
                        : null,
                ];
            })
            ->all();

        return $this->table($window, 'dishes', [
            ['key' => 'sku', 'type' => 'text'],
            ['key' => 'title', 'type' => 'text'],
            ['key' => 'sold', 'type' => 'count'],
            ['key' => 'revenue_tiyin', 'type' => 'money'],
            ['key' => 'cost_tiyin', 'type' => 'money'],
            ['key' => 'profit_tiyin', 'type' => 'money'],
            ['key' => 'margin_percent', 'type' => 'percent'],
        ], $rows);
    }

    /**
     * What was cancelled, on whose bill, at which stage and for how much.
     *
     * Rows rather than counts, because the useful question is never "how many"
     * — it is "which ones", and a cancelled line carries the dish, the moment
     * and the bill it came off.
     *
     * @return array<string, mixed>
     */
    private function voids(ReportWindow $window): array
    {
        $branchId = app(BranchContext::class)->id();

        $rows = DB::table('orders.order_items as i')
            ->join('orders.orders as o', 'o.id', '=', 'i.order_id')
            ->whereBetween('o.business_date', [$window->from, $window->to])
            ->whereNull('i.deleted_at')
            ->whereNull('o.deleted_at')
            ->when($branchId !== null, fn ($query) => $query->where('o.branch_id', $branchId))
            ->where('i.status', 'cancelled')
            ->orderByDesc('i.updated_at')
            ->limit(500)
            ->get([
                'o.number as order_number',
                'o.waiter_user_id',
                'o.table_label',
                'i.title',
                'i.quantity',
                'i.total_price',
                'i.note',
                'i.updated_at',
            ]);

        $names = User::query()
            ->whereIn('id', $rows->pluck('waiter_user_id')->filter()->all())
            ->pluck('name', 'id');

        return $this->table($window, 'voids', [
            ['key' => 'at', 'type' => 'datetime'],
            ['key' => 'order_number', 'type' => 'text'],
            ['key' => 'table_label', 'type' => 'text'],
            ['key' => 'waiter', 'type' => 'text'],
            ['key' => 'title', 'type' => 'text'],
            ['key' => 'quantity', 'type' => 'count'],
            ['key' => 'total_price', 'type' => 'money'],
            ['key' => 'note', 'type' => 'text'],
        ], $rows->map(fn (object $row): array => [
            'at' => (string) $row->updated_at,
            'order_number' => (string) $row->order_number,
            'table_label' => $row->table_label,
            'waiter' => $row->waiter_user_id === null ? null : ($names[$row->waiter_user_id] ?? null),
            'title' => (string) $row->title,
            'quantity' => (int) $row->quantity,
            'total_price' => (int) $row->total_price,
            'note' => $row->note,
        ])->all());
    }

    /**
     * Opening, in, out, closing — by store.
     *
     * Not answered, and the empty answer is deliberate rather than a stub. Stock
     * lives in Inventory, and `ModuleBoundaryTest::ALLOWED_EDGES` gives Analytics
     * exactly three doors: Menu, Orders and Finance. Each entry on that list is a
     * decision somebody made and wrote down, and quietly adding a fourth to
     * deliver one report card is how a modular monolith becomes one program.
     *
     * The honest shape is this: the card renders, the viewer says the report is
     * not connected, and the fix is a decision about the boundary rather than a
     * silent import. `SUPPLIERS`/`INVENTORY` already publish domain events; a
     * stock read model fed from them is the version that does not cost an edge.
     *
     * @return array<string, mixed>
     */
    /**
     * What the kitchen used, and what it was worth.
     *
     * Through `App\Contracts\Inventory\StockReport` rather than a query:
     * Analytics may read Menu, Orders and Finance, and the shelf belongs to
     * Inventory. The contract already answered this for the dashboard's
     * food-cost card; the report is the same read, unlimited and with the
     * waste line beside it — a month where consumption looks normal and waste
     * has trebled is the month this report exists to find.
     */
    private function stock(ReportWindow $window): array
    {
        $lines = $this->shelf->consumedBetween($window->from, $window->to, limit: 200);

        $rows = array_map(static fn (ConsumedLine $line): array => [
            'ingredient' => $line->name,
            'unit' => $line->unit,
            'used' => $line->quantity,
            'value_tiyin' => $line->costTiyin,
        ], $lines);

        /*
         * Waste as its own row rather than a column: it is not consumption —
         * a freezer that failed is not a kitchen that cooked — and folding
         * the two together is exactly how a food-cost figure absorbs a loss
         * nobody then goes looking for.
         */
        $waste = $this->shelf->wasteValueBetween($window->from, $window->to);

        if ($waste > 0) {
            $rows[] = ['ingredient' => 'â€” waste', 'unit' => '', 'used' => 0, 'value_tiyin' => $waste];
        }

        return $this->table($window, 'stock', [
            ['key' => 'ingredient', 'type' => 'text'],
            ['key' => 'unit', 'type' => 'text'],
            ['key' => 'used', 'type' => 'count'],
            ['key' => 'value_tiyin', 'type' => 'money'],
        ], $rows);
    }

    /**
     * Money in and money out — which is not the same shape as revenue.
     *
     * Takings by method, expenses by category, and the two are kept apart rather
     * than netted: a manager reading this wants to know that 3.1m so'm arrived
     * through Payme and 450k left for a repair, and a single "net" figure hides
     * both facts behind one number that is neither.
     *
     * @return array<string, mixed>
     */
    /**
     * The rota against the floor, per person.
     *
     * Through `App\Contracts\Staff\Roster` for the same reason the stock
     * report goes through Inventory's: Analytics reads Menu, Orders and
     * Finance, and the rota is Staff's. Overtime is the difference read the
     * honest way round — worked minus scheduled, negative when somebody went
     * home early — because a column that only ever counts up hides half of
     * what a manager is looking for.
     */
    private function labour(ReportWindow $window): array
    {
        $rows = array_map(static function (array $row): array {
            return [
                'person' => $row['name'],
                'position' => $row['position'],
                'shifts' => $row['shifts'],
                'scheduled_hours' => round($row['scheduled_minutes'] / 60, 1),
                'worked_hours' => round($row['worked_minutes'] / 60, 1),
                'overtime_hours' => round(($row['worked_minutes'] - $row['scheduled_minutes']) / 60, 1),
                'late' => $row['late_count'],
            ];
        }, $this->roster->hoursBetween($window->from, $window->to, app(BranchContext::class)->id()));

        return $this->table($window, 'labour', [
            ['key' => 'person', 'type' => 'text'],
            ['key' => 'position', 'type' => 'text'],
            ['key' => 'shifts', 'type' => 'count'],
            ['key' => 'scheduled_hours', 'type' => 'count'],
            ['key' => 'worked_hours', 'type' => 'count'],
            ['key' => 'overtime_hours', 'type' => 'count'],
            ['key' => 'late', 'type' => 'count'],
        ], $rows);
    }

    private function cashflow(ReportWindow $window): array
    {
        $takings = Payment::query()
            ->captured()
            ->whereBetween('business_date', [$window->from, $window->to])
            ->groupBy('method')
            ->selectRaw('method')
            ->selectRaw('coalesce(sum(amount), 0)::bigint as amount')
            ->selectRaw('coalesce(sum(fee_amount), 0)::bigint as fee')
            ->selectRaw('count(*)::bigint as count')
            // See SalesInsights::totals(): an aggregate hydrated as a model is a
            // row whose every column is an undefined property.
            ->toBase()
            ->get()
            ->map(fn (object $row): array => [
                'direction' => 'in',
                'label' => (string) $row->method,
                'count' => (int) $row->count,
                'amount_tiyin' => (int) $row->amount,
                // What the acquirer keeps. Shown beside the gross so the row
                // reconciles against a bank statement, which is the whole
                // purpose of a cash-flow report as opposed to a revenue one.
                'fee_tiyin' => (int) $row->fee,
            ])
            ->all();

        $outgoings = Expense::query()
            ->whereBetween('business_date', [$window->from, $window->to])
            ->groupBy('category')
            ->selectRaw('category')
            ->selectRaw('coalesce(sum(amount), 0)::bigint as amount')
            ->selectRaw('count(*)::bigint as count')
            ->toBase()
            ->get()
            ->map(fn (object $row): array => [
                'direction' => 'out',
                'label' => (string) $row->category,
                'count' => (int) $row->count,
                'amount_tiyin' => (int) $row->amount,
                'fee_tiyin' => 0,
            ])
            ->all();

        return $this->table($window, 'cashflow', [
            ['key' => 'direction', 'type' => 'text'],
            ['key' => 'label', 'type' => 'text'],
            ['key' => 'count', 'type' => 'count'],
            ['key' => 'amount_tiyin', 'type' => 'money'],
            ['key' => 'fee_tiyin', 'type' => 'money'],
        ], [...$takings, ...$outgoings]);
    }

    /**
     * One line per drawer that was closed — the end-of-day pack.
     *
     * The design's Z-report card is "sales, payments, voids and drawer count for
     * one service day", and the shift IS that unit: a till is opened once,
     * counted once and signed once. A row per shift rather than per day, because
     * a venue running two tills on a Saturday closed two drawers and one of them
     * may be the one that was short.
     *
     * Only closed shifts. An open till has no count and its `difference` is
     * zero — including it would report every running drawer as reconciled and
     * quietly improve the month while service was still going on.
     *
     * @return array<string, mixed>
     */
    private function zreport(ReportWindow $window): array
    {
        $rows = CashShift::query()
            ->whereNotNull('closed_at')
            // On `opened_at`: a shift carries no `business_date` column, and a
            // plain comparison keeps the index — never `whereDate()`.
            ->whereBetween('opened_at', [
                CarbonImmutable::parse($window->from)->startOfDay(),
                CarbonImmutable::parse($window->to)->addDay()->startOfDay(),
            ])
            ->withSum(['payments as takings' => fn ($query) => $query->where('status', 'captured')], 'amount')
            ->orderBy('opened_at')
            ->get()
            ->map(fn (CashShift $shift): array => [
                'number' => $shift->number,
                'opened_at' => $shift->opened_at->toDateTimeString(),
                'closed_at' => $shift->closed_at?->toDateTimeString(),
                // The aggregate rather than the accessor: `total_takings` runs
                // its own query per row, which on a month of shifts is a
                // hundred round trips to answer one column.
                'takings_tiyin' => (int) ($shift->getAttribute('takings') ?? 0),
                'expected_cash_tiyin' => $shift->expected_cash,
                'counted_cash_tiyin' => $shift->counted_cash,
                'difference_tiyin' => $shift->difference,
            ])
            ->all();

        return $this->table($window, 'zreport', [
            ['key' => 'number', 'type' => 'text'],
            ['key' => 'opened_at', 'type' => 'datetime'],
            ['key' => 'closed_at', 'type' => 'datetime'],
            ['key' => 'takings_tiyin', 'type' => 'money'],
            ['key' => 'expected_cash_tiyin', 'type' => 'money'],
            ['key' => 'counted_cash_tiyin', 'type' => 'money'],
            ['key' => 'difference_tiyin', 'type' => 'money'],
        ], $rows);
    }

    /**
     * Units, revenue and margin per menu item, with the category beside it.
     *
     * Close to `dishes()` and deliberately not the same report: that one is
     * sorted by margin and is read to decide what to promote, this one carries
     * the category a dish belongs to and is read to compare sections of the menu
     * against each other. Merging them would mean one of the two screens
     * silently changing what it sorts by.
     *
     * The category is the item's own, not the line's: `orders.order_items`
     * snapshots the title and the price it was sold at — which is right, a bill
     * must not change when the menu does — but it has never carried a category,
     * and a dish moved between sections belongs where the menu says it is now.
     *
     * @return array<string, mixed>
     */
    private function items(ReportWindow $window): array
    {
        $branchId = app(BranchContext::class)->id();

        $rows = DB::table('orders.order_items as i')
            ->join('orders.orders as o', 'o.id', '=', 'i.order_id')
            ->leftJoin('menu.menu_items as m', 'm.id', '=', 'i.menu_item_id')
            ->leftJoin('menu.menu_categories as c', 'c.id', '=', 'm.menu_category_id')
            ->where('o.status', 'paid')
            ->whereBetween('o.business_date', [$window->from, $window->to])
            ->whereNull('i.deleted_at')
            ->whereNull('o.deleted_at')
            ->where('i.status', '<>', 'cancelled')
            ->when($branchId !== null, fn ($query) => $query->where('o.branch_id', $branchId))
            ->groupBy('c.slug', 'i.sku', 'i.title')
            ->selectRaw('coalesce(c.slug, \'—\') as category')
            ->selectRaw('i.sku, i.title')
            ->selectRaw('coalesce(sum(i.quantity), 0)::bigint as sold')
            ->selectRaw('coalesce(sum(i.total_price), 0)::bigint as revenue')
            // `max`, not `sum`: cost is a per-unit property of the dish and
            // grouping does not change it — see dishes() for the same note.
            ->selectRaw('max(m.cost_price)::bigint as unit_cost')
            ->orderByRaw('category, revenue desc')
            ->get()
            ->map(function (object $row): array {
                $revenue = (int) $row->revenue;
                $cost = $row->unit_cost === null ? null : (int) $row->unit_cost * (int) $row->sold;

                return [
                    'category' => (string) $row->category,
                    'sku' => (string) $row->sku,
                    'title' => (string) $row->title,
                    'sold' => (int) $row->sold,
                    'revenue_tiyin' => $revenue,
                    'cost_tiyin' => $cost,
                    // Null rather than 100 where the dish has no costed recipe.
                    // A margin computed against a missing cost is the most
                    // flattering possible lie about a kitchen.
                    'margin_percent' => $cost === null || $revenue === 0
                        ? null
                        : (int) round((($revenue - $cost) / $revenue) * 100),
                ];
            })
            ->all();

        return $this->table($window, 'items', [
            ['key' => 'category', 'type' => 'text'],
            ['key' => 'sku', 'type' => 'text'],
            ['key' => 'title', 'type' => 'text'],
            ['key' => 'sold', 'type' => 'count'],
            ['key' => 'revenue_tiyin', 'type' => 'money'],
            ['key' => 'cost_tiyin', 'type' => 'money'],
            ['key' => 'margin_percent', 'type' => 'percent'],
        ], $rows);
    }

    /**
     * Taxable sales and the VAT inside them, day by day.
     *
     * The menu price INCLUDES the tax in this market, so the tax is not added on
     * top of what was taken — it is the part of it that belongs to the state.
     * `net = gross ÷ (1 + rate)` and `vat = gross − net`, computed in integer
     * tiyin per day so the column adds up to its own total rather than to a
     * rounding of it.
     *
     * A day at a time, because that is the granularity a filing is reconciled
     * at and because a month with one wrong day is otherwise a month somebody
     * has to re-derive by hand.
     *
     * This is the PACK, not the return. Filing it is Didox and there is no
     * token for it (docs/GO-LIVE.md); what this produces is the table an
     * accountant types from, which is what the card promises.
     *
     * @return array<string, mixed>
     */
    private function vat(ReportWindow $window): array
    {
        $rate = (int) ($this->tenants->tenant()?->settings['vat_percent'] ?? 12);
        $branchId = app(BranchContext::class)->id();

        $rows = Payment::query()
            ->captured()
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->whereBetween('business_date', [$window->from, $window->to])
            ->groupBy('business_date')
            ->selectRaw('business_date')
            ->selectRaw('coalesce(sum(amount), 0)::bigint as gross')
            ->selectRaw('count(*)::bigint as count')
            ->orderBy('business_date')
            ->toBase()
            ->get()
            ->map(function (object $row) use ($rate): array {
                $gross = (int) $row->gross;
                // Integer division of the tax out of a tax-inclusive figure.
                // The net is rounded and the VAT is the remainder, so the two
                // always add back to the gross — the other way round leaves a
                // tiyin on the floor on roughly half the days of the month.
                $net = (int) round($gross * 100 / (100 + $rate));

                return [
                    'date' => (string) $row->business_date,
                    'receipts' => (int) $row->count,
                    'gross_tiyin' => $gross,
                    'net_tiyin' => $net,
                    'vat_tiyin' => $gross - $net,
                ];
            })
            ->all();

        return $this->table($window, 'vat', [
            ['key' => 'date', 'type' => 'text'],
            ['key' => 'receipts', 'type' => 'count'],
            ['key' => 'gross_tiyin', 'type' => 'money'],
            ['key' => 'net_tiyin', 'type' => 'money'],
            ['key' => 'vat_tiyin', 'type' => 'money'],
        ], $rows);
    }

    /**
     * Every venue side by side, as a table that can be exported.
     *
     * The same figures the Branches screen draws, from the same service — not a
     * second query. An exporter with its own query is an exporter that disagrees
     * with the screen, and the disagreement is always found by the person who
     * trusted the file.
     *
     * @return array<string, mixed>
     */
    private function branches(ReportWindow $window): array
    {
        /** @var list<array<string, mixed>> $venues */
        $venues = $this->branchReport->forWindow($window)['branches'];

        return $this->table($window, 'branches', [
            ['key' => 'name', 'type' => 'text'],
            ['key' => 'revenue_tiyin', 'type' => 'money'],
            ['key' => 'orders_count', 'type' => 'count'],
            ['key' => 'guests_count', 'type' => 'count'],
            ['key' => 'average_cheque_tiyin', 'type' => 'money'],
            ['key' => 'margin_percent', 'type' => 'percent'],
            ['key' => 'labour_percent', 'type' => 'percent'],
            ['key' => 'food_cost_percent', 'type' => 'percent'],
            ['key' => 'staff_count', 'type' => 'count'],
        ], array_map(static fn (array $venue): array => [
            'name' => $venue['name'],
            'revenue_tiyin' => $venue['revenue_tiyin'],
            'orders_count' => $venue['orders_count'],
            'guests_count' => $venue['guests_count'],
            'average_cheque_tiyin' => $venue['average_cheque_tiyin'],
            'margin_percent' => $venue['margin_percent'],
            'labour_percent' => $venue['labour_percent'],
            'food_cost_percent' => $venue['food_cost_percent'],
            'staff_count' => $venue['staff_count'],
        ], $venues));
    }

    // ============ Shape ============

    /**
     * @param array<int, array{key: string, type: string}> $columns
     * @param array<int, array<string, mixed>> $rows
     *
     * @return array<string, mixed>
     */
    private function table(ReportWindow $window, string $kind, array $columns, array $rows): array
    {
        return [
            'kind' => $kind,
            'window' => $window->toArray(),
            'available' => true,
            'columns' => $columns,
            'rows' => $rows,
            'totals' => $this->totals($columns, $rows),
        ];
    }

    /**
     * Column totals, for the numeric columns only.
     *
     * A percent column is deliberately excluded rather than summed: the sum of
     * nine margins is not a margin, and a footer showing 612% would be laughed
     * at once and then quoted in a meeting.
     *
     * @param array<int, array{key: string, type: string}> $columns
     * @param array<int, array<string, mixed>> $rows
     *
     * @return array<string, int>
     */
    private function totals(array $columns, array $rows): array
    {
        $totals = [];

        foreach ($columns as $column) {
            if (! in_array($column['type'], ['money', 'count'], true)) {
                continue;
            }

            $totals[$column['key']] = (int) array_sum(array_map(
                static fn (array $row): int => (int) ($row[$column['key']] ?? 0),
                $rows,
            ));
        }

        return $totals;
    }

    /**
     * @return array<string, mixed>
     */
    private function unavailable(ReportWindow $window, string $reason): array
    {
        return [
            'kind' => 'unavailable',
            'window' => $window->toArray(),
            'available' => false,
            'reason' => $reason,
            'columns' => [],
            'rows' => [],
            'totals' => [],
        ];
    }
}
