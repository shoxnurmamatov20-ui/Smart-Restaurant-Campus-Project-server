<?php

declare(strict_types=1);

namespace Modules\Analytics\Services;

use App\Contracts\Staff\Roster;
use App\Support\Tenancy\BranchContext;
use Modules\Finance\Models\Payment;

/**
 * What the hour cost against what the hour took.
 *
 * The branches screen draws a bar per hour with a labour percentage on it, and
 * every figure in it was a fixture — fourteen bars, a total, and a count of
 * "overstaffed hours" — because labour cost was only ever answered for a WINDOW
 * (`GET /analytics/branches`, `GET /dashboard`). Drawn beside real revenue and
 * real staff counts, that chart read as this restaurant's own rota, and its
 * caption tells a manager to cut shifts.
 *
 * ---------------------------------------------------------------------------
 * Labour comes through a contract, takings come from a table
 *
 * Analytics may read Menu, Orders and Finance directly (ModuleBoundaryTest
 * names the three edges) and may not read Staff at all. That is not a
 * technicality here: an hourly labour chart is one query away from a report of
 * who was late, and the line between "what did the hour cost" and "who was in
 * it" is the line between an operations chart and personnel data.
 * `App\Contracts\Staff\Roster::payrollByHour()` answers the first and cannot
 * answer the second — twenty-four totals, no names.
 *
 * ---------------------------------------------------------------------------
 * The percentage is dropped, not zeroed, where there is nothing to divide by
 *
 * An hour with wages and no takings has no labour PERCENTAGE — the ratio is
 * undefined, not infinite and not 100. A restaurant prepping at ten in the
 * morning is exactly that hour, every day, and drawing it as a red 100% bar
 * would teach a manager to ignore the colour on the hours that matter.
 */
final class LabourCurve
{
    public function __construct(
        private readonly Roster $roster,
        private readonly BranchContext $branches,
    ) {}

    /**
     * One row per hour that had either wages or takings in it.
     *
     * Hours with neither are left out rather than sent as zeros: a venue that
     * opens at eleven should draw a chart that starts at eleven, and eleven
     * empty bars at the front is how a reader concludes the morning is dead
     * rather than shut.
     *
     * @return array<string, mixed>
     */
    public function forWindow(ReportWindow $window): array
    {
        $branchId = $this->branches->id();

        $labour = $this->roster->payrollByHour($window->from, $window->to, $branchId);

        $takings = Payment::query()
            ->captured()
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->whereBetween('business_date', [$window->from, $window->to])
            // The hour the money was taken, from the timestamp rather than from
            // the trading day: `business_date` says which evening this belongs
            // to, `paid_at` says when in it. Both are needed and they are
            // different columns.
            ->groupByRaw('extract(hour from paid_at)')
            ->selectRaw('extract(hour from paid_at)::int as hour')
            ->selectRaw('coalesce(sum(amount), 0)::bigint as total')
            ->toBase()
            ->pluck('total', 'hour');

        $hours = [];
        $labourTotal = 0;
        $revenueTotal = 0;

        for ($hour = 0; $hour < 24; $hour++) {
            $cost = (int) ($labour[$hour] ?? 0);
            $revenue = (int) ($takings[$hour] ?? 0);

            $labourTotal += $cost;
            $revenueTotal += $revenue;

            if ($cost === 0 && $revenue === 0) {
                continue;
            }

            $hours[] = [
                'hour' => $hour,
                'labour_tiyin' => $cost,
                'revenue_tiyin' => $revenue,
                'labour_percent' => $revenue === 0
                    ? null
                    : round(($cost / $revenue) * 100, 1),
            ];
        }

        return [
            'window' => $window->toArray(),
            'branch_id' => $branchId,
            /*
             * Whether the module that owns attendance answered at all.
             *
             * `UnavailableRoster` returns an empty map, and so does a venue
             * where nobody clocked in — the same shape for two different facts.
             * A console drawing "0%" over a chart with no labour in it would be
             * making a claim about a rota it never saw.
             */
            'has_labour' => $labour !== [],
            'labour_tiyin' => $labourTotal,
            'revenue_tiyin' => $revenueTotal,
            'labour_percent' => $revenueTotal === 0
                ? null
                : round(($labourTotal / $revenueTotal) * 100, 1),
            'hours' => $hours,
        ];
    }
}
