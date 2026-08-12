<?php

declare(strict_types=1);

namespace Modules\Staff\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\Shift;
use Modules\Staff\Models\StaffMember;
use Tests\TestCase;

/**
 * Staff and attendance. Payroll is computed from these rows, so the rules about
 * what may be recorded twice matter more than the CRUD.
 */
final class AttendanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsManager(): User
    {
        $user = User::factory()->create();
        $user->assignRole('branch-manager');
        $this->actingAs($user);

        return $user;
    }

    // ============ Auth & RBAC ============

    public function test_unauthenticated_user_cannot_list_staff(): void
    {
        $this->getJson('/api/v1/staff/members')->assertStatus(401);
    }

    public function test_waiter_cannot_read_the_staff_register(): void
    {
        $user = User::factory()->create();
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->getJson('/api/v1/staff/members')->assertStatus(403);
    }

    public function test_chef_can_read_staff_but_not_edit_them(): void
    {
        $user = User::factory()->create();
        $user->assignRole('chef');
        $this->actingAs($user);
        $member = StaffMember::factory()->create();

        $this->getJson('/api/v1/staff/members')->assertOk();
        $this->patchJson("/api/v1/staff/members/{$member->id}", ['position' => 'cook'])
            ->assertStatus(403);
    }

    // ============ Register ============

    public function test_manager_can_hire_someone(): void
    {
        $this->actingAsManager();

        $this->postJson('/api/v1/staff/members', [
            'employee_code' => 'EMP-0001',
            'first_name' => 'Dilnoza',
            'last_name' => 'Yusupova',
            'position' => 'waiter',
            'hourly_rate' => 2200000,
            'hired_at' => now()->subMonth()->toDateString(),
        ])
            ->assertCreated()
            ->assertJsonPath('data.employee_code', 'EMP-0001')
            ->assertJsonPath('data.full_name', 'Yusupova Dilnoza')
            ->assertJsonPath('data.status', 'active');
    }

    public function test_hiring_in_the_future_is_rejected(): void
    {
        $this->actingAsManager();

        $this->postJson('/api/v1/staff/members', [
            'employee_code' => 'EMP-X',
            'first_name' => 'A', 'last_name' => 'B', 'position' => 'cook',
            'hired_at' => now()->addWeek()->toDateString(),
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('hired_at');
    }

    public function test_an_unknown_position_is_rejected(): void
    {
        $this->actingAsManager();

        $this->postJson('/api/v1/staff/members', [
            'employee_code' => 'EMP-Y',
            'first_name' => 'A', 'last_name' => 'B', 'position' => 'sommelier',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('position');
    }

    public function test_an_expired_sanitary_book_is_flagged(): void
    {
        $this->actingAsManager();
        $member = StaffMember::factory()->expiredHealthBook()->create();

        $this->getJson("/api/v1/staff/members/{$member->id}")
            ->assertOk()
            ->assertJsonPath('data.health_book_expired', true);
    }

    // ============ Attendance ============

    public function test_check_in_then_check_out_records_the_minutes_worked(): void
    {
        $this->actingAsManager();
        $member = StaffMember::factory()->create(['hourly_rate' => 3000000]);

        $this->postJson('/api/v1/staff/attendance/check-in', [
            'staff_member_id' => $member->id,
            'method' => 'face',
        ])
            ->assertCreated()
            ->assertJsonPath('data.is_open', true)
            ->assertJsonPath('data.method', 'face');

        // Rewind the clock so the shift has measurable length.
        Attendance::query()->where('staff_member_id', $member->id)
            ->update(['checked_in_at' => now()->subHours(4)]);

        $this->postJson('/api/v1/staff/attendance/check-out', ['staff_member_id' => $member->id])
            ->assertOk()
            ->assertJsonPath('data.is_open', false)
            ->assertJsonPath('data.minutes_worked', 240)
            ->assertJsonPath('data.earned_tiyin', 12000000); // 4h x 30 000 so'm
    }

    public function test_someone_cannot_check_in_twice(): void
    {
        $this->actingAsManager();
        $member = StaffMember::factory()->create();

        $this->postJson('/api/v1/staff/attendance/check-in', ['staff_member_id' => $member->id])
            ->assertCreated();

        // A double check-in would pay the same hours twice.
        $this->postJson('/api/v1/staff/attendance/check-in', ['staff_member_id' => $member->id])
            ->assertStatus(422);

        $this->assertSame(1, Attendance::where('staff_member_id', $member->id)->count());
    }

    public function test_check_out_without_an_open_shift_is_refused(): void
    {
        $this->actingAsManager();
        $member = StaffMember::factory()->create();

        $this->postJson('/api/v1/staff/attendance/check-out', ['staff_member_id' => $member->id])
            ->assertStatus(422);
    }

    public function test_a_terminated_employee_cannot_clock_in(): void
    {
        $this->actingAsManager();
        $member = StaffMember::factory()->terminated()->create();

        $this->postJson('/api/v1/staff/attendance/check-in', ['staff_member_id' => $member->id])
            ->assertStatus(422);
    }

    public function test_open_filter_shows_who_is_on_shift_right_now(): void
    {
        $this->actingAsManager();
        Attendance::factory()->count(2)->create();
        Attendance::factory()->count(3)->closed()->create();

        $this->getJson('/api/v1/staff/attendances?filter[open]=1')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    // ============ Rota ============

    public function test_a_shift_must_end_after_it_starts(): void
    {
        $this->actingAsManager();
        $member = StaffMember::factory()->create();

        $this->postJson('/api/v1/staff/shifts', [
            'staff_member_id' => $member->id,
            'starts_at' => now()->addDay()->setTime(18, 0)->toIso8601String(),
            'ends_at' => now()->addDay()->setTime(10, 0)->toIso8601String(),
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('ends_at');
    }

    public function test_planned_hours_are_derived_from_the_slot(): void
    {
        $this->actingAsManager();
        $member = StaffMember::factory()->create();

        $this->postJson('/api/v1/staff/shifts', [
            'staff_member_id' => $member->id,
            'starts_at' => now()->addDay()->setTime(10, 0)->toIso8601String(),
            'ends_at' => now()->addDay()->setTime(22, 0)->toIso8601String(),
        ])
            ->assertCreated()
            ->assertJsonPath('data.planned_hours', 12);
    }

    public function test_upcoming_filter_hides_past_shifts(): void
    {
        $this->actingAsManager();
        Shift::factory()->count(2)->create();
        Shift::factory()->count(3)->past()->create();

        $this->getJson('/api/v1/staff/shifts?filter[upcoming]=1')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    // ============ Module info ============

    public function test_module_info_reports_who_is_on_shift(): void
    {
        $this->actingAsManager();
        $onShift = StaffMember::factory()->count(4)->create();
        StaffMember::factory()->terminated()->create();
        StaffMember::factory()->expiredHealthBook()->create();

        // Attach the open records to existing people — Attendance::factory()
        // would otherwise hire two more and inflate the active count.
        foreach ($onShift->take(2) as $member) {
            Attendance::factory()->create(['staff_member_id' => $member->id]);
        }

        $this->getJson('/api/v1/staff/')
            ->assertOk()
            ->assertJsonPath('module', 'Staff')
            ->assertJsonPath('counts.members_active', 5)
            ->assertJsonPath('counts.on_shift_now', 2)
            ->assertJsonPath('counts.health_books_expired', 1);
    }

    // ============ Tenant isolation ============

    public function test_one_restaurant_never_sees_another_restaurants_staff(): void
    {
        $a = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        StaffMember::factory()->count(3)->create(['tenant_id' => $a->id]);

        $user = User::factory()->create(['tenant_id' => $a->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/staff/members')->assertOk()->assertJsonCount(3, 'data');

        // Asking for another restaurant is refused outright: an empty list
        // would read as "no data" and hide the attempt entirely.
        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/staff/members')
            ->assertStatus(403)
            ->assertJsonPath('code', 'TENANT_MISMATCH');
    }
}
