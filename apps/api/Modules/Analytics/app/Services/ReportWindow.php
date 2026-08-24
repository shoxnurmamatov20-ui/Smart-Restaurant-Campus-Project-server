<?php

declare(strict_types=1);

namespace Modules\Analytics\Services;

use App\Support\Tenancy\BusinessDay;
use Carbon\CarbonImmutable;

/**
 * "Today", "this week", "this month" — turned into two trading dates.
 *
 * ---------------------------------------------------------------------------
 * Why every query in this module ends up here
 *
 * `whereDate()` is banned platform-wide (`ModuleBoundaryTest` refuses it by
 * name): it wraps the column in a function and PostgreSQL stops using the
 * index, which on a year of payments is the difference between an index scan
 * and reading the table. A report screen doing that four times per render is
 * the slowest page in the console.
 *
 * A range on `business_date` is what replaces it, and it is also more correct.
 * A restaurant's day runs 06:00 → 06:00 (DECISIONS Q3), so a bill rung up at
 * 01:30 belongs to the evening that is still finishing. `business_date` was
 * stamped on the row at creation from the venue's own boundary; grouping by
 * `created_at::date` would move that bill into the next day and make every
 * report disagree with the Z-report a cashier signed.
 *
 * ---------------------------------------------------------------------------
 * The comparison window is the same length, immediately before
 *
 * Every KPI on the dashboard carries a delta, and a delta is only meaningful
 * against a like period: today against yesterday, this week against last. The
 * previous window is derived here rather than at each call site, because seven
 * call sites deriving it is seven chances for one screen to compare a week
 * against a month and report a 400% rise.
 */
final readonly class ReportWindow
{
    public const PERIODS = ['today', 'week', 'month'];

    private function __construct(
        public string $period,
        public string $from,
        public string $to,
        public string $previousFrom,
        public string $previousTo,
        /** How many trading days the window spans — 1, 7 or 30. */
        public int $days,
    ) {}

    /**
     * The window a client asked for, clamped to what this module answers.
     *
     * An unrecognised period falls back to `today` rather than throwing. A
     * dashboard is a read: a stale bookmark with `?period=quarter` on it should
     * draw today's figures, not a 422 in place of the screen.
     */
    public static function of(?string $period, ?BusinessDay $businessDay = null): self
    {
        $businessDay ??= app(BusinessDay::class);
        $period = in_array($period, self::PERIODS, true) ? $period : 'today';

        $today = CarbonImmutable::parse($businessDay->dateFor());

        $days = match ($period) {
            'week' => 7,
            'month' => 30,
            default => 1,
        };

        /*
         * Inclusive of today, which is why the subtraction is `days - 1`.
         *
         * "This week" on a Wednesday means the last seven trading days ending
         * today, not the six before it. Off by one here understates every
         * weekly figure by a day and does it silently — the chart still looks
         * like a week.
         */
        $from = $today->subDays($days - 1);
        $previousTo = $from->subDay();

        return new self(
            period: $period,
            from: $from->toDateString(),
            to: $today->toDateString(),
            previousFrom: $previousTo->subDays($days - 1)->toDateString(),
            previousTo: $previousTo->toDateString(),
            days: $days,
        );
    }

    /**
     * A cache key that cannot collide across restaurants or venues.
     *
     * The tenant is first and is never optional: a key that omitted it would
     * serve one restaurant's revenue to the next request that asked the same
     * question, which is the single worst bug this platform could have. The
     * branch is part of it because "all venues" and "Chilonzor" are different
     * answers to the same question.
     */
    public function cacheKey(string $report, ?int $tenantId, ?int $branchId): string
    {
        return sprintf(
            'analytics:%s:t%s:b%s:%s:%s',
            $report,
            $tenantId ?? 'none',
            $branchId ?? 'all',
            $this->period,
            $this->to,
        );
    }

    /**
     * @return array{from: string, to: string, period: string, days: int}
     */
    public function toArray(): array
    {
        return [
            'period' => $this->period,
            'from' => $this->from,
            'to' => $this->to,
            'days' => $this->days,
        ];
    }
}
