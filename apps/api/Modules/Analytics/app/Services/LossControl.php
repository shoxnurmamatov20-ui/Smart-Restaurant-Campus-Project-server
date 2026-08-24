<?php

declare(strict_types=1);

namespace Modules\Analytics\Services;

use App\Models\Activity;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Support\Facades\DB;
use Modules\Finance\Models\CashShift;

/**
 * Loss prevention: who voided, who discounted, and whose bills stay open.
 *
 * ---------------------------------------------------------------------------
 * A screen that names people has to be careful about what it implies
 *
 * Every row this produces is built from things a waiter does many times a day
 * and is supposed to do: a guest changes their mind, a regular gets 10% off, a
 * table sits open while they finish their tea. None of it is evidence of
 * anything on its own.
 *
 * What makes it useful is the comparison across one shift, and that is why the
 * risk figure is deliberately a RANKING rather than a score. It says who to
 * look at first. It is computed from the same three counts everybody can see on
 * the row beside it, so a manager can check the arithmetic — a number nobody
 * can reconstruct is a number that gets believed.
 *
 * ---------------------------------------------------------------------------
 * Attribution is by the bill's own waiter, not by the audit log's causer
 *
 * The audit log knows exactly who pressed what, and it is the wrong source
 * here: a void authorised by a manager is logged against the manager, so a
 * ranking built from it would put every manager at the top for doing their job
 * and hide the waiter whose bills need authorising twice a night.
 *
 * The bill's waiter is who the discount was given ON BEHALF of, which is the
 * question this screen asks. The audit log still appears — as the event feed
 * below, where "who pressed it" is exactly what a manager wants to read.
 */
final class LossControl
{
    /**
     * The whole screen in one call.
     *
     * @return array<string, mixed>
     */
    public function report(ReportWindow $window): array
    {
        $staff = $this->byStaff($window);

        return [
            'window' => $window->toArray(),
            'summary' => $this->summary($window),
            'staff' => $staff,
            'events' => $this->events($window),
        ];
    }

    /**
     * The period's totals, above the tables.
     *
     * @return array<string, int>
     */
    private function summary(ReportWindow $window): array
    {
        $branchId = app(BranchContext::class)->id();

        /** @var object|null $bills */
        $bills = DB::table('orders.orders as o')
            ->whereBetween('o.business_date', [$window->from, $window->to])
            ->whereNull('o.deleted_at')
            ->when($branchId !== null, fn ($query) => $query->where('o.branch_id', $branchId))
            ->selectRaw("count(*) filter (where o.status = 'voided')::bigint as voided")
            /*
             * What the voided bills were worth, and what was actually sold.
             *
             * The console prints a money figure beside the void COUNT, and it
             * used to be a catalogue constant — 840 000 so'm on every
             * restaurant's loss-prevention screen, whatever its own voids came
             * to. On a screen where the money attached to a count is the whole
             * point, that is how a manager is led to accuse the wrong person.
             * `paid_revenue` is the denominator for the discount share the same
             * strip draws.
             */
            ->selectRaw("coalesce(sum(o.total) filter (where o.status = 'voided'), 0)::bigint as voided_value")
            ->selectRaw("coalesce(sum(o.total) filter (where o.status = 'paid'), 0)::bigint as paid_revenue")
            ->selectRaw("count(*) filter (where o.status = 'comped')::bigint as comped")
            ->selectRaw("count(*) filter (where o.status = 'refunded')::bigint as refunded")
            ->selectRaw('coalesce(sum(o.discount_total), 0)::bigint as discounts')
            /*
             * An open bill from a day that has already closed.
             *
             * The most useful single number on this screen and the one a
             * fixture cannot invent: a table that was served, never paid, and
             * never voided is either an honest mistake or the simplest way there
             * is to walk out with a meal. Counted against the window's LAST
             * trading date, so tonight's live tables are not accused of it.
             */
            ->selectRaw(
                "count(*) filter (where o.status not in ('paid','voided','refunded','comped')".
                ' and o.business_date < ?)::bigint as stale_open',
                [$window->to],
            )
            ->first();

        $lines = DB::table('orders.order_items as i')
            ->join('orders.orders as o', 'o.id', '=', 'i.order_id')
            ->whereBetween('o.business_date', [$window->from, $window->to])
            ->whereNull('i.deleted_at')
            ->whereNull('o.deleted_at')
            ->when($branchId !== null, fn ($query) => $query->where('o.branch_id', $branchId))
            ->where('i.status', 'cancelled')
            ->selectRaw('count(*)::bigint as cancelled')
            ->selectRaw('coalesce(sum(i.total_price), 0)::bigint as cancelled_value')
            ->first();

        /*
         * The drawer's own disagreement, from Finance.
         *
         * Belongs on this screen and nowhere else: a till that closes short is
         * the one loss figure that is measured rather than inferred, and it is
         * the number a manager reads the rest of this page against. Summed as
         * an absolute value — a surplus is as much a red flag as a shortfall,
         * because the usual cause of one is a sale that was never rung up.
         *
         * Windowed on `closed_at` rather than on `business_date`, because
         * `cash_shifts` has no such column and adding one to another module's
         * table to serve one figure here would be the wrong direction of change.
         * A range on the raw timestamp is what `BusinessDay` is for: it turns
         * two trading dates into the exact instants they start and end at in the
         * venue's own timezone, so a till counted at 01:40 lands on the evening
         * it belongs to rather than on the next morning.
         */
        $day = app(BusinessDay::class);
        $opens = $day->windowFor($window->from)[0];
        $shuts = $day->windowFor($window->to)[1];

        $closedShifts = CashShift::query()
            ->where('status', 'closed')
            ->where('closed_at', '>=', $opens)
            ->where('closed_at', '<', $shuts);

        $variance = (int) (clone $closedShifts)->sum(DB::raw('abs(difference)'));

        /*
         * How many of the window's shifts disagreed with their own drawer.
         *
         * A total on its own cannot be read: 300 000 so'm across thirty clean
         * shifts and one bad one is a different finding from 300 000 spread
         * over all of them. Counted rather than described, because the console
         * caption that states it was a fixed sentence until now.
         */
        $shiftsClosed = (int) (clone $closedShifts)->count();
        $shiftsWithVariance = (int) (clone $closedShifts)->where('difference', '<>', 0)->count();

        return [
            'variance_tiyin' => $variance,
            'shifts_closed' => $shiftsClosed,
            'shifts_with_variance' => $shiftsWithVariance,
            'voided_bills' => (int) ($bills->voided ?? 0),
            'voided_value_tiyin' => (int) ($bills->voided_value ?? 0),
            'paid_revenue_tiyin' => (int) ($bills->paid_revenue ?? 0),
            'comped_bills' => (int) ($bills->comped ?? 0),
            'refunded_bills' => (int) ($bills->refunded ?? 0),
            'cancelled_lines' => (int) ($lines->cancelled ?? 0),
            'cancelled_value_tiyin' => (int) ($lines->cancelled_value ?? 0),
            'discounts_tiyin' => (int) ($bills->discounts ?? 0),
            'stale_open_bills' => (int) ($bills->stale_open ?? 0),
        ];
    }

