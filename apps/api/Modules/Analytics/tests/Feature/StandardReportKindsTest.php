<?php

declare(strict_types=1);

namespace Modules\Analytics\Tests\Feature;

use App\Models\Branch;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Payment;
use Tests\TestCase;

/**
 * The four catalogue cards that got a Run button.
 *
 * The reports screen draws eleven cards; five opened a viewer and six flashed
 * "building · it will be emailed to you", which queued nothing. Four of those
 * six can be answered without crossing a module boundary this platform does not
 * open — the Z-report pack, sales by item, the VAT pack and the branch
 * comparison — and this file is what says they answer the same shape as the
 * other five, which is what makes the CSV export work for them for free.
 *
 * The other two stay closed and say why at their own methods: stock movement
 * needs Inventory (Analytics may read Menu, Orders and Finance only), and labour
 * needs per-person attendance, which `App\Contracts\Staff\Roster` withholds on
 * purpose.
 */
final class StandardReportKindsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-08-20 15:00:00'));

        $this->seed(RolesAndPermissionsSeeder::class);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function actingAsOwner(): User
    {
        $user = User::factory()->create();
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    public function test_the_z_pack_lists_the_drawers_that_were_closed(): void
    {
        $this->actingAsOwner();

        $shift = CashShift::query()->create([
            'number' => 'Z-0044', 'opened_at' => Carbon::parse('2026-08-20 09:00:00'),
            'closed_at' => Carbon::parse('2026-08-20 14:00:00'), 'status' => 'closed',
            'opening_cash' => 1_000_000, 'expected_cash' => 9_000_000,
            'counted_cash' => 8_900_000, 'difference' => -100_000,
        ]);

        Payment::factory()->create([
            'cash_shift_id' => $shift->getKey(), 'amount' => 8_000_000,
            'status' => 'captured', 'paid_at' => Carbon::parse('2026-08-20 12:00:00'),
        ]);

        // A till still running has no count, so it is not a Z.
        CashShift::query()->create([
            'number' => 'Z-0045', 'opened_at' => Carbon::parse('2026-08-20 14:05:00'),
            'status' => 'open', 'opening_cash' => 0, 'expected_cash' => 0,
            'counted_cash' => 0, 'difference' => 0,
        ]);

        $report = $this->getJson('/api/v1/analytics/reports/zreport?period=today')
            ->assertOk()->json('data');

        $this->assertTrue($report['available']);
        $this->assertCount(1, $report['rows']);
        $this->assertSame('Z-0044', $report['rows'][0]['number']);
        $this->assertSame(8_000_000, $report['rows'][0]['takings_tiyin']);
        $this->assertSame(-100_000, $report['totals']['difference_tiyin']);
    }

    public function test_the_vat_pack_takes_the_tax_out_of_a_tax_inclusive_price(): void
    {
        $this->actingAsOwner();

        // 11 200 000 tiyin gross at 12% → 10 000 000 net, 1 200 000 tax.
        Payment::factory()->create([
            'amount' => 11_200_000, 'status' => 'captured',
            'paid_at' => Carbon::parse('2026-08-20 12:00:00'),
        ]);

        $report = $this->getJson('/api/v1/analytics/reports/vat?period=today')
            ->assertOk()->json('data');

        $this->assertCount(1, $report['rows']);
        $this->assertSame(11_200_000, $report['rows'][0]['gross_tiyin']);
        $this->assertSame(10_000_000, $report['rows'][0]['net_tiyin']);
        $this->assertSame(1_200_000, $report['rows'][0]['vat_tiyin']);

        // The two halves add back to the gross. The other rounding order leaves
        // a tiyin on the floor on roughly half the days of a month, and a VAT
        // return that does not foot is one somebody has to redo by hand.
        $this->assertSame(
            $report['totals']['gross_tiyin'],
            $report['totals']['net_tiyin'] + $report['totals']['vat_tiyin'],
        );
    }

    public function test_the_branch_comparison_is_the_same_service_the_screen_draws(): void
    {
        $this->actingAsOwner();

        Branch::query()->create([
            'name' => 'Chilonzor', 'slug' => 'chilonzor', 'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);

        $report = $this->getJson('/api/v1/analytics/reports/branches?period=week')
            ->assertOk()->json('data');

        $this->assertTrue($report['available']);
        $this->assertSame('Chilonzor', $report['rows'][0]['name']);
        $this->assertContains(
            ['key' => 'labour_percent', 'type' => 'percent'],
            $report['columns'],
        );
    }

    public function test_sales_by_item_answers_the_reports_shape_even_with_nothing_sold(): void
    {
        $this->actingAsOwner();

        $report = $this->getJson('/api/v1/analytics/reports/items?period=today')
            ->assertOk()->json('data');

        // Available with no rows is a real answer — a quiet Tuesday — and is
        // different from `available: false`, which means nothing can answer it.
        $this->assertTrue($report['available']);
        $this->assertSame([], $report['rows']);
        $this->assertNotSame([], $report['columns']);
    }

    public function test_the_two_kinds_that_needed_another_module_now_answer(): void
    {
        // Both used to say "not available, and here is why": the shelf belongs
        // to Inventory and the rota to Staff, and Analytics may read neither.
        // Each now goes through its module's contract, the same way the
        // dashboard's food-cost card always did.
        $this->actingAsOwner();

        foreach (['stock', 'labour'] as $kind) {
            $report = $this->getJson("/api/v1/analytics/reports/{$kind}?period=today")
                ->assertOk()->json('data');

            $this->assertTrue($report['available'], "{$kind} should answer");
            $this->assertNotSame([], $report['columns']);
        }
    }

    public function test_an_unknown_kind_explains_itself_rather_than_404ing(): void
    {
        // A card whose viewer 404s looks broken; one that explains itself is
        // information.
        $this->actingAsOwner();

        $unknown = $this->getJson('/api/v1/analytics/reports/sommelier?period=today')
            ->assertOk()->json('data');

        $this->assertFalse($unknown['available']);
        $this->assertNotEmpty($unknown['reason']);
    }

    public function test_a_new_kind_can_be_exported_because_it_is_the_same_shape(): void
    {
        $this->actingAsOwner();

        Payment::factory()->create([
            'amount' => 11_200_000, 'status' => 'captured',
            'paid_at' => Carbon::parse('2026-08-20 12:00:00'),
        ]);

        $response = $this->postJson('/api/v1/reports/export', [
            'kind' => 'vat', 'period' => 'today', 'format' => 'csv',
        ]);

        $response->assertOk();
        $response->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
    }

    public function test_a_waiter_cannot_run_a_report(): void
    {
        $user = User::factory()->create();
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->getJson('/api/v1/analytics/reports/vat?period=today')->assertForbidden();
    }
}
