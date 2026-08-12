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

    public function __construct(private readonly TenantContext $tenants) {}

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

    /** The restaurant's timezone, or the application's when there is no tenant. */
    public function timezone(): string
    {
        $timezone = $this->tenants->tenant()?->timezone;

        return is_string($timezone) && $timezone !== ''
            ? $timezone
            : (string) config('app.timezone', 'UTC');
    }

    /** `HH:MM` at which the restaurant's trading day begins. */
    public function startsAt(): string
    {
        $configured = $this->tenants->tenant()?->setting('business_day_starts_at');

        return is_string($configured) && preg_match('/^\d{1,2}:\d{2}$/', $configured) === 1
            ? $configured
            : self::DEFAULT_START;
    }
}
