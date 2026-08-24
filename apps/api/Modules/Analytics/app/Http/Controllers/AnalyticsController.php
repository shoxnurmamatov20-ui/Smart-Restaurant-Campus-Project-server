<?php

declare(strict_types=1);

namespace Modules\Analytics\Http\Controllers;

use App\Contracts\Crm\CaseDesk;
use App\Contracts\Finance\DayBook;
use App\Contracts\Inventory\StockReport;
use App\Contracts\Kitchen\KitchenLoad;
use App\Contracts\Messaging\ChatNotifier;
use App\Contracts\Tables\FloorBoard;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Modules\Analytics\Services\BranchPerformance;
use Modules\Analytics\Services\CashflowSeries;
use Modules\Analytics\Services\CsvReport;
use Modules\Analytics\Services\LabourCurve;
use Modules\Analytics\Services\LossControl;
use Modules\Analytics\Services\OneCReport;
use Modules\Analytics\Services\ProfitAndLoss;
use Modules\Analytics\Services\ReportWindow;
use Modules\Analytics\Services\RoleDashboards;
use Modules\Analytics\Services\SalesInsights;
use Modules\Analytics\Services\ScheduledDelivery;
use Modules\Analytics\Services\StandardReports;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;

/**
 * Read-only reporting across the whole platform.
 *
 * Analytics is the one module allowed to read other modules' models. Everything
 * else answers questions about itself; this answers questions about the
 * business, and forcing it through per-module APIs would mean N round trips to
 * render one dashboard.
 *
 * Every figure is derived on read. Nothing is cached or denormalised yet — at
 * Phase-1 volumes a few aggregate queries are far cheaper than a summary table
 * that can silently drift from the orders it claims to summarise.
 */
final class AnalyticsController extends Controller
{
    private const MAX_DAYS = 90;

