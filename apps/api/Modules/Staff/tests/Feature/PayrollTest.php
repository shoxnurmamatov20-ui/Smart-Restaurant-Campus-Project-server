<?php

declare(strict_types=1);

namespace Modules\Staff\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\PayrollLine;
use Modules\Staff\Models\PayrollPeriod;
use Modules\Staff\Models\Shift;
use Modules\Staff\Models\StaffMember;
use Tests\TestCase;

/**
 * A month of wages: built from attendance, edited by hand, and frozen when
 * somebody signs it off.
 *
 * The expected tiyin figures in this file are worked out by hand in the
 * assertion's own comment and never re-derived from the service. A test that
 * computes `minutes * rate / 60` the same way the code does agrees with the code
 * about a bug as readily as about a fix — and a wage bill is the one figure on
 * this platform where an unnoticed disagreement ends in somebody being underpaid
 * and nobody being able to say why.
 *
 * The clock is pinned so the open-attendance case has an exact answer rather
 * than an approximate one: "counted up to now" is only testable if `now` is a
 * known quantity.
 */
final class PayrollTest extends TestCase
{
    use RefreshDatabase;

    /** The month every run in this file is for. */
    private const MONTH = '2026-08';

    /** Pinned so "up to now" is a number and not a range. */
    private const NOW = '2026-08-20 12:00:00';

    /** 20 000 so'm an hour, in tiyin. */
    private const RATE = 2_000_000;

    private Tenant $tenant;

    private Branch $chilonzor;

