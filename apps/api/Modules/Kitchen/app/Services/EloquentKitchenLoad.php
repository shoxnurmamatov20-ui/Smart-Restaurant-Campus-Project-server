<?php

declare(strict_types=1);

namespace Modules\Kitchen\Services;

use App\Contracts\Kitchen\KitchenLoad;
use App\Contracts\Kitchen\KitchenPressure;
use App\Contracts\Kitchen\StationSpeed;
use Illuminate\Support\Carbon;
use Modules\Kitchen\Models\KitchenStation;
use Modules\Kitchen\Models\KitchenTicket;

/**
 * The line, counted.
 *
 * "Open" is what `KitchenTicket::$isOpen` says it is — new, accepted,
 * cooking — so the strip and the KDS board agree about which dockets are
 * still somebody's problem. The wait is measured from when the docket
 * landed, not from when a cook picked it up: a docket nobody has picked up
 * for eleven minutes is the one the figure exists to expose.
 */
final class EloquentKitchenLoad implements KitchenLoad
{
    public function pressure(?int $branchId = null): KitchenPressure
    {
        // The application's clock, not SQL's `now()`: the columns hold naive
        // UTC and the database server answers in its own zone — five hours
        // out on a box in Tashkent. `ModuleBoundaryTest` forbids the raw form.
        $row = KitchenTicket::query()
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->whereIn('status', ['new', 'accepted', 'cooking'])
            ->toBase()
            ->selectRaw('count(*) as open')
            ->selectRaw('min(created_at) as oldest_at')
            ->first();

        $open = (int) ($row->open ?? 0);
        $oldestAt = $row->oldest_at ?? null;

        return new KitchenPressure(
            open: $open,
            oldestMinutes: $open === 0 || $oldestAt === null
                ? null
                : max(0, (int) round((now()->getTimestamp() - strtotime((string) $oldestAt.' UTC')) / 60)),
        );
    }

    /**
     * One row per section: what it is holding, and how fast it is clearing.
     *
     * Driven off `kitchen_stations` rather than off the dockets, and that is
     * the decision worth stating. Grouping the tickets alone would answer with
     * the sections that happen to have cooked something, so a cold section
     * that has done nothing all evening would simply not be on the manager's
     * chart — which is the one case somebody wants to see. Every active
     * section is a row; a section that has finished nothing carries a null
     * average and the client decides what to draw.
     *
     * Two queries rather than one, because the two figures are cut differently
     * and folding them would make one of them wrong:
     *
     *  - **Open** is right now, exactly as `pressure()` counts it. A window
     *    would answer "dockets opened during Tuesday that are still open",
     *    which is a different and much less useful sentence at the pass.
     *  - **Average** is the window, over dockets that actually reached `ready`.
     *    A docket still cooking has no duration yet, and counting it as its
     *    elapsed time so far would report the line as faster than it is.
     */
    public function stations(string $from, string $to, ?int $branchId = null): array
    {
        /*
         * The window as two instants, computed in PHP.
         *
         * `business_date` does not exist on a docket — the KDS is a live board
         * — so the range is the wall clock of the trading dates it was handed,
         * end exclusive. `ModuleBoundaryTest` forbids comparing a timestamp
         * column to SQL's `now()`, and the same reasoning applies to letting
         * the database derive these bounds: it answers in its own zone.
         */
        $opened = Carbon::parse($from)->startOfDay();
        $closed = Carbon::parse($to)->startOfDay()->addDay();

        $open = KitchenTicket::query()
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->whereIn('status', ['new', 'accepted', 'cooking'])
            ->toBase()
            ->groupBy('station')
            ->selectRaw('station')
            ->selectRaw('count(*) as open_now')
            ->pluck('open_now', 'station');

        $speed = KitchenTicket::query()
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->whereNotNull('ready_at')
            ->where('created_at', '>=', $opened)
            ->where('created_at', '<', $closed)
            ->toBase()
            ->groupBy('station')
            ->selectRaw('station')
            ->selectRaw('avg(extract(epoch from (ready_at - created_at)) / 60) as minutes')
            ->pluck('minutes', 'station');

        return KitchenStation::query()
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(function (KitchenStation $station) use ($open, $speed): StationSpeed {
                $minutes = $speed[$station->code] ?? null;

                return new StationSpeed(
                    code: $station->code,
                    openTickets: (int) ($open[$station->code] ?? 0),
                    // Rounded to the minute: the chart is a bar, and a grill
                    // that took 8.4 minutes and one that took 8.5 are the same
                    // decision. Floored at zero because a clock skew between
                    // two writes must not print a negative cooking time.
                    averageMinutes: $minutes === null ? null : max(0, (int) round((float) $minutes)),
                    targetMinutes: $station->sla_minutes,
                );
            })
            ->values()
            ->all();
    }
}
