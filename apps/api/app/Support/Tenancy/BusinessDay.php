<?php

declare(strict_types=1);

namespace App\Support\Tenancy;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * When "today" starts and ends for a restaurant.
 *
 * A restaurant's day is not a calendar day. A venue in Tashkent that serves until
 * two in the morning expects those bills on the evening's Z-report, not on the
 * next one — which is why every tenant carries a `timezone` and a
 * `business_day_starts_at` (06:00 by default).
 *
 * Both were being stored and neither was being read: "today's takings" was a UTC
 * calendar day, so an order rung up at 02:00 Tashkent time (21:00 UTC the day
 * before) landed in the wrong report, and the 06:00 boundary was ignored
 * entirely.
 *
 * The window is half-open — `[start, end)` — so a payment at exactly the
 * boundary belongs to one day and only one day.
 *
 * The other half of this class's job is speed. `whereDate('paid_at', …)` compiles
 * to `date(paid_at) = ?`, a function applied to the column, and PostgreSQL cannot
 * use an index on a column it has to transform first. Every "today" query was a
 * sequential scan waiting to happen. A plain range on the raw column is both
 * correct and index-friendly.
 */
final class BusinessDay
{
    /** Used when a restaurant has not said otherwise. */
    private const DEFAULT_START = '06:00';

    public function __construct(
        private readonly TenantContext $tenants,
        private readonly BranchContext $branches,
    ) {}

    /**
     * The business day that `$at` (default: now) falls inside.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable} [start, end) in UTC
     */
    public function window(?CarbonImmutable $at = null): array
    {
        $timezone = $this->timezone();
        $local = ($at ?? CarbonImmutable::now())->setTimezone($timezone);

        $start = $local->setTimeFromTimeString($this->startsAt());

        // Before the boundary means we are still in yesterday's trading day: at
        // 02:00 the kitchen is closing, not opening.
        if ($local->lessThan($start)) {
            $start = $start->subDay();
        }

        return [$start->utc(), $start->addDay()->utc()];
    }

    /**
     * The window for a named business date, e.g. `2026-08-11`.
     *
     * The date is read in the restaurant's own timezone, so "the 11th" means what
     * the manager means by it.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    public function windowFor(string $date): array
    {
        $start = CarbonImmutable::parse($date, $this->timezone())
            ->setTimeFromTimeString($this->startsAt());

        return [$start->utc(), $start->addDay()->utc()];
    }

    /**
     * A calendar day in the restaurant's timezone, ignoring the trading-day
     * boundary — for things genuinely counted by the clock rather than by the
     * shift, such as a reservation diary.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    public function calendarDay(string $date): array
    {
        $start = CarbonImmutable::parse($date, $this->timezone())->startOfDay();

        return [$start->utc(), $start->addDay()->utc()];
    }

    /**
     * Constrain a query to one business day on an indexed column.
     *
     * `>=` and `<` on the raw column, so PostgreSQL can walk the index instead of
     * computing `date()` for every row on the table.
     *
     * @param  Builder<*>  $query
     * @param array{0: CarbonImmutable, 1: CarbonImmutable} $window
     *
     * @return Builder<*>
     */
    public function constrain(Builder $query, string $column, array $window): Builder
    {
        [$start, $end] = $window;

        return $query->where($column, '>=', $start)->where($column, '<', $end);
    }

    /**
     * The venue's timezone, then the restaurant's, then the application's.
     *
     * A chain with branches in Tashkent and Termiz shares one tenant and one
     * clock today; they are in the same zone, so nothing breaks — but the
     * moment a franchise crosses a border, "today" has to be asked of the
     * building, not the company.
     */
    public function timezone(): string
    {
        foreach ([$this->branches->branch()?->timezone, $this->tenants->tenant()?->timezone] as $candidate) {
            if (is_string($candidate) && $candidate !== '') {
                return $candidate;
            }
        }

        return (string) config('app.timezone', 'UTC');
    }

    /**
     * `HH:MM` at which the trading day begins — a BRANCH setting, per
     * DECISIONS Q3, falling back to the restaurant and then to 06:00.
     *
     * Q3 is explicit that this is not a global constant: "Filialning ish vaqti
     * Sozlamalarda o'zgartirilsa, chegara ham o'zgarishi kerak." A branch that
     * closes at 04:00 and one that opens at 08:00 cannot share a boundary
     * without one of them splitting an evening across two reports.
     */
    public function startsAt(): string
    {
        $candidates = [
            $this->branches->branch()?->setting('business_day_starts_at'),
            $this->tenants->tenant()?->setting('business_day_starts_at'),
        ];

        foreach ($candidates as $configured) {
            if (is_string($configured) && preg_match('/^\d{1,2}:\d{2}$/', $configured) === 1) {
                return $configured;
            }
        }

        return self::DEFAULT_START;
    }

    /**
     * The business date `$at` falls inside, as `Y-m-d` in the venue's own
     * timezone — the value stored on the row and grouped by in every report.
     */
    public function dateFor(?CarbonImmutable $at = null): string
    {
        [$start] = $this->window($at);

        return $start->setTimezone($this->timezone())->format('Y-m-d');
    }
}
