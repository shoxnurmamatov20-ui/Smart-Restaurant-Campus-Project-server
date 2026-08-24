<?php

declare(strict_types=1);

namespace Modules\Analytics\Tests\Unit;

use Modules\Analytics\Services\RoleDashboards;
use PHPUnit\Framework\TestCase;

/**
 * The owner's gross-profit card must agree with the food-cost card beside it.
 * It did not: with a quarter of the menu costed, the projection's exact
 * "revenue minus the cost we know" read as a 92% margin next to "food cost
 * 31%". The estimate applies the measured ratio to all the revenue, and only
 * trusts the exact figure once every dish is costed.
 */
final class GrossProfitEstimateTest extends TestCase
{
    public function test_a_partly_costed_menu_extrapolates_the_measured_food_cost(): void
    {
        $gross = RoleDashboards::grossProfitEstimate([
            'revenue_tiyin' => 436_480_000,
            'food_cost_percent' => 31.3,
            'cogs_coverage_percent' => 24,
            'gross_profit_tiyin' => 403_530_000, // exact only for the costed quarter
        ]);

        $this->assertSame((int) round(436_480_000 * 0.687), $gross);
        // And the margin the card derives agrees with the food-cost card.
        $this->assertSame(68.7, round($gross / 436_480_000 * 100, 1));
    }

    public function test_a_fully_costed_menu_gives_the_exact_figure_by_the_same_formula(): void
    {
        // Coverage 100: the ratio over every line times every line's sales is
        // revenue minus cost — the projection's number, without depending on
        // the projection having reached this window.
        $this->assertSame(300_000_00, RoleDashboards::grossProfitEstimate([
            'revenue_tiyin' => 1_000_000_00,
            'food_cost_percent' => 70.0,
            'cogs_coverage_percent' => 100,
            'gross_profit_tiyin' => 300_000_00,
        ]));
    }

    public function test_a_window_the_projection_has_not_reached_is_still_consistent(): void
    {
        // One day rolled up out of seven: the projection's exact figure covers
        // 113 440 000 of revenue, the bills cover 436 480 000. The card must
        // not mix them, whatever the coverage column says about that one day.
        $gross = RoleDashboards::grossProfitEstimate([
            'revenue_tiyin' => 436_480_000,
            'food_cost_percent' => 31.3,
            'cogs_coverage_percent' => 100,
            'gross_profit_tiyin' => 113_440_000 - 32_950_000,
        ]);

        $this->assertSame(68.7, round($gross / 436_480_000 * 100, 1));
    }

    public function test_nothing_costed_or_nothing_sold_is_nothing(): void
    {
        $this->assertNull(RoleDashboards::grossProfitEstimate([
            'revenue_tiyin' => 1_000_000_00,
            'food_cost_percent' => null,
            'cogs_coverage_percent' => null,
            'gross_profit_tiyin' => null,
        ]));
        $this->assertNull(RoleDashboards::grossProfitEstimate([
            'revenue_tiyin' => 0,
            'food_cost_percent' => 31.3,
            'cogs_coverage_percent' => 100,
            'gross_profit_tiyin' => 0,
        ]));
    }
}