    /**
     * One row per person who had bills in the window.
     *
     * @return array<int, array<string, mixed>>
     */
    private function byStaff(ReportWindow $window): array
    {
        $branchId = app(BranchContext::class)->id();

        $rows = DB::table('orders.orders as o')
            ->leftJoin('orders.order_items as i', function ($join): void {
                $join->on('i.order_id', '=', 'o.id')->whereNull('i.deleted_at');
            })
            ->whereBetween('o.business_date', [$window->from, $window->to])
            ->whereNull('o.deleted_at')
            ->whereNotNull('o.waiter_user_id')
            ->when($branchId !== null, fn ($query) => $query->where('o.branch_id', $branchId))
            ->groupBy('o.waiter_user_id')
            ->selectRaw('o.waiter_user_id')
            /*
             * `count(distinct o.id)` and not `count(*)`.
             *
             * The join to lines multiplies every bill by the number of lines on
             * it, so a plain count would report a table of six dishes as six
             * bills — and a waiter who sells large tables would top the ranking
             * for it. The same reason `sum(o.discount_total)` cannot be used
             * here at all: it would be added once per line.
             */
            ->selectRaw('count(distinct o.id)::bigint as bills')
            ->selectRaw("count(distinct o.id) filter (where o.status = 'paid')::bigint as paid_bills")
            ->selectRaw("count(distinct o.id) filter (where o.status = 'voided')::bigint as voided")
            ->selectRaw("count(distinct o.id) filter (where o.status = 'comped')::bigint as comped")
            ->selectRaw("count(i.id) filter (where i.status = 'cancelled')::bigint as cancelled_lines")
            ->selectRaw(
                "coalesce(sum(i.total_price) filter (where i.status = 'cancelled'), 0)::bigint as cancelled_value"
            )
            ->get();

        /*
         * Revenue and discounts come from a second query over the bills alone.
         *
         * Summing them alongside a line join would multiply each by the line
         * count. Two queries that each say one true thing beat one query that
         * says two things wrong — this is the exact bug that makes a "total
         * discount" figure on a busy waiter look like fraud.
         */
        $money = DB::table('orders.orders as o')
            ->whereBetween('o.business_date', [$window->from, $window->to])
            ->whereNull('o.deleted_at')
            ->whereNotNull('o.waiter_user_id')
            ->when($branchId !== null, fn ($query) => $query->where('o.branch_id', $branchId))
            ->groupBy('o.waiter_user_id')
            ->selectRaw('o.waiter_user_id')
            ->selectRaw("coalesce(sum(o.total) filter (where o.status = 'paid'), 0)::bigint as revenue")
            ->selectRaw('coalesce(sum(o.discount_total), 0)::bigint as discounts')
            ->get()
            ->keyBy('waiter_user_id');

        $people = User::query()
            ->with('roles')
            ->whereIn('id', $rows->pluck('waiter_user_id')->all())
            ->get()
            ->keyBy('id');

        $staff = $rows->map(function (object $row) use ($money, $people): array {
            $id = (int) $row->waiter_user_id;
            $revenue = (int) ($money[$id]->revenue ?? 0);
            $discounts = (int) ($money[$id]->discounts ?? 0);

            return [
                'user_id' => $id,
                'name' => $people->has($id) ? (string) $people[$id]->name : "#{$id}",
                /*
                 * The server's role name, not the console's.
                 *
                 * A screen that named people has to say what each one does —
                 * five voids means one thing for a waiter and another for the
                 * manager who authorises them. The mapping from `branch-manager`
                 * to whatever the sidebar calls it belongs to the client, which
                 * already owns that table (`lib/roles.ts`).
                 */
                'role' => $people->has($id) ? (string) ($people[$id]->roles->first()->name ?? '') : '',
                'bills' => (int) $row->bills,
                'paid_bills' => (int) $row->paid_bills,
                'revenue_tiyin' => $revenue,
                'voided_bills' => (int) $row->voided + (int) $row->comped,
                'cancelled_lines' => (int) $row->cancelled_lines,
                'cancelled_value_tiyin' => (int) $row->cancelled_value,
                'discounts_tiyin' => $discounts,
                // The figure the design puts in its own column: discount as a
                // share of what this person actually sold. An absolute is
                // meaningless across a busy waiter and a quiet one.
                'discount_share_percent' => $revenue > 0
                    ? round($discounts / $revenue * 100, 1)
                    : null,
            ];
        })->all();

        return $this->ranked($staff);
    }

