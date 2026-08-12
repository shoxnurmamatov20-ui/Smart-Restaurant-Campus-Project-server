<?php

declare(strict_types=1);

namespace Modules\Analytics\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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
            ],
        ]);
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
