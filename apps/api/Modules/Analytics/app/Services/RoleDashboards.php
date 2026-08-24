<?php

declare(strict_types=1);

namespace Modules\Analytics\Services;

use App\Contracts\Inventory\ConsumedLine;
use App\Contracts\Inventory\StockReport;
use App\Contracts\Inventory\StockSnapshot;
use App\Contracts\Kitchen\KitchenLoad;
use App\Contracts\Kitchen\StationSpeed;
use App\Contracts\Staff\Roster;
use App\Contracts\Suppliers\IncomingDelivery;
use App\Contracts\Suppliers\Payable;
use App\Contracts\Suppliers\Purchasing;
use App\Contracts\Tables\FloorBoard;
use App\Contracts\Tables\FloorSeat;
use App\Models\User;
use App\Support\Orders\OrderState;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;

/**
 * The home screen, and why there are seven of them rather than one with filters.
 *
 * A dashboard is not a report — it is the first thing somebody sees when they
 * sit down, and the whole of its value is that it answers THEIR question in one
 * glance. The console draws a different one per role because the questions are
 * genuinely different:
 *
 *   owner        is the business earning, across every venue
 *   manager      is tonight going well, in this venue
 *   cashier      what is in my drawer and what is waiting to be paid
 *   accountant   what came in, what went out, and what is not banked yet
 *   warehouse    what is running out
 *   waiter       what are MY tables doing and what have I sold
 *   operator     how fast is the queue moving and what is already late
 *
 * One endpoint with seven shapes rather than seven endpoints, because they
 * share every underlying figure and seven endpoints would compute revenue seven
 * times — differently, eventually.
 *
 * ---------------------------------------------------------------------------
 * The role is not authorisation
 *
 * `?role=` picks which figures to assemble. It does NOT decide what the caller
 * may see: that is `analytics.view` on the route, the tenant scope on every
 * query, and the branch the request resolved to. A cashier passing `role=owner`
 * gets the owner's SHAPE over their own venue's data, which is harmless, and
 * `middleware.ts` never sends them there anyway.
 *
 * The one exception is `waiter`, and it is not an exception to that rule — it
 * is scoped to the SIGNED-IN person rather than to a role. A waiter's dashboard
 * is about their own tables and their own takings, and reading a colleague's is
 * not something a role should permit; see `waiterBlock()`.
 *
 * ---------------------------------------------------------------------------
 * Three contracts, and why they are not queries
 *
 * `FloorBoard`, `Roster` and `StockReport` are how this module reads Tables,
 * Staff and Inventory. `ModuleBoundaryTest` records exactly three allowed edges
 * out of Analytics — Menu, Orders and Finance — and each is a decision. The
 * floor tally, the head count and the shelf are the figures three dashboards
 * cannot be drawn without, and a contract is what makes them reachable without
 * turning four modules into one program.
 */
final class RoleDashboards
{
    public const ROLES = ['owner', 'manager', 'cashier', 'accountant', 'warehouse', 'waiter', 'operator'];

    /**
     * The shelf, read once per request.
     *
     * Three call sites want it — the warehouse KPI row, that screen's donut,
     * and the "diqqat" panel on two other dashboards — and it is a scan of the
     * whole catalogue. Memoised on the instance rather than cached: the service
     * is resolved per request, so this is exactly one read per response and
     * nothing can go stale inside one.
     */
    private ?StockSnapshot $shelf = null;

