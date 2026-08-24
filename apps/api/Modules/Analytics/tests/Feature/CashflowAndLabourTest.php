<?php

declare(strict_types=1);

namespace Modules\Analytics\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\StaffMember;
use Tests\TestCase;

/**
 * Two charts the console drew from fixtures because nothing answered them.
 *
 * The finance screen's six-month cash-flow bars needed six calls to
 * `profit-loss` and were hidden instead; the branches screen's labour curve was
 * fourteen invented bars with a caption telling a manager to cut shifts.
 */
final class CashflowAndLabourTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Mid-month, mid-afternoon: both endpoints group by trading day, which
        // turns over at 06:00, and a month boundary under the wall clock makes
        // this file fail only between midnight and dawn.
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

    // ============ Cash flow ============

    public function test_the_series_answers_every_month_in_the_range_including_the_empty_ones(): void
    {
        $this->actingAsOwner();

        Payment::factory()->create([
            'amount' => 30_000_000, 'status' => 'captured',
            'paid_at' => Carbon::parse('2026-08-04 13:00:00'),
        ]);
        Expense::query()->create([
            'category' => 'rent', 'description' => 'Avgust ijara', 'amount' => 12_000_000,
            'paid_in_cash' => false, 'spent_at' => Carbon::parse('2026-08-02 10:00:00'),
        ]);
        Payment::factory()->create([
            'amount' => 5_000_000, 'status' => 'captured',
            'paid_at' => Carbon::parse('2026-06-10 13:00:00'),
        ]);

        $data = $this->getJson('/api/v1/analytics/cashflow?months=6')->assertOk()->json('data');

        // Six bars for six months, oldest first, whatever happened in them: a
        // chart that skipped July would put August where July was.
        $this->assertCount(6, $data['series']);
        $this->assertSame('2026-03', $data['series'][0]['month']);
        $this->assertSame('2026-08', $data['series'][5]['month']);

        $august = $data['series'][5];
        $this->assertSame(30_000_000, $august['in_tiyin']);
        $this->assertSame(12_000_000, $august['out_tiyin']);
        $this->assertSame(18_000_000, $august['net_tiyin']);

        $july = $data['series'][4];
        $this->assertSame('2026-07', $july['month']);
        $this->assertSame(0, $july['in_tiyin']);

        $this->assertSame(5_000_000, $data['series'][3]['in_tiyin']);
    }

    public function test_the_series_says_which_half_of_it_a_venue_narrows(): void
    {
        $this->actingAsOwner();

        $this->getJson('/api/v1/analytics/cashflow')
            ->assertOk()
            // With no venue chosen both halves are the whole business, and the
            // screen's footnote is drawn from this rather than guessed.
            ->assertJsonPath('data.scope.in', 'business')
            ->assertJsonPath('data.scope.out', 'business');
    }

    public function test_a_range_beyond_the_ceiling_is_refused_rather_than_silently_shortened(): void
    {
        $this->actingAsOwner();

        $this->getJson('/api/v1/analytics/cashflow?months=99')->assertStatus(422);
    }

    public function test_a_waiter_cannot_read_the_businesss_cash_flow(): void
    {
        $user = User::factory()->create();
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->getJson('/api/v1/analytics/cashflow')->assertForbidden();
    }

    public function test_one_restaurants_cash_flow_is_not_another_restaurants(): void
    {
        $mine = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $theirs = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        Payment::factory()->create([
            'tenant_id' => $mine->id, 'amount' => 1_000_000, 'status' => 'captured',
            'paid_at' => Carbon::parse('2026-08-05 13:00:00'),
        ]);
        Payment::factory()->create([
            'tenant_id' => $theirs->id, 'amount' => 77_000_000, 'status' => 'captured',
            'paid_at' => Carbon::parse('2026-08-05 13:00:00'),
        ]);

        $user = User::factory()->create(['tenant_id' => $mine->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        $series = $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/analytics/cashflow?months=1')
            ->assertOk()->json('data.series');

        $this->assertSame(1_000_000, $series[0]['in_tiyin']);
    }

    // ============ Labour by hour ============

    public function test_a_shift_is_charged_to_the_hours_it_actually_covered(): void
    {
        $this->actingAsOwner();

        $branch = Branch::query()->create([
            'name' => 'Chilonzor', 'slug' => 'chilonzor', 'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);

        $member = StaffMember::factory()->create([
            'branch_id' => $branch->id,
            // 60 000 so'm an hour, in tiyin.
            'hourly_rate' => 6_000_000,
        ]);

        Attendance::query()->create([
            'staff_member_id' => $member->id,
            'branch_id' => $branch->id,
            'checked_in_at' => Carbon::parse('2026-08-20 14:00:00'),
            'checked_out_at' => Carbon::parse('2026-08-20 16:00:00'),
            'minutes_worked' => 120,
        ]);

        Payment::factory()->create([
            'branch_id' => $branch->id, 'amount' => 20_000_000, 'status' => 'captured',
            'paid_at' => Carbon::parse('2026-08-20 15:30:00'),
        ]);

        $data = $this->getJson('/api/v1/analytics/labour-by-hour?period=today')
            ->assertOk()->json('data');

        $this->assertTrue($data['has_labour']);

        /** @var array<int, array<string, mixed>> $hours */
        $hours = [];

        foreach ($data['hours'] as $row) {
            $hours[(int) $row['hour']] = $row;
        }

        // Two hours worked, one hour of wages in each — not one spike at 14:00.
        $this->assertSame(6_000_000, $hours[14]['labour_tiyin']);
        $this->assertSame(6_000_000, $hours[15]['labour_tiyin']);
        $this->assertSame(20_000_000, $hours[15]['revenue_tiyin']);
        // `assertEquals`, not `assertSame`: the service rounds to one decimal
        // and JSON re-encodes a whole 30.0 as the integer 30 on the way back.
        $this->assertEquals(30, $hours[15]['labour_percent']);

        // 14:00 took nothing, so there is no ratio to state.
        $this->assertNull($hours[14]['labour_percent']);
    }

    public function test_a_venue_with_no_attendance_says_so_rather_than_drawing_zeros(): void
    {
        $this->actingAsOwner();

        Payment::factory()->create([
            'amount' => 9_000_000, 'status' => 'captured',
            'paid_at' => Carbon::parse('2026-08-20 13:00:00'),
        ]);

        $data = $this->getJson('/api/v1/analytics/labour-by-hour?period=today')
            ->assertOk()->json('data');

        $this->assertFalse($data['has_labour']);
        $this->assertSame(0, $data['labour_tiyin']);
        // The takings hour is still drawn: the chart has something to say even
        // with nobody clocked in, and it says the labour half is missing.
        $this->assertCount(1, $data['hours']);
    }

    public function test_an_unknown_window_is_refused_rather_than_answered_with_one_day(): void
    {
        $this->actingAsOwner();

        $this->getJson('/api/v1/analytics/labour-by-hour?period=quarter')->assertStatus(422);
    }

    public function test_a_waiter_cannot_read_the_labour_curve(): void
    {
        $user = User::factory()->create();
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->getJson('/api/v1/analytics/labour-by-hour')->assertForbidden();
    }
}
