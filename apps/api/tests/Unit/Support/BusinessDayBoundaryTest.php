<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Models\Branch;
use App\Models\Tenant;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\BusinessDay;
use App\Support\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * DECISIONS Q3, the rule every report rests on: a restaurant's day runs
 * 06:00 → 06:00, so the bill rung up at 01:30 belongs to the evening that is
 * still finishing.
 *
 * Q3 chose 06:00 for a reason worth keeping in the test: the latest-closing
 * branch shuts at 04:00 and the earliest-opening one opens at 08:00, so the
 * boundary crosses nobody's shift. Get this wrong and the manager's closing
 * numbers never match, which is the fastest way to lose their trust in the
 * system.
 *
 * No database: the contexts are plain holders, so the arithmetic can be tested
 * where it is cheapest to run.
 */
final class BusinessDayBoundaryTest extends TestCase
{
    #[Test]
    public function an_order_after_midnight_belongs_to_the_evening_before(): void
    {
        $day = $this->businessDay(timezone: 'Asia/Tashkent');

        // 01:30 Tashkent, the kitchen closing rather than opening.
        $at = CarbonImmutable::parse('2026-08-12 01:30', 'Asia/Tashkent');

        $this->assertSame('2026-08-11', $day->dateFor($at));
    }

    #[Test]
    public function an_order_after_the_boundary_starts_the_new_day(): void
    {
        $day = $this->businessDay(timezone: 'Asia/Tashkent');

        $this->assertSame(
            '2026-08-12',
            $day->dateFor(CarbonImmutable::parse('2026-08-12 06:00', 'Asia/Tashkent')),
            'The window is half-open, so 06:00 itself opens the new day',
        );
        $this->assertSame(
            '2026-08-11',
            $day->dateFor(CarbonImmutable::parse('2026-08-12 05:59:59', 'Asia/Tashkent')),
        );
    }

    #[Test]
    public function the_branch_setting_wins_over_the_restaurant(): void
    {
        // A late-night venue in the same chain: its day turns at 04:00, so
        // 05:00 is already tomorrow for it while still yesterday for the rest.
        $day = $this->businessDay(
            timezone: 'Asia/Tashkent',
            tenantStart: '06:00',
            branchStart: '04:00',
        );

        $this->assertSame(
            '2026-08-12',
            $day->dateFor(CarbonImmutable::parse('2026-08-12 05:00', 'Asia/Tashkent')),
        );
    }

    #[Test]
    public function it_falls_back_to_the_restaurant_then_to_six(): void
    {
        $tenantOnly = $this->businessDay(timezone: 'Asia/Tashkent', tenantStart: '05:00');
        $this->assertSame('05:00', $tenantOnly->startsAt());

        $neither = $this->businessDay(timezone: 'Asia/Tashkent');
        $this->assertSame('06:00', $neither->startsAt());
    }

    #[Test]
    public function a_malformed_setting_is_ignored_rather_than_obeyed(): void
    {
        // Half the day landing in the wrong report is worse than a setting
        // that quietly does not apply.
        $day = $this->businessDay(timezone: 'Asia/Tashkent', branchStart: 'six oclock');

        $this->assertSame('06:00', $day->startsAt());
    }

    #[Test]
    public function the_window_is_half_open_so_a_bill_belongs_to_one_day_only(): void
    {
        $day = $this->businessDay(timezone: 'Asia/Tashkent');
        [$start, $end] = $day->window(CarbonImmutable::parse('2026-08-12 12:00', 'Asia/Tashkent'));

        $this->assertTrue($end->greaterThan($start));
        $this->assertSame(24 * 60, (int) $start->diffInMinutes($end));
    }

    private function businessDay(
        string $timezone,
        ?string $tenantStart = null,
        ?string $branchStart = null,
    ): BusinessDay {
        $tenants = new TenantContext;
        $branches = new BranchContext;

        $tenant = new Tenant;
        $tenant->timezone = $timezone;
        $tenant->settings = $tenantStart === null ? [] : ['business_day_starts_at' => $tenantStart];
        $tenants->set($tenant);

        if ($branchStart !== null) {
            $branch = new Branch;
            $branch->settings = ['business_day_starts_at' => $branchStart];
            $branches->set($branch);
        }

        return new BusinessDay($tenants, $branches);
    }
}