    public function __construct(
        private readonly SalesInsights $sales,
        private readonly FloorBoard $floor,
        private readonly Roster $roster,
        private readonly StockReport $stock,
        private readonly KitchenLoad $kitchen,
        private readonly Purchasing $purchasing,
        private readonly BranchContext $branches,
        private readonly TenantContext $tenants,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function build(string $role, ReportWindow $window): array
    {
        $role = in_array($role, self::ROLES, true) ? $role : 'manager';
        $summary = $this->sales->summary($window);

        return [
            'role' => $role,
            'window' => $window->toArray(),
            'currency' => 'UZS',
            'kpis' => $this->kpis($role, $summary, $window),
            ...match ($role) {
                'owner' => [
                    'branches' => $this->byBranch($window),
                    'hours' => $summary['hours'],
                    'top_items' => $summary['top_items'],
                    'attention' => $this->attention($summary),
                    'recent_orders' => $this->recentOrders(),
                ],
                'manager' => [
                    'hours' => $summary['hours'],
                    'top_items' => $summary['top_items'],
                    'channels' => $summary['channels'],
                    'open_orders' => $this->openOrders(),
                    'waiters' => $this->byWaiter($window),
                    'stations' => $this->stations($window),
                    'floor' => $this->floorTally(),
                    'on_shift_count' => $this->roster->onShiftCount($this->branches->id()),
                    'attention' => $this->attention($summary),
                    'recent_orders' => $this->recentOrders(),
                    'average_wait_minutes' => $this->averageWaitMinutes($window),
                    'cancelled' => $this->cancelledCount($window),
                    'covers' => $summary['guests_count'],
                ],
                'cashier' => [
                    'shift' => $this->currentShift(),
                    'methods' => $this->byMethod($window),
                    'recent_payments' => $this->recentPayments(),
                    'refunds' => $this->refundCount($window),
                    'tables_awaiting' => $this->tablesAwaiting(),
                ],
                'accountant' => [
                    'methods' => $this->byMethod($window),
                    'expenses' => $this->expensesByCategory($window),
                    'unbanked' => $this->unbanked($window),
                    'cashflow' => $this->cashflow(),
                    ...$this->payablesBlock(),
                ],
                'warehouse' => $this->warehouseBlock($window),
                'waiter' => $this->waiterBlock($window),
                /*
                 * `default` and not `'operator'`, because `$role` was narrowed
                 * to the seven above two lines up — a literal arm here would be
                 * unreachable, and PHPStan says so. The eighth role that is
                 * added to ROLES lands here until it is given a block, which is
                 * the right failure: an empty body beside a full KPI row.
                 */
                default => $this->operatorBlock($window, $summary),
            },
        ];
    }

    /**
     * The cards across the top, in the order the design draws them.
     *
     * Each carries its unit so a client formats without guessing: `money` is
     * integer tiyin and is divided at the edge, `count` is a plain number, and
     * `percent` is already a percentage rather than a ratio. A client that had
     * to infer this from the key name would render a food cost of 3 400%.
     *
     * A `value` of null means the server cannot answer that card honestly —
     * `gross_profit` before any recipe is costed, `labour_cost` before the
     * nightly projection has run. Null and zero are different answers and only
     * one of them is a reason to go and look at something.
     *
     * @param array<string, mixed> $summary
     *
     * @return array<int, array<string, mixed>>
     */
    private function kpis(string $role, array $summary, ReportWindow $window): array
    {
        $money = static fn (string $key, string $source, ?float $delta = null): array => [
            'key' => $key,
            'unit' => 'money',
            'value' => $summary[$source],
            'delta_percent' => $delta,
        ];

        $count = static fn (string $key, int $value, ?float $delta = null): array => [
            'key' => $key,
            'unit' => 'count',
            'value' => $value,
            'delta_percent' => $delta,
        ];

        $percent = static fn (string $key, float|int|null $value): array => [
            'key' => $key,
            'unit' => 'percent',
            'value' => $value,
            'delta_percent' => null,
        ];

        $gross = static fn (string $key): array => [
            'key' => $key,
            'unit' => 'money',
            'value' => self::grossProfitEstimate($summary),
            'delta_percent' => null,
        ];

        return match ($role) {
            'owner', 'manager' => [
                $money('revenue', 'revenue_tiyin', $summary['delta']['revenue_percent']),
                $count('orders', $summary['orders_count'], $summary['delta']['orders_percent']),
                $money('average_cheque', 'average_cheque_tiyin', $summary['delta']['average_cheque_percent']),
                $count('guests', $summary['guests_count']),
                $percent('food_cost', $summary['food_cost_percent']),
                $money('expenses', 'expenses_tiyin'),
                /*
                 * Gross profit, and null until enough of the menu is costed.
                 *
                 * `overview-server.ts` refused to draw this at all and gave the
                 * reason: a partial cost base overstates profit by exactly the
                 * share nobody has costed. The figure now exists; the coverage
                 * that qualifies it travels beside it so the client can decide
                 * rather than inherit the decision.
                 */
                $gross('gross_profit'),
                $percent('labour_cost', $summary['labour_cost_percent']),
            ],
            'cashier' => [
                $money('takings', 'takings_tiyin'),
                $count('orders', $summary['orders_count']),
                $money('average_cheque', 'average_cheque_tiyin'),
                $money('discounts', 'discounts_tiyin'),
            ],
            'accountant' => [
                $money('revenue', 'revenue_tiyin', $summary['delta']['revenue_percent']),
                $money('takings', 'takings_tiyin'),
                $money('expenses', 'expenses_tiyin'),
                $money('discounts', 'discounts_tiyin'),
                $gross('gross_profit'),
                $percent('net_margin', $this->netMargin($summary)),
            ],
            'warehouse' => $this->warehouseKpis(),
            'waiter' => $this->waiterKpis($window),
            'operator' => [
                $count('orders', $summary['orders_count'], $summary['delta']['orders_percent']),
                $money('average_cheque', 'average_cheque_tiyin'),
                $money('revenue', 'revenue_tiyin'),
                $count('declined', $this->declinedCount($window)),
            ],
            default => [
                $money('revenue', 'revenue_tiyin', $summary['delta']['revenue_percent']),
                $count('orders', $summary['orders_count']),
            ],
        };
    }

    /**
     * What is left after everything, as a percentage of revenue.
     *
     * Revenue minus cost of goods minus recorded expenses. NOT a statutory net
     * margin — payroll only appears here to the extent somebody booked it as an
     * expense, and tax is not modelled at all — so it is the accountant's
     * working figure and is null whenever gross profit is.
     *
     * @param array<string, mixed> $summary
     */
    private function netMargin(array $summary): ?float
    {
        $revenue = (int) $summary['revenue_tiyin'];
        $gross = self::grossProfitEstimate($summary);

        if ($revenue <= 0 || $gross === null) {
            return null;
        }

        return round(($gross - (int) $summary['expenses_tiyin']) / $revenue * 100, 1);
    }

    /**
     * Gross profit as a card can honestly carry it.
     *
     * The summary's `gross_profit_tiyin` comes from the nightly projection —
     * revenue minus the cost of the dishes that have a recipe, for the days
     * that have been rolled up. Its `revenue_tiyin` and `food_cost_percent`
     * come from the bills themselves, as of now. On a window the projection
     * has only partly reached (today, always; a demo week written back in
     * time), the exact figure covers one day and the revenue covers seven,
     * and the owner's card drew a 92% margin beside a food-cost card saying
     * 31% — two figures on one screen, contradicting each other.
     *
     * So the card is the live pair, always: the food-cost ratio measured over
     * the costed dishes, applied to all of the revenue. That is the estimate
     * every restaurant makes on paper, it agrees with the card beside it by
     * construction, and on a fully costed menu it is the projection's own
     * figure — the ratio over every line, times the sales of every line.
     * Nothing costed, or nothing sold: null, and the card draws a dash.
     *
     * @param array<string, mixed> $summary
     */
    public static function grossProfitEstimate(array $summary): ?int
    {
        $revenue = (int) ($summary['revenue_tiyin'] ?? 0);
        $foodCost = $summary['food_cost_percent'] ?? null;

        if ($revenue <= 0 || $foodCost === null) {
            return null;
        }

        return (int) round($revenue * (1 - (float) $foodCost / 100));
    }

    /**
     * Revenue per venue — the owner's row, and the one query that ignores the
     * branch scope on purpose.
     *
     * An owner comparing five branches has to see five branches. `X-Branch`
     * narrows every other read on this platform, and a branch-scoped comparison
     * table would be one row long. Grouping BY the branch is the answer rather
     * than filtering by it, and the tenant scope is still doing its job
     * underneath — which is exactly CLAUDE.md's "an empty branch is a roll-up,
     * an empty tenant is a hole".
     *
     * @return array<int, array<string, mixed>>
     */
    private function byBranch(ReportWindow $window): array
    {
        return DB::table('orders.orders as o')
            ->leftJoin('public.branches as b', 'b.id', '=', 'o.branch_id')
            ->where('o.status', 'paid')
            ->whereBetween('o.business_date', [$window->from, $window->to])
            ->whereNull('o.deleted_at')
            ->groupBy('o.branch_id', 'b.name')
            ->selectRaw('o.branch_id, b.name')
            ->selectRaw('coalesce(sum(o.total), 0)::bigint as revenue')
            ->selectRaw('count(*)::bigint as orders')
            ->orderByRaw('revenue desc')
            ->get()
            ->map(fn (object $row): array => [
                'branch_id' => $row->branch_id === null ? null : (int) $row->branch_id,
                'name' => $row->name,
                'revenue_tiyin' => (int) $row->revenue,
                'orders_count' => (int) $row->orders,
            ])
            ->all();
    }

    /** How much of it arrived by which rail. */
    private function byMethod(ReportWindow $window): array
    {
        return Payment::query()
            ->captured()
            ->whereBetween('business_date', [$window->from, $window->to])
            ->groupBy('method')
            ->selectRaw('method')
            ->selectRaw('coalesce(sum(amount), 0)::bigint as amount')
            ->selectRaw('count(*)::bigint as count')
            ->orderByRaw('amount desc')
            // See SalesInsights::totals() — an aggregate hydrated as a model is
            // a row whose every column is an undefined property.
            ->toBase()
            ->get()
            ->map(fn (object $row): array => [
                'method' => (string) $row->method,
                'amount_tiyin' => (int) $row->amount,
                'count' => (int) $row->count,
            ])
            ->all();
    }

    private function expensesByCategory(ReportWindow $window): array
    {
        return Expense::query()
            ->whereBetween('business_date', [$window->from, $window->to])
            ->groupBy('category')
            ->selectRaw('category')
            ->selectRaw('coalesce(sum(amount), 0)::bigint as amount')
            ->orderByRaw('amount desc')
            ->toBase()
            ->get()
            ->map(fn (object $row): array => [
                'category' => (string) $row->category,
                'amount_tiyin' => (int) $row->amount,
            ])
            ->all();
    }

    /**
     * Revenue the restaurant has earned and not been paid for.
     *
     * A credit sale is revenue with no takings behind it — "balansiga yozildi ·
     * pul kelmadi" — and an accountant reconciling a day against a bank
     * statement needs the gap to have a name. Without it the day reads as a
     * shortfall and somebody gets asked about a drawer that was correct.
     */
    private function unbanked(ReportWindow $window): int
    {
        return (int) Payment::query()
            ->captured()
            ->where('method', 'credit')
            ->whereBetween('business_date', [$window->from, $window->to])
            ->sum('amount');
    }

    /**
     * Six months in and six months out — the accountant's chart.
     *
     * Ignores the period toggle deliberately: a cash-flow chart is a shape over
     * time, and redrawing it as "today, hour by hour" would answer a question
     * nobody asked of it. Six because that is what the design draws, and
     * because a year of bars at that width is unreadable.
     *
     * Grouped in SQL rather than six queries. Inflow is takings (money that
     * arrived) rather than revenue, because this chart is about cash — a credit
     * sale is revenue this month and cash whenever the guest settles.
     *
     * @return array<int, array<string, mixed>>
     */
    private function cashflow(): array
    {
        $from = Carbon::now()->startOfMonth()->subMonths(5)->toDateString();

        $months = [];

        for ($i = 5; $i >= 0; $i--) {
            $months[Carbon::now()->startOfMonth()->subMonths($i)->format('Y-m')] = [
                'inflow_tiyin' => 0,
                'outflow_tiyin' => 0,
            ];
        }

        $inflow = Payment::query()
            ->captured()
            ->where('business_date', '>=', $from)
            ->groupByRaw("to_char(business_date, 'YYYY-MM')")
            ->selectRaw("to_char(business_date, 'YYYY-MM') as month")
            ->selectRaw('coalesce(sum(amount), 0)::bigint as amount')
            ->toBase()
            ->get();

        $outflow = Expense::query()
            ->where('business_date', '>=', $from)
            ->groupByRaw("to_char(business_date, 'YYYY-MM')")
            ->selectRaw("to_char(business_date, 'YYYY-MM') as month")
            ->selectRaw('coalesce(sum(amount), 0)::bigint as amount')
            ->toBase()
            ->get();

        foreach ($inflow as $row) {
            if (isset($months[$row->month])) {
                $months[$row->month]['inflow_tiyin'] = (int) $row->amount;
            }
        }

        foreach ($outflow as $row) {
            if (isset($months[$row->month])) {
                $months[$row->month]['outflow_tiyin'] = (int) $row->amount;
            }
        }

        // A month with no trade is kept, at zero. Dropping it would close the
        // gap in the chart and make a shut venue look like a busy one.
        return array_map(
            static fn (string $month, array $figures): array => ['month' => $month, ...$figures],
            array_keys($months),
            array_values($months),
        );
    }

    /** Bills still open right now — a live figure, not a windowed one. */
    private function openOrders(): int
    {
        $branchId = $this->branches->id();

        return (int) DB::table('orders.orders')
            ->whereNull('deleted_at')
            ->whereNotIn('status', ['paid', 'voided', 'refunded', 'comped'])
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->count();
    }

    /**
     * How many tables are sitting with the bill asked for and not yet settled.
     *
     * The cashier's fourth card, and until now the one figure on that screen
     * that was a constant — the console showed three tables waiting at a venue
     * that had served nobody. It is a live count and not a windowed one for the
     * same reason `openOrders()` is: the question is "who is waiting on me right
     * now", and a month filter would answer it with a month of history.
     *
     * `topay` and nothing else. The ladder has one state for a bill that has
     * been asked for and not paid, and widening this to `served` would count
     * every table still eating as one waiting to pay — which is the number a
     * cashier would walk the room to check, once.
     *
     * Distinct tables rather than bills: a party that split onto two bills is
     * one table, and the card says "tables".
     */
    private function tablesAwaiting(): int
    {
        $branchId = $this->branches->id();

        return (int) DB::table('orders.orders')
            ->where('status', OrderState::ToPay->value)
            ->whereNotNull('restaurant_table_id')
            ->whereNull('deleted_at')
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->distinct()
            ->count('restaurant_table_id');
    }

    /**
     * The till this venue currently has open, if any.
     *
     * @return array<string, mixed>|null
     */
    private function currentShift(): ?array
    {
        /** @var CashShift|null $shift */
        $shift = CashShift::query()->where('status', 'open')->orderByDesc('id')->first();

        if ($shift === null) {
            return null;
        }

        return [
            'id' => (int) $shift->getKey(),
            'number' => $shift->number,
            'opened_at' => $shift->opened_at->toIso8601String(),
            'opening_cash_tiyin' => (int) $shift->opening_cash,
            'expected_cash_tiyin' => (int) $shift->expected_cash,
        ];
    }

    // ============ The four blocks the console was still drawing from fixtures ============

    /**
     * What each waiter sold, for the manager's table.
     *
     * The same aggregate `GET /api/v1/orders/stats/by-waiter` publishes for the
     * staff roster, computed here rather than called across, because Orders is
     * one of this module's three recorded edges and an HTTP hop to our own
     * process to fetch six rows would be theatre.
     *
     * The name comes from `public.users`, which is core rather than a module —
     * reading it crosses nothing. A waiter with no user row (a bill opened by
     * an account since deleted) is kept with an em dash rather than dropped:
     * their takings are still part of the venue's evening.
     *
     * @return array<int, array<string, mixed>>
     */
    private function byWaiter(ReportWindow $window): array
    {
        $branchId = $this->branches->id();

        $rows = DB::table('orders.orders as o')
            ->leftJoin('public.users as u', 'u.id', '=', 'o.waiter_user_id')
            ->where('o.status', 'paid')
            ->whereNotNull('o.waiter_user_id')
            ->whereBetween('o.business_date', [$window->from, $window->to])
            ->whereNull('o.deleted_at')
            ->when($branchId !== null, fn ($query) => $query->where('o.branch_id', $branchId))
            ->groupBy('o.waiter_user_id', 'u.name')
            ->selectRaw('o.waiter_user_id, u.name')
            ->selectRaw('count(*)::bigint as tickets')
            ->selectRaw('coalesce(sum(o.guests_count), 0)::bigint as covers')
            ->selectRaw('coalesce(sum(o.total), 0)::bigint as revenue')
            ->orderByRaw('revenue desc')
            ->limit(10)
            ->get();

        return $rows->map(static function (object $row): array {
            $tickets = (int) $row->tickets;
            $revenue = (int) $row->revenue;

            return [
                'user_id' => (int) $row->waiter_user_id,
                'name' => $row->name === null ? '—' : (string) $row->name,
                'tickets' => $tickets,
                'covers' => (int) $row->covers,
                'revenue_tiyin' => $revenue,
                'average_tiyin' => $tickets > 0 ? (int) round($revenue / $tickets) : 0,
            ];
        })->all();
    }

    /**
     * How full the room is, through the contract.
     *
     * Two numbers and not five. The design's floor card wants busy, free,
     * reserved and cleaning; `FloorTally` deliberately publishes occupied and
     * free — *"a table being cleaned is neither, which is why the two do not add
     * up to the room and must not be made to"*. Splitting reserved out would
     * mean widening a contract that other callers read, for one card.
     *
     * @return array<string, int>
     */
    private function floorTally(): array
    {
        $tally = $this->floor->tally($this->branches->id());

        return ['occupied' => $tally->occupied, 'free' => $tally->free];
    }

    /**
     * How long a bill sits between being fired and being served.
     *
     * The manager's "o'rtacha kutish". Measured on the BILL rather than on the
     * kitchen ticket, because ticket timestamps are Kitchen's and this module
     * may not read them — so this is the guest's wait, door to plate, which is
     * arguably the more honest of the two.
     *
     * Null when nothing closed in the window: a venue that has not served
     * anybody yet has no average, and rendering zero would read as instant
     * service.
     */
    private function averageWaitMinutes(ReportWindow $window): ?int
    {
        $branchId = $this->branches->id();

        $row = DB::table('orders.orders')
            ->where('status', 'paid')
            ->whereBetween('business_date', [$window->from, $window->to])
            ->whereNull('deleted_at')
            ->whereNotNull('placed_at')
            ->whereNotNull('closed_at')
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->selectRaw('avg(extract(epoch from (closed_at - placed_at)) / 60) as minutes')
            ->first();

        $minutes = $row->minutes ?? null;

        return $minutes === null ? null : max(0, (int) round((float) $minutes));
    }

    /** Bills called off in the window — voided, not comped. Two different things. */
    private function cancelledCount(ReportWindow $window): int
    {
        $branchId = $this->branches->id();

        return (int) DB::table('orders.orders')
            ->where('status', 'voided')
            ->whereBetween('business_date', [$window->from, $window->to])
            ->whereNull('deleted_at')
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->count();
    }

    /**
     * The last few bills, for the strip down the side of the owner's screen.
     *
     * Live rather than windowed — the panel answers "what is happening right
     * now", and a month-long period filter turning it into "the last eight
     * bills of the month" would be the same list every time somebody looked.
     *
     * @return array<int, array<string, mixed>>
     */
    private function recentOrders(): array
    {
        $branchId = $this->branches->id();

        return DB::table('orders.orders as o')
            ->leftJoin('public.branches as b', 'b.id', '=', 'o.branch_id')
            ->whereNull('o.deleted_at')
            ->where('o.status', '!=', OrderState::Draft->value)
            ->when($branchId !== null, fn ($query) => $query->where('o.branch_id', $branchId))
            ->orderByDesc('o.id')
            ->limit(8)
            ->selectRaw('o.number, o.status, o.total, o.table_label, o.channel, b.name as branch')
            ->get()
            ->map(static fn (object $row): array => [
                'number' => (string) $row->number,
                /*
                 * One line under the number, already joined.
                 *
                 * A table label when there is one, the venue otherwise — which
                 * is what a delivery or a counter sale has. Joined here rather
                 * than in the client because the fallback chain is a decision
                 * ("stol 7" beats "Chilonzor" beats the channel) and three
                 * clients would each pick a different order.
                 */
                'where' => (string) ($row->table_label ?? $row->branch ?? $row->channel),
                'status' => (string) $row->status,
                'total_tiyin' => (int) $row->total,
            ])
            ->all();
    }

    /**
     * Things somebody should look at, derived rather than invented.
     *
     * The console has drawn two sample cards here since it was built and
     * `overview-server.ts` explained why they stayed fixtures: *"a rules engine
     * that does not exist yet"*. This is the smallest honest version of one —
     * four rules over figures that are already on this response, each with the
     * screen it wants you to open.
     *
     * Nothing is a threshold somebody made up in a meeting: `food_cost` above
     * 35% and `labour_cost` above 30% are the two figures a restaurant is
     * actually steered on, an empty shelf is not a judgement call, and a void
     * rate over 5% is the loss-prevention screen's own trigger.
     *
     * A rule whose input is null produces no card. That is the whole discipline
     * of this method: an unknown must never render as a warning, because a
     * panel that cries about missing data is a panel people learn to close.
     *
     * @param array<string, mixed> $summary
     *
     * @return array<int, array<string, mixed>>
     */
    private function attention(array $summary): array
    {
        $cards = [];

        $foodCost = $summary['food_cost_percent'];

        if ($foodCost !== null && $foodCost > 35) {
            $cards[] = ['key' => 'food_cost', 'level' => 'warn', 'href' => '/analytics'];
        }

        $labour = $summary['labour_cost_percent'];

        if ($labour !== null && $labour > 30) {
            $cards[] = ['key' => 'labour_cost', 'level' => 'warn', 'href' => '/staff/shifts'];
        }

        $shelf = $this->shelf();

        if ($shelf->out > 0) {
            $cards[] = ['key' => 'stock_out', 'level' => 'warn', 'href' => '/inventory'];
        } elseif ($shelf->low > 0) {
            $cards[] = ['key' => 'stock_low', 'level' => 'note', 'href' => '/inventory'];
        }

        $voids = $summary['void_rate_percent'];

        if ($voids !== null && $voids > 5) {
            $cards[] = ['key' => 'void_rate', 'level' => 'warn', 'href' => '/analytics'];
        }

        return $cards;
    }

    // ============ Cashier ============

    /**
     * The last few payments through this till.
     *
     * A refund is a payment with the sign reversed rather than a separate kind,
     * which is how `cashier-data.ts` models it too — one list a cashier reads
     * top to bottom, not two they have to interleave.
     *
     * @return array<int, array<string, mixed>>
     */
    private function recentPayments(): array
    {
        return DB::table('finance.payments as p')
            // The bill NUMBER, not its id: the cashier's log prints "A-1286",
            // which is what a guest reads off a receipt and what somebody
            // typing into the search box will have in their hand.
            ->leftJoin('orders.orders as o', 'o.id', '=', 'p.order_id')
            ->orderByDesc('p.id')
            ->limit(8)
            ->selectRaw('p.id, p.created_at, p.method, p.amount, p.status, o.number')
            ->get()
            ->map(static fn (object $row): array => [
                'id' => (int) $row->id,
                'at' => $row->created_at === null
                    ? null
                    : Carbon::parse((string) $row->created_at)->toIso8601String(),
                'order' => $row->number === null ? null : (string) $row->number,
                'method' => (string) $row->method,
                'amount_tiyin' => (int) $row->amount,
                // Two ways a row is a refund and both count: a reversed sign,
                // and the status Finance sets when it hands money back.
                'refund' => (int) $row->amount < 0 || $row->status === 'refunded',
            ])
            ->all();
    }

    private function refundCount(ReportWindow $window): int
    {
        return (int) Payment::query()
            ->where('status', 'refunded')
            ->whereBetween('business_date', [$window->from, $window->to])
            ->count();
    }

    // ============ Warehouse ============

    /**
     * @return array<int, array<string, mixed>>
     */
    private function warehouseKpis(): array
    {
        $shelf = $this->shelf();

        $card = static fn (string $key, string $unit, float|int|null $value): array => [
            'key' => $key,
            'unit' => $unit,
            'value' => $value,
            'delta_percent' => null,
        ];

        return [
            $card('stock_low', 'count', $shelf->low),
            $card('stock_out', 'count', $shelf->out),
            $card('stock_expiring', 'count', $shelf->expiring),
            $card('waste_percent', 'percent', $this->wastePercent($shelf->valueTiyin)),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function warehouseBlock(ReportWindow $window): array
    {
        $shelf = $this->shelf();

        return [
            'stock' => [
                'ok' => $shelf->ok,
                'low' => $shelf->low,
                'out' => $shelf->out,
                'expiring' => $shelf->expiring,
            ],
            'consumed' => array_map(
                static fn (ConsumedLine $line): array => [
                    'id' => $line->ingredientId,
                    'name' => $line->name,
                    'quantity' => $line->quantity,
                    'unit' => $line->unit,
                    'cost_tiyin' => $line->costTiyin,
                ],
                $this->stock->consumedBetween($window->from, $window->to, 5),
            ),
            'waste_percent' => $this->wastePercent($shelf->valueTiyin),
            ...$this->deliveriesBlock($window),
        ];
    }

    /**
     * Waste as a share of what is on the shelf, over the last thirty days.
     *
     * Thirty rather than the caller's window, and that is deliberate: a day's
     * waste against a whole store's value is a number so small it renders as
     * 0.0% every time, and a storekeeper watching a rounding error learns
     * nothing. Null when the shelf is empty — dividing by nothing is not zero.
     */
    private function shelf(): StockSnapshot
    {
        return $this->shelf ??= $this->stock->snapshot();
    }

    private function wastePercent(int $shelfValue): ?float
    {
        if ($shelfValue <= 0) {
            return null;
        }

        $from = Carbon::now()->subDays(29)->toDateString();
        $wasted = $this->stock->wasteValueBetween($from, Carbon::now()->toDateString());

        return round($wasted / $shelfValue * 100, 1);
    }

    /**
     * How fast each section of the line is running — the manager's station bars.
     *
     * Through `KitchenLoad`, which grew this method for exactly this panel. The
     * console drew four amber bars from its fixture on every tenant, including
     * ones with no KDS at all, and an amber grill bar reads as an instruction
     * to walk over and intervene.
     *
     * The window is the caller's, so "this week" answers a week's average
     * rather than the last hour's. `average_minutes` travels as null when a
     * section finished nothing, because a bar at zero would read as a section
     * that is instantaneous rather than one that is idle.
     *
     * @return array<int, array<string, mixed>>
     */
    private function stations(ReportWindow $window): array
    {
        return array_map(
            static fn (StationSpeed $station): array => [
                'station' => $station->code,
                'open' => $station->openTickets,
                'average_minutes' => $station->averageMinutes,
                'target_minutes' => $station->targetMinutes,
            ],
            $this->kitchen->stations($window->from, $window->to, $this->branches->id()),
        );
    }

    /**
     * What the restaurant owes, and what falls due next.
     *
     * Spread into the accountant's arm rather than nested, because the three
     * figures are read by three different controls — two KPI cards and a list —
     * and a client digging them out of a sub-object would be a client that has
     * to know this grouping existed.
     *
     * `expense_budget_tiyin` sits here for a different reason and it is worth
     * stating: a budget is not a ledger figure at all. It is a plan somebody
     * set, it lives in `config/settings.php` under `targets.*`, and it is null
     * — not zero — for a restaurant that has never set one. Zero would draw a
     * screen reporting that every som spent is over budget.
     *
     * @return array<string, mixed>
     */
    private function payablesBlock(): array
    {
        $summary = $this->purchasing->payablesSummary();

        return [
            'unpaid_invoices' => $summary['unpaid'],
            'overdue_invoices' => $summary['overdue'],
            'payables_tiyin' => $summary['amount_tiyin'],
            'upcoming' => array_map(
                fn (Payable $row): array => [
                    'id' => $row->id,
                    'number' => $row->number,
                    'supplier' => $row->supplier,
                    'amount_tiyin' => $row->amountTiyin,
                    'due_at' => $row->dueAt,
                    /*
                     * How many sleeps, counted in the restaurant's own days.
                     *
                     * Negative once the deadline has passed, which is the whole
                     * signal on this list. Counted here rather than in the
                     * browser because a day boundary needs a timezone, and the
                     * console has none: a console rendered on a UTC box would
                     * flip "due in three days" to two at seven in the evening
                     * Tashkent time, for a deadline that had not moved.
                     *
                     * Null travels with a null date — a delivery that has not
                     * arrived has not started its terms, and a debt with no
                     * deadline must not be dated today at the top of a list
                     * ordered by urgency.
                     */
                    'due_in_days' => $this->daysUntil($row->dueAt),
                ],
                $this->purchasing->outstanding(6),
            ),
            'expense_budget_tiyin' => $this->monthlyExpenseBudget(),
        ];
    }

    /**
     * What somebody meant to spend this month, in tiyin.
     *
     * Read straight off the restaurant's settings document rather than through
     * `App\Support\Settings\Policies`, which is deliberately scoped to the
     * `policies.*` group: a target is not a rule the platform enforces anywhere,
     * it is a number the accountant's screen measures against.
     *
     * Null when it is absent or nonsensical. A budget of zero and no budget at
     * all are the same statement — nobody has set one — and both must draw a
     * dash rather than a bar reporting 100% overspend.
     */
    private function monthlyExpenseBudget(): ?int
    {
        $value = $this->tenants->tenant()?->setting('targets.expense_monthly_tiyin');

        if (! is_numeric($value)) {
            return null;
        }

        $budget = (int) $value;

        return $budget > 0 ? $budget : null;
    }

    /**
     * Vans due today, and the ones already signed for.
     *
     * Both from one call, because the KPI card above the table divides the
     * second by the first: two queries would let the numerator and the
     * denominator be cut on different clocks, and a storekeeper would read
     * "5 of 3 accepted".
     *
     * The status word is NOT decided here. `late` is a comparison against the
     * clock the reader is holding — see `IncomingDelivery` — and a label baked
     * in on the server is a label that is stale by the time it is drawn.
     *
     * @return array<string, mixed>
     */
    private function deliveriesBlock(ReportWindow $window): array
    {
        $rows = $this->purchasing->expectedBetween($window->from, $window->to, 8);

        return [
            'deliveries' => array_map(
                fn (IncomingDelivery $row): array => [
                    'id' => $row->id,
                    'number' => $row->number,
                    'supplier' => $row->supplier,
                    'lines' => $row->lines,
                    'expected_at' => $row->expectedAt,
                    /*
                     * The same instant as a wall clock, in the restaurant's own
                     * timezone.
                     *
                     * The console cannot derive this. `config('app.timezone')`
                     * is UTC on this platform, so every timestamp leaves here
                     * in UTC — and a browser slicing `09:00` out of the ISO
                     * string would tell a storekeeper in Tashkent that the van
                     * is due five hours before it is. The venue's clock is
                     * known here and nowhere else on the way to the screen.
                     */
                    'expected_time' => $this->localClock($row->expectedAt),
                    'received_at' => $row->receivedAt,
                    'total_tiyin' => $row->totalTiyin,
                ],
                $rows,
            ),
            'deliveries_expected' => count($rows),
            'deliveries_accepted' => count(array_filter(
                $rows,
                static fn (IncomingDelivery $row): bool => $row->receivedAt !== null,
            )),
        ];
    }

    // ============ Waiter ============

    /**
     * Their own figures, and nobody else's.
     *
     * Scoped to the signed-in user rather than to the role — the design's
     * intent for this screen and also the safer default, because a waiter who
     * can read the venue's takings can work out a colleague's. Everything below
     * carries `waiter_user_id = me`.
     *
     * Signed out (an impossible state on this route, but the queries would
     * otherwise be unscoped) the blocks come back empty rather than showing the
     * venue's.
     *
     * @return array<int, array<string, mixed>>
     */
    private function waiterKpis(ReportWindow $window): array
    {
        $mine = $this->myTotals($window);

        $card = static fn (string $key, string $unit, float|int|null $value): array => [
            'key' => $key,
            'unit' => $unit,
            'value' => $value,
            'delta_percent' => null,
        ];

        return [
            $card('revenue', 'money', $mine['revenue']),
            $card('orders', 'count', $mine['orders']),
            $card('average_cheque', 'money', $mine['orders'] > 0
                ? (int) round($mine['revenue'] / $mine['orders'])
                : 0),
            $card('guests', 'count', $mine['guests']),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function waiterBlock(ReportWindow $window): array
    {
        $userId = $this->currentUserId();

        if ($userId === null) {
            return ['orders' => [], 'top_items' => [], 'open_orders' => 0, 'tables' => []];
        }

        $now = Carbon::now();

        $orders = DB::table('orders.orders')
            ->where('waiter_user_id', $userId)
            ->whereNull('deleted_at')
            ->whereNotIn('status', ['paid', 'voided', 'refunded', 'comped'])
            ->orderByDesc('id')
            ->limit(10)
            ->selectRaw('id, number, table_label, status, total, placed_at')
            ->get();

        $lineCounts = DB::table('orders.order_items')
            ->whereIn('order_id', $orders->pluck('id')->all())
            ->whereNull('deleted_at')
            ->groupBy('order_id')
            ->selectRaw('order_id, count(*)::bigint as lines')
            ->pluck('lines', 'order_id');

        return [
            'orders' => $orders->map(static fn (object $row): array => [
                'number' => (string) $row->number,
                'table' => $row->table_label,
                'status' => (string) $row->status,
                'items' => (int) ($lineCounts[$row->id] ?? 0),
                'total_tiyin' => (int) $row->total,
                'minutes_ago' => $row->placed_at === null
                    ? 0
                    : max(0, (int) Carbon::parse((string) $row->placed_at)->diffInMinutes($now)),
            ])->all(),
            'top_items' => $this->myTopItems($window),
            'open_orders' => $orders->count(),
            'tables' => $this->mySection($userId),
        ];
    }

    /**
     * The tables this waiter is holding, with what is running on each.
     *
     * The join the phone already does — `packages/surfaces/src/crew/live.ts`
     * asks `GET /v1/tables/tables` and `GET /v1/orders/orders?filter[waiter]`
     * and puts them together — done once on the server instead, because the
     * console cannot make two extra reads on every dashboard render and because
     * the two surfaces disagreeing about a waiter's own section is exactly the
     * drift `pricing.ts` warns about.
     *
     * Two halves from two places, and that split is the module boundary:
     *
     *  - The furniture comes through `FloorBoard::section()`. A table row
     *    carries no bill and no guest; see `FloorSeat`.
     *  - The money comes from `orders.orders`, which this module may read.
     *
     * A table with no open bill keeps its row with nulls rather than being
     * dropped: an empty table in somebody's section is the thing they are meant
     * to fill, and a section that only listed occupied tables would hide it.
     *
     * @return array<int, array<string, mixed>>
     */
    private function mySection(int $userId): array
    {
        $seats = $this->floor->section($userId, $this->branches->id());

        if ($seats === []) {
            return [];
        }

        /*
         * One query for every open bill in the section, keyed by table.
         *
         * `max()` per table rather than one row each: a party split across two
         * bills is still one table, and the design's card has room for one
         * total. The larger of the two is the one somebody is about to be asked
         * for — and summing them would double-count a bill that was split by
         * money rather than by dish.
         */
        $bills = DB::table('orders.orders')
            ->whereIn('restaurant_table_id', array_map(
                static fn (FloorSeat $seat): int => $seat->id,
                $seats,
            ))
            ->whereNull('deleted_at')
            ->whereNotIn('status', ['paid', 'voided', 'refunded', 'comped'])
            ->groupBy('restaurant_table_id')
            ->selectRaw('restaurant_table_id')
            ->selectRaw('coalesce(max(total), 0)::bigint as total')
            ->selectRaw('coalesce(max(guests_count), 0)::bigint as guests')
            ->selectRaw('min(placed_at) as opened_at')
            ->get()
            ->keyBy('restaurant_table_id');

        $zone = $this->timezone();

        return array_map(static function (FloorSeat $seat) use ($bills, $zone): array {
            $bill = $bills[$seat->id] ?? null;

            /*
             * When the party sat down.
             *
             * The bill's own clock beats the claim: a table claimed at the
             * start of service and seated at eight has been busy for twenty
             * minutes, not for four hours.
             */
            $opened = $bill?->opened_at === null
                ? null
                : Carbon::parse((string) $bill->opened_at)->toIso8601String();

            $since = $opened ?? $seat->claimedAt;

            return [
                'id' => $seat->id,
                'label' => $seat->label,
                'seats' => $seat->seats,
                'kind' => $seat->kind,
                'zone' => $seat->zone,
                'status' => $seat->status,
                'since' => $since,
                // The same instant as a wall clock, in the restaurant's own
                // timezone — see `localClock()`. The card reads "10:44".
                'since_time' => self::clockIn($since, $zone),
                'bill_tiyin' => $bill === null ? null : (int) $bill->total,
                'guests' => $bill === null || (int) $bill->guests === 0 ? null : (int) $bill->guests,
            ];
        }, $seats);
    }

    /**
     * The restaurant's own clock.
     *
     * `config('app.timezone')` is UTC on this platform and every timestamp
     * leaves the API in it, so anything that has to be READ as a time of day —
     * "the van is due at 14:00", "they sat down at 10:44" — has to be turned
     * into the venue's own hours here. A browser slicing the hour out of an ISO
     * string would be five hours out in Tashkent, every time, on the two
     * screens where the whole value of the figure is the hour.
     *
     * The restaurant's zone rather than the branch's: a chain that trades in
     * two timezones is not something this platform models anywhere else, and
     * inventing a per-venue answer here would be the only place it did.
     */
    private function timezone(): string
    {
        $zone = $this->tenants->tenant()?->timezone;

        return is_string($zone) && $zone !== '' ? $zone : 'UTC';
    }

    /**
     * Whole days from today to that instant, in the restaurant's own calendar.
     *
     * Both sides floored to midnight before subtracting, so "tomorrow" is one
     * whether it is asked at breakfast or at closing. `diffInDays` on the raw
     * instants would answer zero for a deadline eighteen hours away.
     */
    private function daysUntil(?string $iso): ?int
    {
        if ($iso === null) {
            return null;
        }

        $zone = $this->timezone();

        return (int) Carbon::now($zone)->startOfDay()->diffInDays(
            Carbon::parse($iso)->setTimezone($zone)->startOfDay(),
            false,
        );
    }

    /** An ISO instant as `HH:MM` in the restaurant's own hours. */
    private function localClock(?string $iso): ?string
    {
        return self::clockIn($iso, $this->timezone());
    }

    private static function clockIn(?string $iso, string $zone): ?string
    {
        return $iso === null ? null : Carbon::parse($iso)->setTimezone($zone)->format('H:i');
    }

    /**
     * @return array{revenue: int, orders: int, guests: int}
     */
    private function myTotals(ReportWindow $window): array
    {
        $userId = $this->currentUserId();

        if ($userId === null) {
            return ['revenue' => 0, 'orders' => 0, 'guests' => 0];
        }

        $row = DB::table('orders.orders')
            ->where('waiter_user_id', $userId)
            ->where('status', 'paid')
            ->whereBetween('business_date', [$window->from, $window->to])
            ->whereNull('deleted_at')
            ->selectRaw('coalesce(sum(total), 0)::bigint as revenue')
            ->selectRaw('count(*)::bigint as orders')
            ->selectRaw('coalesce(sum(guests_count), 0)::bigint as guests')
            ->first();

        return [
            'revenue' => (int) ($row->revenue ?? 0),
            'orders' => (int) ($row->orders ?? 0),
            'guests' => (int) ($row->guests ?? 0),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function myTopItems(ReportWindow $window): array
    {
        $userId = $this->currentUserId();

        if ($userId === null) {
            return [];
        }

        return DB::table('orders.order_items as i')
            ->join('orders.orders as o', 'o.id', '=', 'i.order_id')
            ->where('o.waiter_user_id', $userId)
            ->where('o.status', 'paid')
            ->whereBetween('o.business_date', [$window->from, $window->to])
            ->whereNull('o.deleted_at')
            ->whereNull('i.deleted_at')
            ->where('i.status', '!=', 'cancelled')
            ->groupBy('i.sku', 'i.title')
            ->selectRaw('i.sku, i.title')
            ->selectRaw('coalesce(sum(i.quantity), 0)::bigint as sold')
            ->selectRaw('coalesce(sum(i.total_price), 0)::bigint as revenue')
            ->orderByRaw('sold desc')
            ->limit(5)
            ->get()
            ->map(static fn (object $row): array => [
                'sku' => (string) $row->sku,
                'title' => (string) $row->title,
                'sold' => (int) $row->sold,
                'revenue_tiyin' => (int) $row->revenue,
            ])
            ->all();
    }

    private function currentUserId(): ?int
    {
        /** @var User|null $person */
        $person = auth()->user();

        return $person === null ? null : (int) $person->getKey();
    }

    // ============ Operator ============

    /**
     * @param array<string, mixed> $summary
     *
     * @return array<string, mixed>
     */
    private function operatorBlock(ReportWindow $window, array $summary): array
    {
        return [
            'channels' => $summary['channels'],
            'intake_channels' => $this->intakeChannels($window),
            'open_orders' => $this->openOrders(),
            'hourly' => array_map(
                static fn (array $point): int => (int) $point['orders_count'],
                $summary['hours'],
            ),
            'top_items' => $summary['top_items'],
            'late' => $this->lateOrders(),
            'declined' => $this->declinedCount($window),
        ];
    }

    /**
     * Which DOOR the work came through, which is not which door it went out of.
     *
     * `channels` beside this one is `OrderChannel` — dine-in, takeaway,
     * delivery, aggregator — how an order was *fulfilled*. The intake desk is
     * measured on something else entirely: the telephone, the bot, the site and
     * the two aggregator apps are five different queues with five different
     * response times, and `aggregator` collapses two of them into one word.
     *
     * The console drew this panel from a constant until this method existed,
     * and the note in `dashboard-map.ts` was right to refuse the substitute:
     * splitting `aggregator` across Yandex and Uzum would have invented exactly
     * the split the panel is for. `intake_channel` is the column that records
     * it — null on everything that started in the room — so the group-by is the
     * honest answer and an empty list is a desk that has taken no orders.
     *
     * Cancelled work is left out of both figures. An order the operator
     * declined is not intake this desk delivered, and counting it would make
     * the busiest lane the one that fails most.
     *
     * @return array<int, array<string, mixed>>
     */
    private function intakeChannels(ReportWindow $window): array
    {
        $branchId = $this->branches->id();

        return DB::table('orders.orders')
            ->whereNotNull('intake_channel')
            ->whereNotIn('status', ['voided', 'refunded'])
            ->whereBetween('business_date', [$window->from, $window->to])
            ->whereNull('deleted_at')
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->groupBy('intake_channel')
            ->selectRaw('intake_channel')
            ->selectRaw('count(*)::bigint as orders')
            ->selectRaw('coalesce(sum(total), 0)::bigint as revenue')
            ->orderByRaw('orders desc')
            ->get()
            ->map(static fn (object $row): array => [
                'channel' => (string) $row->intake_channel,
                'orders_count' => (int) $row->orders,
                'revenue_tiyin' => (int) $row->revenue,
            ])
            ->all();
    }

    /**
     * Orders already past the time they were promised for.
     *
     * The operator's own screen, and the reason it exists: *"an operator who
     * finds out about a late delivery when the guest calls has lost the
     * argument before it starts."* Only orders still open — a late order that
     * was delivered is a complaint, not a queue.
     *
     * `promised_at` compared against a time bound from PHP, never SQL's `now()`:
     * `ModuleBoundaryTest` refuses that by name, because a replica or a pooler
     * can be on a different timezone from the application.
     *
     * @return array<int, array<string, mixed>>
     */
    private function lateOrders(): array
    {
        $now = Carbon::now();
        $branchId = $this->branches->id();

        return DB::table('orders.orders as o')
            ->leftJoin('public.branches as b', 'b.id', '=', 'o.branch_id')
            ->whereNull('o.deleted_at')
            ->whereNotNull('o.promised_at')
            ->where('o.promised_at', '<', $now)
            ->whereNotIn('o.status', ['paid', 'voided', 'refunded', 'comped'])
            ->when($branchId !== null, fn ($query) => $query->where('o.branch_id', $branchId))
            ->orderBy('o.promised_at')
            ->limit(8)
            ->selectRaw('o.number, o.promised_at, o.channel, o.status, b.name as branch')
            ->get()
            ->map(static fn (object $row): array => [
                'number' => (string) $row->number,
                'where' => trim(((string) $row->channel).' · '.((string) ($row->branch ?? '—'))),
                'minutes_late' => max(0, (int) Carbon::parse((string) $row->promised_at)->diffInMinutes($now)),
                /*
                 * Why, in one word, from the state rather than from a guess.
                 *
                 * A bill that is `ready` and late is waiting for somebody to
                 * carry it; anything earlier on the ladder is still in the
                 * kitchen. Two words is all this panel draws and all the data
                 * honestly supports — a third would be invented.
                 */
                'reason' => $row->status === OrderState::Ready->value ? 'no_courier' : 'in_kitchen',
            ])
            ->all();
    }

    /**
     * Orders refused over the window — the intake desk's own error rate.
     *
     * Windowed rather than fixed to today, because the period toggle above it
     * is real and a card that ignored it would sit beside four that did not.
     */
    private function declinedCount(ReportWindow $window): int
    {
        $branchId = $this->branches->id();

        return (int) DB::table('orders.orders')
            ->where('status', 'voided')
            ->whereBetween('business_date', [$window->from, $window->to])
            ->whereNull('deleted_at')
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->count();
    }
}