    /** Module discovery — GET /api/v1/analytics/. */
    public function index(): JsonResponse
    {
        return response()->json([
            'module' => 'Analytics',
            'alias' => 'analytics',
            'labels' => config('analytics.labels'),
            'description' => 'Sotuv analitikasi, food-cost, ABC tahlil, filiallar taqqoslash va rahbar dashboardi.',
            'enabled' => (bool) config('analytics.enabled', true),
            'endpoints' => [
                'dashboard' => url('/api/v1/analytics/dashboard'),
                'sales' => url('/api/v1/analytics/sales'),
                'abc' => url('/api/v1/analytics/abc'),
                'food_cost' => url('/api/v1/analytics/food-cost'),
                'channels' => url('/api/v1/analytics/channels'),
                'summary' => url('/api/v1/analytics/summary'),
                'branches' => url('/api/v1/analytics/branches'),
                'menu_engineering' => url('/api/v1/analytics/menu-engineering'),
                'control' => url('/api/v1/analytics/control'),
                'reports' => url('/api/v1/analytics/reports/waiters'),
                'export' => url('/api/v1/reports/export'),
                'home' => url('/api/v1/dashboard'),
            ],
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | The screens (P-analytics)
    |--------------------------------------------------------------------------
    | Everything below is served from `Modules\Analytics\Services`, cached for
    | sixty seconds, and windowed by `business_date`.
    |
    | **Why sixty and not five minutes.** These are aggregate scans over a
    | month of order lines and the console re-renders them on every navigation,
    | so uncached they are the slowest thing in the application. But a manager
    | watching a Friday build wants the figure to move — a five-minute cache
    | makes a live dashboard feel broken, and somebody starts reloading it,
    | which costs more than the cache saved. A minute is the longest a person
    | does not notice.
    |
    | **Why the key carries the tenant AND the branch.** A cache key without a
    | tenant serves one restaurant's revenue to the next request that asked the
    | same question — the single worst bug available here. The branch is on it
    | because "all venues" and "Chilonzor" are different answers to one
    | question, and `X-Branch` is what tells them apart.
    */

    /**
     * The analytics screen and the KPI row above it, in one call.
     *
     * One endpoint rather than six, because a screen that made six requests to
     * draw one page would show its six panels arriving separately — and because
     * every figure on it is derived from the same two scans. See
     * SalesInsights::summary().
     */
    public function summary(Request $request, SalesInsights $sales): JsonResponse
    {
        $window = ReportWindow::of($request->query('period'));

        return response()->json([
            'data' => $this->remember('summary', $window, fn (): array => $sales->summary($window)),
        ]);
    }

    /**
     * One calendar month's profit and loss.
     *
     * The only report in this module that does not take `?period=`, and the
     * exception is the point: `ReportWindow`'s `month` is the trailing thirty
     * trading days, which is right for a dashboard and wrong for a document with
     * a month's name at the top of it. See `ProfitAndLoss`.
     *
     * Not cached through `remember()` either. The others are windows a dashboard
     * re-asks for every sixty seconds; this is a statement somebody prints once,
     * and a minute-old copy of a month that closed three weeks ago buys nothing
     * while making "I just corrected an expense and it has not changed" a
     * support call.
     */
    public function profitLoss(Request $request, ProfitAndLoss $statement): JsonResponse
    {
        $month = $request->string('month')->toString();

        if (preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month) !== 1) {
            // The month before this one, because a statement is almost always
            // read about a month that has finished. Defaulting to the running
            // month would answer a half-empty sheet to a request that forgot a
            // parameter.
            $month = Carbon::now()->subMonthNoOverflow()->format('Y-m');
        }

        return response()->json([
            'data' => $statement->forMonth(
                $month,
                $request->has('branch') ? $request->integer('branch') : app(BranchContext::class)->id(),
            ),
        ]);
    }

    /**
     * Stars, plowhorses, puzzles and dogs — the four groups by two medians.
     */
    public function menuEngineering(Request $request, SalesInsights $sales): JsonResponse
    {
        $window = ReportWindow::of($request->query('period', 'month'));

        return response()->json([
            'data' => $this->remember('menu-engineering', $window, fn (): array => $sales->menuEngineering($window)),
            // Dishes that sold nothing at all. Not a quadrant — a question, and
            // burying them among the `dogs` is how a menu keeps a line nobody
            // has ordered since spring.
            'never_sold' => $sales->neverSold($window),
        ]);
    }

    /**
     * Every venue side by side — GET /api/v1/analytics/branches?period=
     *
     * The console's Branches screen draws nine columns and, until this landed,
     * six of them had no per-branch source at all and were rendered as dashes.
     * `branches-data.ts` listed what each one needed; every item on that list
     * is a column of `analytics.daily_facts`, which is what the projection was
     * built for. See `BranchPerformance` — including its definition of
     * `open_alerts`, which nothing on the platform had.
     *
     * `?period=` is validated rather than clamped, unlike the screens above it.
     * `ReportWindow::of()` falls back to `today` for an unrecognised value and
     * gives its reason — a stale bookmark should draw a screen, not a 422. That
     * reasoning does not carry here: a client asking for `?period=quarter` and
     * silently receiving ONE DAY of five venues would compare them against a
     * month's target and report every one of them as failing.
     */
    public function branches(Request $request, BranchPerformance $report): JsonResponse
    {
        $validated = $request->validate([
            'period' => ['nullable', 'string', 'in:'.implode(',', ReportWindow::PERIODS)],
        ]);

        $window = ReportWindow::of($validated['period'] ?? null);

        return response()->json([
            'data' => $this->remember('branches', $window, fn (): array => $report->forWindow($window)),
        ]);
    }

    /**
     * Loss prevention: voids, discounts, stale open bills, and who they belong to.
     *
     * Deliberately NOT cached. Everything else on this controller is a figure
     * somebody watches; this is a figure somebody acts on, and a manager who
     * voids a bill and then opens this screen to check it has to see it. A
     * minute of staleness here reads as "the system did not record it".
     */
    public function control(Request $request, LossControl $control): JsonResponse
    {
        return response()->json([
            'data' => $control->report(ReportWindow::of($request->query('period'))),
        ]);
    }

    /**
     * Six months of money in and out — GET /api/v1/analytics/cashflow?months=
     *
     * The finance screen's chart, in one call. It used to be six calls to
     * `profit-loss` for one sparkline, so the panel was hidden instead of
     * drawn; see {@see CashflowSeries} for why this is CASH and deliberately
     * disagrees with the statement beside it.
     *
     * Not cached. The running month moves with every bill, and a minute-old
     * copy of a chart an owner is watching during service reads as a system
     * that did not record the last hour.
     */
    public function cashflow(Request $request, CashflowSeries $series): JsonResponse
    {
        $validated = $request->validate([
            // Clamped in the service as well; validated here so a client asking
            // for five years hears about it rather than silently receiving two.
            'months' => ['nullable', 'integer', 'min:1', 'max:'.CashflowSeries::MAX_MONTHS],
        ]);

        return response()->json([
            'data' => $series->forMonths((int) ($validated['months'] ?? 6)),
        ]);
    }

    /**
     * The rota against the takings, hour by hour — GET /api/v1/analytics/labour-by-hour
     *
     * `?period=` is validated rather than clamped, like `branches` above and
     * for the same reason: a client asking for `?period=quarter` and silently
     * receiving ONE DAY would compare a Tuesday's staffing against a month's
     * pattern and cut the wrong shift.
     */
    public function labourByHour(Request $request, LabourCurve $curve): JsonResponse
    {
        $validated = $request->validate([
            'period' => ['nullable', 'string', 'in:'.implode(',', ReportWindow::PERIODS)],
        ]);

        $window = ReportWindow::of($validated['period'] ?? 'week');

        return response()->json([
            'data' => $this->remember('labour-by-hour', $window, fn (): array => $curve->forWindow($window)),
        ]);
    }

    /**
     * One of the five standard reports.
     *
     * An unknown kind answers `available: false` with a reason rather than 404.
     * The reports screen draws eleven cards and five of them open; a card whose
     * viewer 404s looks broken, while one that says why it is not connected is
     * information.
     */
    public function report(Request $request, string $kind, StandardReports $reports): JsonResponse
    {
        $window = ReportWindow::of($request->query('period'));

        return response()->json([
            'data' => $this->remember("report:{$kind}", $window, fn (): array => $reports->build($kind, $window)),
        ]);
    }

    /**
     * The same report, as a file — downloaded, mailed or sent to a chat.
     *
     * Built from the same `{columns, rows, totals}` the screen renders, which is
     * the point: an exporter with its own query is an exporter that disagrees
     * with the screen, and the disagreement is always found by the person who
     * trusted the file.
     *
     * ---------------------------------------------------------------------
     * Two formats, and the one that is not here
     *
     * `csv` is this platform's own column names; `1c` is the same table with
     * 1C's ({@see OneCReport}). Both are semicolon CSV with a byte-order mark —
     * see {@see CsvReport} for the three things that make a CSV wrong in this
     * market. XLSX is absent because it would mean a new Composer dependency
     * and Excel opens this file as a spreadsheet anyway.
     *
     * **PDF never reaches here**, and that is a decision rather than a gap. A
     * server-side PDF means a headless browser or a layout library in the API
     * container; the console already has a printable-document surface
     * (`/documents`), and a report rendered there prints — or "saves as PDF" —
     * from the reader's own browser, in the reader's own paper size. The
     * request is refused rather than silently answered with a CSV named `.pdf`.
     *
     * ---------------------------------------------------------------------
     * Where it goes
     *
     * `download` streams the bytes back, which is every export until somebody
     * chooses otherwise. `email` and `telegram` go through the SAME
     * {@see ScheduledDelivery} a scheduled report uses, so a file a manager
     * sends themselves now and the one that arrives on Monday cannot differ.
     *
     * Neither destination needs a recipient typed in. Mail defaults to the
     * address of whoever is asking — the export dialog has no address field,
     * and the honest reading of "send it to me" is their own inbox — and
     * Telegram defaults to the chat the restaurant already gets its shift
     * reports in, resolved through `ChatNotifier::defaultChat()` because the
     * chat ids belong to another module.
     *
     * A send that reached nobody answers `report.not_delivered` rather than 200
     * with `delivered: 0`. "It was sent" is a claim somebody checks a week
     * later, and a green toast over a mail server that refused the message is
     * the version of this feature that costs somebody their month end.
     */
    public function export(
        Request $request,
        StandardReports $reports,
        ScheduledDelivery $delivery,
        ChatNotifier $chats,
        TenantContext $tenants,
    ): Response|JsonResponse {
        $validated = $request->validate([
            'kind' => ['required', 'string', 'in:'.implode(',', StandardReports::KINDS)],
            'period' => ['nullable', 'string', 'in:'.implode(',', ReportWindow::PERIODS)],
            'format' => ['nullable', 'string', 'in:csv,1c'],
            'deliver' => ['nullable', 'string', 'in:download,email,telegram'],
            // One field for two kinds of address, because the destination
            // already says which it is: an e-mail address or a Telegram chat
            // id. Shape-checked per channel below, where the channel is known.
            'to' => ['nullable', 'string', 'max:160'],
        ]);

        $window = ReportWindow::of($validated['period'] ?? null);
        $kind = $validated['kind'];
        $format = $validated['format'] ?? 'csv';
        $report = $reports->build($kind, $window);

        $csv = $format === '1c' ? OneCReport::from($report) : CsvReport::from($report);
        $name = $format === '1c'
            ? OneCReport::filename($kind, $window->from, $window->to)
            : CsvReport::filename($kind, $window->from, $window->to);

        $channel = $validated['deliver'] ?? 'download';

        if ($channel === 'download') {
            return response($csv, 200, [
                'Content-Type' => 'text/csv; charset=UTF-8',
                'Content-Disposition' => 'attachment; filename="'.$name.'"',
            ]);
        }

        /** @var list<array<string, mixed>> $rows */
        $rows = $report['rows'] ?? [];
        $target = $this->destinationOrFail($request, $channel, $validated['to'] ?? null, $chats, $tenants);

        $delivered = $delivery->sendFile(
            (int) ($tenants->tenant()?->getKey() ?? 0),
            $channel,
            $target,
            ScheduledDelivery::line($kind, $window, count($rows)),
            $name,
            $csv,
        );

        if (! $delivered) {
            throw ApiException::of('report.not_delivered', meta: ['to' => $target]);
        }

        return response()->json(['data' => [
            'delivered' => 1,
            'attempted' => 1,
            'rows' => count($rows),
            'to' => $target,
        ]]);
    }

    /**
     * Who receives this file — the address that was named, or the obvious one.
     *
     * The two channels fail differently and so the refusals differ. A mail
     * export can always fall back on the reader's own address, so the only way
     * it has nowhere to go is an account with no e-mail on it. Telegram cannot:
     * a chat id is not derivable from a person, so a restaurant that has never
     * pointed a chat at the platform is told to set one up rather than being
     * handed a green toast about a file that went nowhere.
     */
    private function destinationOrFail(
        Request $request,
        string $channel,
        ?string $asked,
        ChatNotifier $chats,
        TenantContext $tenants,
    ): string {
        $named = $asked === null ? '' : trim($asked);

        if ($channel === 'telegram') {
            $chat = $named !== ''
                ? $named
                : ($chats->defaultChat((int) ($tenants->tenant()?->getKey() ?? 0)) ?? '');

            // A group id is negative and long, a person's is positive — the same
            // shape the settings screen checks before it saves one. Checked here
            // as well because this one may have come from a request.
            if (preg_match('/^-?\d{6,20}$/', $chat) !== 1) {
                throw ApiException::of('report.no_destination', field: 'to');
            }

            return $chat;
        }

        $user = $request->user();

        // The reader's own address, and only when the caller really is a
        // platform user: `Request::user()` is typed to the guard rather than to
        // this application's model, and an e-mail column is not on the
        // interface. A device token authenticating a till has none at all.
        $address = $named !== ''
            ? $named
            : (string) ($user instanceof User ? ($user->email ?? '') : '');

        if (filter_var($address, FILTER_VALIDATE_EMAIL) === false) {
            throw ApiException::of('report.no_destination', field: 'to');
        }

        return $address;
    }

    /**
     * The home screen, assembled for whichever role is asking.
     *
     * `?role=` picks the SHAPE. It is not authorisation — that is
     * `analytics.view` on the route plus the tenant and branch scopes — and a
     * cashier passing `role=owner` gets the owner's layout over their own
     * venue's data. See RoleDashboards.
     */
    public function home(Request $request, RoleDashboards $dashboards): JsonResponse
    {
        $window = ReportWindow::of($request->query('period'));
        $role = (string) $request->query('role', 'manager');

        return response()->json([
            'data' => $this->remember(
                "dashboard:{$role}",
                $window,
                fn (): array => $dashboards->build($role, $window),
            ),
        ]);
    }

    /**
     * Sixty seconds, keyed by restaurant, venue, period and trading day.
     *
     * @param \Closure(): array<string, mixed> $compute
     *
     * @return array<string, mixed>
     */
    /**
     * What is true right now — GET /api/v1/dashboard/pulse.
     *
     * The console's status strip sits over every screen and says four things:
     * whether a till is open and since when, how many tables are taken, how
     * many dockets the kitchen is holding and for how long, and how many
     * lines are below their minimum. For a week it said all four from the
     * catalogue — "32 of 32 tables, 7 dockets, 11 minutes" — to every
     * restaurant, including one that had not opened a till in its life.
     *
     * Four counts through four contracts, none of them a list, cached for
     * fifteen seconds per venue: this is read by every page a person opens,
     * and a strip that cost a floor query per click would be a strip nobody
     * could afford. Fifteen seconds is the poll interval the boards use when
     * the socket is down, so the strip is never staler than the screen under
     * it.
     */
    public function pulse(DayBook $dayBook, FloorBoard $floor, KitchenLoad $kitchen, StockReport $stock, CaseDesk $cases): JsonResponse
    {
        $branchId = app(BranchContext::class)->id();
        $key = sprintf('pulse:%s:%s', app(TenantContext::class)->tenant()?->getKey() ?? 0, $branchId ?? 'all');

        $cached = Cache::get($key);

        if (is_array($cached)) {
            return response()->json(['data' => $cached]);
        }

        $tally = $floor->tally($branchId);
        $pressure = $kitchen->pressure($branchId);
        $shelf = $stock->snapshot();

        $pulse = [
            'shift_open_since' => $dayBook->openSince($branchId)?->format(DATE_ATOM),
            'floor' => ['occupied' => $tally->occupied, 'free' => $tally->free],
            'kitchen' => ['open' => $pressure->open, 'oldest_minutes' => $pressure->oldestMinutes],
            'stock' => ['low' => $shelf->low, 'out' => $shelf->out],
            // The sidebar's two remaining counts: bills still open (Orders is
            // a read this module is allowed) and complaints still somebody's.
            'orders_open' => $this->openBills($branchId),
            'cases_open' => $cases->openCount($branchId),
        ];

        Cache::put($key, $pulse, 15);

        return response()->json(['data' => $pulse]);
    }

    /** Bills not yet settled — the same definition `RoleDashboards::openOrders()` uses. */
    private function openBills(?int $branchId): int
    {
        return Order::query()
            ->whereNotIn('status', ['paid', 'voided', 'refunded', 'comped'])
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->count();
    }

    /**
     * @param \Closure(): array<string, mixed> $compute
     *
     * @return array<string, mixed>
     */
    private function remember(string $report, ReportWindow $window, \Closure $compute): array
    {
        return Cache::remember(
            $window->cacheKey($report, app(TenantContext::class)->tenant()?->getKey(), app(BranchContext::class)->id()),
            60,
            $compute,
        );
    }

    /**
     * The numbers a manager opens first: today, at a glance.
     */
    public function dashboard(): JsonResponse
    {
        $paidToday = Order::query()->today()->where('status', 'paid');

        $revenue = (int) (clone $paidToday)->sum('total');
        $orders = (clone $paidToday)->count();
        $guests = (int) (clone $paidToday)->sum('guests_count');

        return response()->json([
            'date' => now()->toDateString(),
            'currency' => 'UZS',
            'revenue_tiyin' => $revenue,
            'orders_count' => $orders,
            'guests_count' => $guests,
            // Average cheque is per *bill*, not per guest — that is the number
            // restaurants actually steer on.
            'average_cheque_tiyin' => $orders > 0 ? (int) round($revenue / $orders) : 0,
            'open_orders' => Order::query()->open()->count(),
            'takings_tiyin' => (int) Payment::query()->captured()->today()->sum('amount'),
            'expenses_tiyin' => (int) Expense::query()->today()->sum('amount'),
        ]);
    }

    /**
     * Daily revenue series — GET /analytics/sales?days=7
     *
     * Days with no trading are returned as explicit zeros rather than omitted,
     * so a chart never silently closes a gap that was actually a closed day.
     */
    public function sales(Request $request): JsonResponse
    {
        $days = min(max($request->integer('days', 7), 1), self::MAX_DAYS);
        $from = now()->subDays($days - 1)->startOfDay();

        $rows = Order::query()
            ->where('status', 'paid')
            ->where('created_at', '>=', $from)
            ->get(['created_at', 'total'])
            ->groupBy(fn (Order $order): string => $order->created_at->toDateString())
            ->map(fn ($group): array => [
                'revenue_tiyin' => (int) $group->sum('total'),
                'orders_count' => $group->count(),
            ]);

        $series = [];
        for ($i = 0; $i < $days; $i++) {
            $date = $from->copy()->addDays($i)->toDateString();
            $series[] = [
                'date' => $date,
                'revenue_tiyin' => $rows[$date]['revenue_tiyin'] ?? 0,
                'orders_count' => $rows[$date]['orders_count'] ?? 0,
            ];
        }

        return response()->json([
            'days' => $days,
            'total_revenue_tiyin' => array_sum(array_column($series, 'revenue_tiyin')),
            'data' => $series,
        ]);
    }

    /**
     * ABC analysis — which dishes actually earn the money.
     *
     * A: the top 80% of revenue, B: the next 15%, C: the last 5%. C items are
     * the candidates to cut from the menu; every one of them still occupies
     * fridge space and a line on the printed card.
     */
    public function abc(Request $request): JsonResponse
    {
        $days = min(max($request->integer('days', 30), 1), self::MAX_DAYS);

        $rows = OrderItem::query()
            ->where('created_at', '>=', now()->subDays($days)->startOfDay())
            ->get(['sku', 'title', 'quantity', 'total_price'])
            ->groupBy('sku')
            ->map(fn ($group, $sku): array => [
                'sku' => (string) $sku,
                'title' => $group->first()->title,
                'quantity' => (int) $group->sum('quantity'),
                'revenue_tiyin' => (int) $group->sum('total_price'),
            ])
            ->sortByDesc('revenue_tiyin')
            ->values();

        $total = (int) $rows->sum('revenue_tiyin');
        $running = 0;

        $data = $rows->map(function (array $row) use ($total, &$running): array {
            $running += $row['revenue_tiyin'];
            $cumulative = $total > 0 ? $running / $total : 0.0;

            return $row + [
                'share_percent' => $total > 0 ? round($row['revenue_tiyin'] / $total * 100, 2) : 0.0,
                'cumulative_percent' => round($cumulative * 100, 2),
                'class' => $cumulative <= 0.8 ? 'A' : ($cumulative <= 0.95 ? 'B' : 'C'),
            ];
        });

        return response()->json([
            'days' => $days,
            'total_revenue_tiyin' => $total,
            'data' => $data,
        ]);
    }

    /**
     * Food cost per dish, from the menu's costed price.
     *
     * Dishes with no recipe cost yet are reported with a null margin rather
     * than a fake 100% — an unknown must not read as a triumph.
     */
    public function foodCost(): JsonResponse
    {
        $items = MenuItem::query()->active()->get();

        $data = $items->map(fn (MenuItem $item): array => [
            'sku' => $item->sku,
            'title' => $item->title,
            'price_tiyin' => $item->price,
            'cost_tiyin' => $item->cost_price,
            'margin_percent' => $item->margin_percent,
            'food_cost_percent' => $item->cost_price !== null && $item->price > 0
                ? round($item->cost_price / $item->price * 100, 1)
                : null,
        ])->sortBy('food_cost_percent')->values();

        $costed = $items->filter(fn (MenuItem $i): bool => $i->cost_price !== null && $i->price > 0);

        return response()->json([
            'items_total' => $items->count(),
            'items_costed' => $costed->count(),
            'average_food_cost_percent' => $costed->isNotEmpty()
                ? round($costed->avg(fn (MenuItem $i): float => $i->cost_price / $i->price * 100), 1)
                : null,
            'data' => $data,
        ]);
    }

    /** Revenue split by sales channel — where the money actually comes from. */
    public function channels(Request $request): JsonResponse
    {
        $days = min(max($request->integer('days', 30), 1), self::MAX_DAYS);

        $rows = Order::query()
            ->where('status', 'paid')
            ->where('created_at', '>=', now()->subDays($days)->startOfDay())
            ->get(['channel', 'total'])
            ->groupBy('channel')
            ->map(fn ($group, $channel): array => [
                'channel' => (string) $channel,
                'orders_count' => $group->count(),
                'revenue_tiyin' => (int) $group->sum('total'),
                'average_cheque_tiyin' => (int) round($group->avg('total')),
            ])
            ->sortByDesc('revenue_tiyin')
            ->values();

        return response()->json([
            'days' => $days,
            'total_revenue_tiyin' => (int) $rows->sum('revenue_tiyin'),
            'data' => $rows,
        ]);
    }

    /**
     * Peak hours — when the restaurant is actually busy.
     *
     * Drives both staffing and the prep list: a kitchen sized for the average
     * hour is understaffed at 13:00 and idle at 16:00.
     */
    public function peakHours(Request $request): JsonResponse
    {
        $days = min(max($request->integer('days', 7), 1), self::MAX_DAYS);
        $timezone = (string) config('app.timezone', 'UTC');

        $rows = Order::query()
            ->where('status', 'paid')
            ->where('created_at', '>=', now()->subDays($days)->startOfDay())
            ->get(['created_at', 'total'])
            ->groupBy(fn (Order $order): int => Carbon::parse($order->created_at)->setTimezone($timezone)->hour);

        $data = [];
        for ($hour = 0; $hour < 24; $hour++) {
            $group = $rows[$hour] ?? null;
            $data[] = [
                'hour' => $hour,
                'orders_count' => $group?->count() ?? 0,
                'revenue_tiyin' => (int) ($group?->sum('total') ?? 0),
            ];
        }

        return response()->json(['days' => $days, 'data' => $data]);
    }
}
