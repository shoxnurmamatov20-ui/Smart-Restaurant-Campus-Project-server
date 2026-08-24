<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Tenancy\BusinessDay;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Orders\Models\Order;

/**
 * What each waiter sold, in one query.
 *
 * The staff roster has drawn `sales: 0, tickets: 0` since it was built, and
 * `staff-server.ts` explained why: *"summing a month of them in the browser to
 * fill two columns is not a query, it is a report."* It is also not something
 * Staff can ask for — that module may not import Orders — so the aggregate
 * lives here, keyed by `waiter_user_id`, and the CONSOLE joins the two lists.
 *
 * ---------------------------------------------------------------------------
 * Why the join happens in the browser
 *
 * The alternative is for one of the two modules to reach into the other's
 * tables, which `ModuleBoundaryTest` refuses by name — and the refusal is
 * right: a roster row and a night's takings are different facts with different
 * permissions, and the only place they legitimately meet is a screen whose
 * reader is allowed to see both. Two parallel requests cost one round trip and
 * keep the boundary; a join in SQL would cost an allowed edge forever.
 *
 * ---------------------------------------------------------------------------
 * Keyed by user, not by staff member
 *
 * `orders.orders.waiter_user_id` is a platform user id, because a bill is
 * opened by whoever signed in at the till. `staff.staff_members` has its own
 * primary key and carries the user id beside it. The client joins on the user
 * id, which is the only value both sides actually hold.
 */
final class WaiterStatsController extends Controller
{
    /** Windows this endpoint answers, matching the console's period toggle. */
    private const PERIODS = ['today', 'week', 'month'];

    public function byWaiter(Request $request, BusinessDay $businessDay): JsonResponse
    {
        $period = (string) $request->query('period', 'today');
        $period = in_array($period, self::PERIODS, true) ? $period : 'today';

        $days = match ($period) {
            'week' => 7,
            'month' => 30,
            default => 1,
        };

        /*
         * `business_date`, ranged — never `whereDate`.
         *
         * The column exists so this can use an index, and a restaurant's day
         * runs 06:00 → 06:00: a bill rung up at 01:30 belongs to the evening
         * that is still finishing, and grouping by the calendar would move it
         * onto the next waiter's shift. Inclusive of today, hence `days - 1`.
         */
        $today = CarbonImmutable::parse($businessDay->dateFor());
        $from = $today->subDays($days - 1)->toDateString();

        $rows = Order::query()
            ->where('status', 'paid')
            ->whereNotNull('waiter_user_id')
            ->whereBetween('business_date', [$from, $today->toDateString()])
            ->groupBy('waiter_user_id')
            ->selectRaw('waiter_user_id')
            ->selectRaw('count(*)::bigint as tickets')
            ->selectRaw('coalesce(sum(guests_count), 0)::bigint as covers')
            ->selectRaw('coalesce(sum(total), 0)::bigint as revenue')
            ->orderByRaw('revenue desc')
            // An aggregate hydrated as a model is a row whose every column is
            // an undefined property — the same note SalesInsights::totals()
            // carries, for the same reason.
            ->toBase()
            ->get()
            ->map(static function (object $row): array {
                $tickets = (int) $row->tickets;
                $revenue = (int) $row->revenue;

                return [
                    'waiter_user_id' => (int) $row->waiter_user_id,
                    'tickets' => $tickets,
                    'covers' => (int) $row->covers,
                    'revenue_tiyin' => $revenue,
                    /*
                     * Derived here rather than in the client, because two
                     * clients dividing the same pair will eventually round it
                     * two ways — and this is a figure a waiter is measured on.
                     * Per BILL, which is what "average cheque" means in this
                     * industry; a per-head number moves when party sizes do.
                     */
                    'average_tiyin' => $tickets > 0 ? (int) round($revenue / $tickets) : 0,
                ];
            })
            ->all();

        return response()->json([
            'data' => $rows,
            'meta' => ['period' => $period, 'from' => $from, 'to' => $today->toDateString()],
        ]);
    }
}
