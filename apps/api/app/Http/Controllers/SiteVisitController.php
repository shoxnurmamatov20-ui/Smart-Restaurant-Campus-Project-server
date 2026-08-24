<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\SiteVisit;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * How the restaurant's website did — the console's Site → Traffic tab.
 *
 * What it can answer and what it deliberately cannot are both worth stating,
 * because the tab used to draw all of it from a fixture.
 *
 * **It answers**: visits per day, the total over the window, the same total
 * over the window before it (so "+18%" is a comparison rather than a
 * decoration), and which pages were looked at.
 *
 * **It does not answer** conversion or referrer, and no amount of reading this
 * table would produce either. A conversion rate needs the visit and the order
 * to be the same identified journey, which means a session id on the visit —
 * the one thing `site_visits` deliberately does not hold, so that a marketing
 * figure does not need a cookie banner to exist. A referrer breakdown is the
 * same trade in a smaller way. Both are a product decision to revisit, not a
 * query somebody forgot to write, and the tab says so rather than inventing
 * 6.1%.
 *
 * `settings.view`, the same permission the same screen already needs to read
 * `settings/site`. A restaurant's traffic is not more sensitive than the copy
 * on its own front page, and asking for a second permission would leave the
 * tab dark for the people the screen is built for.
 */
final class SiteVisitController extends Controller
{
    /** How many days each period name covers. */
    private const PERIODS = ['week' => 7, 'month' => 30, 'quarter' => 90];

    public function __invoke(Request $request, TenantContext $context): JsonResponse
    {
        $days = self::PERIODS[(string) $request->query('period', 'week')] ?? self::PERIODS['week'];

        /*
         * Inclusive of today, so a window of seven days is today and the six
         * before it. Off by one here is a week that quietly omits the day
         * somebody is looking at the screen on, which is the day they care
         * about most.
         */
        $today = Carbon::today();
        $from = $today->copy()->subDays($days - 1);
        $previousFrom = $from->copy()->subDays($days);

        $rows = SiteVisit::query()
            ->whereBetween('day', [$previousFrom->toDateString(), $today->toDateString()])
            ->get(['day', 'path', 'visits']);

        $current = $rows->filter(fn (SiteVisit $row): bool => $row->day->greaterThanOrEqualTo($from));
        $previous = $rows->reject(fn (SiteVisit $row): bool => $row->day->greaterThanOrEqualTo($from));

        /*
         * A row per day of the window, including the days with no visits.
         *
         * A series that simply omitted quiet days would draw a chart whose
         * x-axis lies: two visits on Monday and two on Saturday would look like
         * two consecutive days. The zeroes are the shape of the week.
         */
        $byDay = $current->groupBy(static fn (SiteVisit $row): string => $row->day->toDateString());
        $series = [];

        for ($offset = 0; $offset < $days; $offset++) {
            $date = $from->copy()->addDays($offset)->toDateString();

            $series[] = [
                'day' => $date,
                'visits' => (int) ($byDay->get($date)?->sum('visits') ?? 0),
            ];
        }

        $pages = $current
            ->groupBy('path')
            ->map(static fn ($group, string $path): array => [
                'path' => $path,
                'visits' => (int) $group->sum('visits'),
            ])
            ->sortByDesc('visits')
            ->values()
            // Ten, because the panel is a ranking rather than a sitemap.
            ->take(10)
            ->all();

        return response()->json([
            'data' => [
                'series' => $series,
                'pages' => $pages,
            ],
            'meta' => [
                'period' => $days,
                'from' => $from->toDateString(),
                'to' => $today->toDateString(),
                'visits' => (int) $current->sum('visits'),
                // The same window, one window earlier. The console draws the
                // difference; computing it here would be a percentage nobody
                // could check against the two figures it came from.
                'previous_visits' => (int) $previous->sum('visits'),
                'tenant_id' => $context->id(),
            ],
        ]);
    }
}