    /**
     * Turn the counts into a 0–100 ranking, highest first.
     *
     * Relative to the busiest person in the window rather than to an absolute
     * scale, because that is what "look here first" means: on a quiet Tuesday
     * the top of this list still has to be somebody, and on a chaotic Friday
     * three voids is unremarkable. A fixed threshold would call every Friday a
     * crisis and every Tuesday clean.
     *
     * Three inputs, weighted by how hard each is to explain away: a cancelled
     * line is routine, a voided bill less so, and a discount share well above
     * the room's is the one that repays a conversation.
     *
     * @param array<int, array<string, mixed>> $staff
     *
     * @return array<int, array<string, mixed>>
     */
    private function ranked(array $staff): array
    {
        $peak = static function (string $key) use ($staff): float {
            $values = array_map(static fn (array $row): float => (float) ($row[$key] ?? 0), $staff);

            return $values === [] ? 0.0 : max(max($values), 0.0);
        };

        $peaks = [
            'voided_bills' => $peak('voided_bills'),
            'cancelled_lines' => $peak('cancelled_lines'),
            'discount_share_percent' => $peak('discount_share_percent'),
        ];

        foreach ($staff as $index => $row) {
            $share = static function (string $key) use ($row, $peaks): float {
                $ceiling = $peaks[$key];

                return $ceiling > 0 ? (float) ($row[$key] ?? 0) / $ceiling : 0.0;
            };

            $staff[$index]['risk'] = (int) round(
                ($share('voided_bills') * 40)
                + ($share('discount_share_percent') * 40)
                + ($share('cancelled_lines') * 20)
            );
        }

        usort($staff, static fn (array $a, array $b): int => $b['risk'] <=> $a['risk']);

        return $staff;
    }

    /**
     * The feed: what happened, when, and who pressed it.
     *
     * From the audit log, where "who pressed it" is the right question — unlike
     * the ranking above. Read-only and append-only by intent, so this is a
     * report on a table nothing in the application ever rewrites.
     *
     * @return array<int, array<string, mixed>>
     */
    private function events(ReportWindow $window): array
    {
        return Activity::query()
            ->whereIn('log_name', ['orders.order', 'orders.order_item', 'finance.payment', 'finance.cash_shift'])
            /*
             * A range on `created_at`, not `whereDate`, and the audit log has no
             * `business_date` of its own — it is a platform table, not a money
             * table. The window's dates are trading days, so the second bound is
             * pushed to the end of the last one; a bare date would cut the
             * evening off at midnight and drop exactly the events a loss report
             * is about.
             */
            ->where('created_at', '>=', $window->from.' 00:00:00')
            ->where('created_at', '<', date('Y-m-d', strtotime($window->to.' +2 days')).' 00:00:00')
            ->latest('id')
            ->limit(50)
            ->with('causer')
            ->get()
            ->map(fn (Activity $entry): array => [
                'at' => $entry->created_at?->toIso8601String(),
                'log' => $entry->log_name,
                'event' => $entry->description,
                'who' => $entry->causer instanceof User ? $entry->causer->name : null,
                'subject_id' => $entry->subject_id,
                'properties' => $entry->properties,
            ])
            ->all();
    }
}