    private Branch $termiz;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->travelTo(Carbon::parse(self::NOW));

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);

        $this->chilonzor = Branch::factory()->named('Chilonzor', 'CHZ')->create(['tenant_id' => $this->tenant->id]);
        $this->termiz = Branch::factory()->named('Termiz', 'TRM', 'Termiz')->create(['tenant_id' => $this->tenant->id]);
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    // ============ Fixtures ============

    private function actingAsManager(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('branch-manager');
        $this->actingAs($user);

        return $user;
    }

    private function memberAt(Branch $branch, string $name = 'Jasur', int $rate = self::RATE): StaffMember
    {
        return StaffMember::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $branch->id,
            'first_name' => $name,
            'hourly_rate' => $rate,
            'status' => 'active',
        ]);
    }

    /**
     * One turnout. `$minutes` is what the attendance row itself carries — the
     * service trusts a closed record's own frozen figure rather than
     * recomputing it, which is what makes a clock-out correction a correction
     * rather than a re-derivation.
     */
    private function worked(
        StaffMember $member,
        string $in,
        ?string $out,
        int $minutes,
        bool $late = false,
    ): Attendance {
        return Attendance::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $member->branch_id,
            'staff_member_id' => $member->id,
            'checked_in_at' => $in,
            'checked_out_at' => $out,
            'minutes_worked' => $minutes,
            'is_late' => $late,
        ]);
    }

    /** @param array<string, mixed> $payload */
    private function openRun(array $payload = []): int
    {
        return (int) $this->postJson('/api/v1/staff/payroll', [
            'period' => self::MONTH,
            ...$payload,
        ])->assertCreated()->json('data.id');
    }

    // ============ Building a run ============

    public function test_a_run_pays_for_the_hours_actually_worked(): void
    {
        $this->actingAsManager();
        $jasur = $this->memberAt($this->chilonzor, 'Jasur');
        $nodira = $this->memberAt($this->chilonzor, 'Nodira', 1_500_000);

        // 510 + 285 = 795 minutes for Jasur, one of them a late start.
        $this->worked($jasur, '2026-08-05 09:00:00', '2026-08-05 17:30:00', 510);
        $this->worked($jasur, '2026-08-06 09:15:00', '2026-08-06 14:00:00', 285, late: true);
        // 480 for Nodira, on a lower rate.
        $this->worked($nodira, '2026-08-07 10:00:00', '2026-08-07 18:00:00', 480);

        $response = $this->postJson('/api/v1/staff/payroll', ['period' => self::MONTH])
            ->assertCreated()
            ->assertJsonPath('data.period', self::MONTH)
            ->assertJsonPath('data.status', 'draft')
            // The window is stamped, not left for a client to derive.
            ->assertJsonPath('data.starts_on', '2026-08-01')
            ->assertJsonPath('data.ends_on', '2026-08-31')
            ->assertJsonCount(2, 'data.lines');

        /*
         * 795 minutes at 2 000 000 tiyin an hour.
         *
         * 795 / 60 = 13.25 hours; 13.25 x 2 000 000 = 26 500 000 tiyin, which is
         * 265 000 so'm. Worked out here rather than asked of the service.
         */
        $response
            ->assertJsonPath('data.lines.0.full_name', $jasur->full_name)
            ->assertJsonPath('data.lines.0.minutes_worked', 795)
            ->assertJsonPath('data.lines.0.hourly_rate', self::RATE)
            ->assertJsonPath('data.lines.0.basic_tiyin', 26_500_000)
            ->assertJsonPath('data.lines.0.net_tiyin', 26_500_000)
            ->assertJsonPath('data.lines.0.shifts_count', 2)
            ->assertJsonPath('data.lines.0.late_count', 1)
            // Nothing anywhere on this platform records how a service-charge
            // pool is divided, so the builder writes a zero rather than a guess.
            ->assertJsonPath('data.lines.0.service_charge_tiyin', 0);

        // 480 / 60 = 8 hours; 8 x 1 500 000 = 12 000 000 tiyin.
        $response
            ->assertJsonPath('data.lines.1.full_name', $nodira->full_name)
            ->assertJsonPath('data.lines.1.basic_tiyin', 12_000_000)
            ->assertJsonPath('data.lines.1.late_count', 0);

        // 26 500 000 + 12 000 000, with nothing withheld yet.
        $response
            ->assertJsonPath('data.gross_tiyin', 38_500_000)
            ->assertJsonPath('data.deductions_tiyin', 0)
            ->assertJsonPath('data.net_tiyin', 38_500_000);
    }

    public function test_a_shift_that_was_rostered_and_not_worked_costs_nothing(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);

        // A promise, kept in the rota and not kept in the building.
        Shift::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'staff_member_id' => $member->id,
            'starts_at' => '2026-08-11 10:00:00',
            'ends_at' => '2026-08-11 22:00:00',
            'status' => 'confirmed',
            'published_at' => '2026-08-01 09:00:00',
        ]);

        $this->postJson('/api/v1/staff/payroll', ['period' => self::MONTH])
            ->assertCreated()
            // Paying against a plan is how a labour percentage stops matching
            // the bank — `Roster::payrollBetween()` is written around the same
            // rule and this run has to agree with it.
            ->assertJsonCount(0, 'data.lines')
            ->assertJsonPath('data.gross_tiyin', 0);
    }

    public function test_an_attendance_still_open_is_counted_up_to_now(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor, 'Jasur', 3_000_000);

        // Clocked in at 09:00; the clock is pinned at 12:00 and they have not
        // clocked out. `minutes_worked` is still the column default.
        $this->worked($member, '2026-08-20 09:00:00', null, 0);

        // 180 minutes = 3 hours; 3 x 3 000 000 = 9 000 000 tiyin.
        $this->postJson('/api/v1/staff/payroll', ['period' => self::MONTH])
            ->assertCreated()
            ->assertJsonPath('data.lines.0.minutes_worked', 180)
            ->assertJsonPath('data.lines.0.basic_tiyin', 9_000_000)
            ->assertJsonPath('data.gross_tiyin', 9_000_000);
    }

    public function test_a_later_pay_rise_does_not_restate_a_month_already_built(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $this->worked($member, '2026-08-05 09:00:00', '2026-08-05 17:30:00', 510);

        $runId = $this->openRun();

        // 510 / 60 = 8.5 hours; 8.5 x 2 000 000 = 17 000 000 tiyin.
        $line = PayrollLine::query()->where('payroll_period_id', $runId)->firstOrFail();
        $this->assertSame(self::RATE, $line->hourly_rate);
        $this->assertSame(17_000_000, $line->basic_tiyin);

        // September's raise. `EloquentRoster` documents this exact defect
        // against itself — reading today's rate restates a month already paid —
        // and the snapshot column is the fix.
        $member->update(['hourly_rate' => 9_000_000]);

        $this->getJson("/api/v1/staff/payroll/{$runId}")
            ->assertOk()
            ->assertJsonPath('data.lines.0.hourly_rate', self::RATE)
            ->assertJsonPath('data.lines.0.basic_tiyin', 17_000_000)
            ->assertJsonPath('data.gross_tiyin', 17_000_000);
    }

    public function test_rebuilding_a_draft_replaces_its_lines(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $this->worked($member, '2026-08-05 09:00:00', '2026-08-05 17:30:00', 510);

        $runId = $this->openRun();
        $lineId = (int) PayrollLine::query()->where('payroll_period_id', $runId)->value('id');

        // The clock-out somebody forgot on the 29th, entered late.
        $this->worked($member, '2026-08-29 09:00:00', '2026-08-29 12:00:00', 180);

        // Same month, same venue, so the second POST finds the run rather than
        // opening a second one — which is what the two partial unique indexes
        // exist to make impossible anyway.
        $this->postJson('/api/v1/staff/payroll', ['period' => self::MONTH])
            ->assertOk()
            ->assertJsonPath('data.id', $runId)
            ->assertJsonCount(1, 'data.lines')
            // 510 + 180 = 690 minutes = 11.5 hours; 11.5 x 2 000 000 = 23 000 000.
            ->assertJsonPath('data.lines.0.minutes_worked', 690)
            ->assertJsonPath('data.lines.0.basic_tiyin', 23_000_000);

        $this->assertSame(1, PayrollPeriod::query()->count());
        // Replaced, not reconciled: the old line is gone rather than updated.
        $this->assertNull(PayrollLine::query()->find($lineId));
    }

    public function test_a_run_for_one_venue_leaves_the_other_venues_hours_out(): void
    {
        $this->actingAsManager();
        $here = $this->memberAt($this->chilonzor, 'Jasur');
        $there = $this->memberAt($this->termiz, 'Sardor');
        $this->worked($here, '2026-08-05 09:00:00', '2026-08-05 17:30:00', 510);
        $this->worked($there, '2026-08-05 09:00:00', '2026-08-05 17:30:00', 510);

        $this->postJson('/api/v1/staff/payroll', [
            'period' => self::MONTH,
            'branch_id' => $this->chilonzor->id,
        ])
            ->assertCreated()
            ->assertJsonCount(1, 'data.lines')
            ->assertJsonPath('data.lines.0.staff_member_id', $here->id)
            ->assertJsonPath('data.gross_tiyin', 17_000_000);
    }

    // ============ Editing a line by hand ============

    public function test_a_bonus_moves_the_line_and_the_runs_totals(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $this->worked($member, '2026-08-05 09:00:00', '2026-08-05 17:30:00', 510);

        $runId = $this->openRun();
        $lineId = (int) PayrollLine::query()->where('payroll_period_id', $runId)->value('id');

        // 17 000 000 basic, + 2 000 000 service + 5 000 000 bonus
        // - 1 000 000 advance = 23 000 000 net.
        $this->patchJson("/api/v1/staff/payroll/{$runId}/lines/{$lineId}", [
            'service_charge_tiyin' => 2_000_000,
            'bonus_tiyin' => 5_000_000,
            'deductions_tiyin' => 1_000_000,
            'note' => 'Avans 10-avgustda olindi',
        ])
            ->assertOk()
            ->assertJsonPath('data.net_tiyin', 23_000_000)
            ->assertJsonPath('data.note', 'Avans 10-avgustda olindi')
            // The computed columns are not writable and did not move.
            ->assertJsonPath('data.basic_tiyin', 17_000_000)
            ->assertJsonPath('data.minutes_worked', 510);

        // The run's totals are the sum of its lines, so they had to move too.
        $this->getJson("/api/v1/staff/payroll/{$runId}")
            ->assertOk()
            ->assertJsonPath('data.gross_tiyin', 24_000_000)
            ->assertJsonPath('data.deductions_tiyin', 1_000_000)
            ->assertJsonPath('data.net_tiyin', 23_000_000);
    }

    public function test_a_line_from_another_run_cannot_be_edited_through_this_one(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $this->worked($member, '2026-08-05 09:00:00', '2026-08-05 17:30:00', 510);
        $this->worked($member, '2026-07-05 09:00:00', '2026-07-05 17:30:00', 510);

        $august = $this->openRun();
        $july = $this->openRun(['period' => '2026-07']);
        $julyLine = (int) PayrollLine::query()->where('payroll_period_id', $july)->value('id');

        // Route model binding resolves each parameter alone, so nothing but the
        // controller's own check stops August's URL editing July's payslip.
        $this->patchJson("/api/v1/staff/payroll/{$august}/lines/{$julyLine}", ['bonus_tiyin' => 1])
            ->assertApiError('staff.payroll_line_unknown');

        $this->assertSame(0, (int) PayrollLine::query()->whereKey($julyLine)->value('bonus_tiyin'));
    }

    // ============ Signing it off ============

    public function test_signing_off_freezes_the_run(): void
    {
        $manager = $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $this->worked($member, '2026-08-05 09:00:00', '2026-08-05 17:30:00', 510);

        $runId = $this->openRun();
        $lineId = (int) PayrollLine::query()->where('payroll_period_id', $runId)->value('id');

        $this->postJson("/api/v1/staff/payroll/{$runId}/finalize")
            ->assertOk()
            ->assertJsonPath('data.status', 'finalised')
            ->assertJsonPath('data.is_finalised', true)
            ->assertJsonPath('data.finalised_by_user_id', $manager->getKey())
            ->assertJsonPath('data.net_tiyin', 17_000_000);

        $this->assertNotNull(PayrollPeriod::query()->findOrFail($runId)->finalised_at);

        // Signing it twice is not a malformed request — somebody got there
        // first, or this is the second of two taps. 409, and the client
        // re-reads.
        $this->postJson("/api/v1/staff/payroll/{$runId}/finalize")
            ->assertApiError('staff.payroll_finalised');

        // The figures have been paid. Nothing moves them afterwards.
        $this->patchJson("/api/v1/staff/payroll/{$runId}/lines/{$lineId}", ['bonus_tiyin' => 5_000_000])
            ->assertApiError('staff.payroll_finalised');

        $this->postJson('/api/v1/staff/payroll', ['period' => self::MONTH])
            ->assertApiError('staff.payroll_finalised');

        $this->assertSame(0, (int) PayrollLine::query()->whereKey($lineId)->value('bonus_tiyin'));
    }

    public function test_a_run_with_no_lines_cannot_be_signed_off(): void
    {
        $this->actingAsManager();
        $this->memberAt($this->chilonzor);

        // Nobody clocked in: the run was built against the wrong venue, or
        // before the attendance was entered. Freezing it would produce an
        // uncorrectable record of zero.
        $runId = $this->openRun();

        $this->postJson("/api/v1/staff/payroll/{$runId}/finalize")
            ->assertApiError('staff.payroll_empty');

        $this->assertSame('draft', PayrollPeriod::query()->findOrFail($runId)->status);
    }

    // ============ Validation ============

    public function test_a_month_has_to_be_a_month(): void
    {
        $this->actingAsManager();

        // PHP's own parser rolls `2026-13` into January 2027 without complaint,
        // which would quietly open the wrong year.
        $this->postJson('/api/v1/staff/payroll', ['period' => '2026-13'])
            ->assertApiValidationErrors('period');

        $this->postJson('/api/v1/staff/payroll', ['period' => '26-8'])
            ->assertApiValidationErrors('period');

        $this->postJson('/api/v1/staff/payroll', ['period' => '2026-08-05'])
            ->assertApiValidationErrors('period');

        $this->assertSame(0, PayrollPeriod::query()->count());
    }

    public function test_the_computed_columns_are_not_writable_by_hand(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $this->worked($member, '2026-08-05 09:00:00', '2026-08-05 17:30:00', 510);

        $runId = $this->openRun();
        $lineId = (int) PayrollLine::query()->where('payroll_period_id', $runId)->value('id');

        $this->patchJson("/api/v1/staff/payroll/{$runId}/lines/{$lineId}", [
            'hourly_rate' => 9_000_000,
            'minutes_worked' => 99_999,
            'net_tiyin' => 1,
        ])->assertOk();

        // Silently ignored rather than accepted: correcting a missed clock-out
        // is a correction to the attendance row and a rebuild, not a figure
        // typed over the record of what happened.
        $line = PayrollLine::query()->findOrFail($lineId);
        $this->assertSame(self::RATE, $line->hourly_rate);
        $this->assertSame(510, $line->minutes_worked);
        $this->assertSame(17_000_000, $line->net_tiyin);
    }

    // ============ Permission ============

    public function test_a_waiter_may_neither_read_payroll_nor_sign_it_off(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $this->worked($member, '2026-08-05 09:00:00', '2026-08-05 17:30:00', 510);
        $runId = $this->openRun();

        $waiter = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $waiter->assignRole('waiter');
        $this->actingAs($waiter);

        // What everybody in the building earns is not a floor-level fact.
        $this->getJson('/api/v1/staff/payroll')->assertStatus(403);
        $this->getJson("/api/v1/staff/payroll/{$runId}")->assertStatus(403);
        $this->postJson("/api/v1/staff/payroll/{$runId}/finalize")->assertStatus(403);
        $this->postJson('/api/v1/staff/payroll', ['period' => '2026-09'])->assertStatus(403);
    }

    public function test_an_accountant_may_read_a_run_but_never_move_a_figure(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $this->worked($member, '2026-08-05 09:00:00', '2026-08-05 17:30:00', 510);
        $runId = $this->openRun();
        $lineId = (int) PayrollLine::query()->where('payroll_period_id', $runId)->value('id');

        $reader = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $reader->assignRole('accountant');
        $this->actingAs($reader);

        $this->getJson('/api/v1/staff/payroll')->assertOk()->assertJsonCount(1, 'data');
        $this->patchJson("/api/v1/staff/payroll/{$runId}/lines/{$lineId}", ['bonus_tiyin' => 1])
            ->assertStatus(403);
    }

    // ============ Tenant isolation ============

    public function test_another_restaurants_run_is_not_visible(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $this->worked($member, '2026-08-05 09:00:00', '2026-08-05 17:30:00', 510);
        $runId = $this->openRun();

        $other = Tenant::query()->create([
            'name' => 'Lagmon uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('branch-manager');
        $this->actingAs($stranger);

        $this->getJson('/api/v1/staff/payroll')->assertOk()->assertJsonCount(0, 'data');
        // Not "forbidden" — from here it does not exist.
        $this->getJson("/api/v1/staff/payroll/{$runId}")->assertStatus(404);
        $this->postJson("/api/v1/staff/payroll/{$runId}/finalize")->assertStatus(404);
    }

    public function test_a_second_restaurant_may_run_the_same_month(): void
    {
        $this->actingAsManager();
        $this->openRun();

        $other = Tenant::query()->create([
            'name' => 'Lagmon uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('branch-manager');
        $this->actingAs($stranger);

        // The uniqueness is per restaurant, so August is not taken globally —
        // the partial indexes are keyed on `tenant_id` first, and a platform
        // that refused the second restaurant's August would be a platform with
        // one customer.
        $this->postJson('/api/v1/staff/payroll', ['period' => self::MONTH])->assertCreated();

        // Each sees exactly its own, which is also the check that the second
        // POST did not quietly adopt the first restaurant's run.
        $this->getJson('/api/v1/staff/payroll')->assertOk()->assertJsonCount(1, 'data');
    }
}
