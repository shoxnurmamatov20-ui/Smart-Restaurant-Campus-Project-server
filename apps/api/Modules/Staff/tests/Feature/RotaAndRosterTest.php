<?php

declare(strict_types=1);

namespace Modules\Staff\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Auth\PinCredentials;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Staff\Database\Seeders\StaffDatabaseSeeder;
use Modules\Staff\Database\Seeders\StaffShiftSeeder;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\Shift;
use Modules\Staff\Models\ShiftSwap;
use Modules\Staff\Models\StaffMember;
use Tests\TestCase;

/**
 * Publishing a week, swapping out of a shift, and the roster columns.
 *
 * The three things a manager's staff screens do that the API could not answer:
 * a rota that stays a draft until it is promised, a way out of a Thursday, and
 * the derived columns — turnout, last shift, whether somebody can sign in — the
 * console had nothing to draw.
 */
final class RotaAndRosterTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $chilonzor;

    private Branch $termiz;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

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

    private function actingAsManager(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('branch-manager');
        $this->actingAs($user);

        return $user;
    }

    private function memberAt(Branch $branch, string $name = 'Jasur'): StaffMember
    {
        return StaffMember::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $branch->id,
            'first_name' => $name,
            'status' => 'active',
        ]);
    }

    private function shiftFor(StaffMember $member, int $daysAhead = 2, ?string $publishedAt = null): Shift
    {
        $starts = now()->addDays($daysAhead)->startOfHour();

        return Shift::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $member->branch_id,
            'staff_member_id' => $member->id,
            'starts_at' => $starts,
            'ends_at' => $starts->copy()->addHours(9),
            'status' => 'planned',
            'published_at' => $publishedAt,
        ]);
    }

    // ============ Publishing ============

    public function test_publishing_stamps_the_week_and_names_who_is_on_it(): void
    {
        $this->actingAsManager();
        $one = $this->memberAt($this->chilonzor, 'Jasur');
        $two = $this->memberAt($this->chilonzor, 'Nodira');
        $this->shiftFor($one, 2);
        $this->shiftFor($two, 3);

        $this->postJson('/api/v1/staff/shifts/publish', [
            'from' => now()->toDateString(),
            'to' => now()->addDays(7)->toDateString(),
        ])
            ->assertOk()
            ->assertJsonPath('data.published', 2)
            ->assertJsonCount(2, 'data.staff_member_ids');

        $this->assertSame(0, Shift::query()->whereNull('published_at')->count());
    }

    public function test_republishing_does_not_move_an_earlier_promise(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $promised = now()->subDays(4)->startOfHour();
        $old = $this->shiftFor($member, 2, $promised->toDateTimeString());
        $new = $this->shiftFor($member, 4);

        $this->postJson('/api/v1/staff/shifts/publish', [
            'from' => now()->toDateString(),
            'to' => now()->addDays(7)->toDateString(),
        ])->assertOk()->assertJsonPath('data.published', 1);

        // The one thing a disputed rota turns on is when the week was actually
        // promised. Re-stamping everybody would erase it.
        $this->assertSame(
            $promised->toDateTimeString(),
            $old->refresh()->published_at?->toDateTimeString(),
        );
        $this->assertNotNull($new->refresh()->published_at);
    }

    public function test_publishing_nothing_says_nothing(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $this->shiftFor($member, 2, now()->toDateTimeString());

        // A manager pressing the button to check must not notify a kitchen
        // that its rota has changed.
        $this->postJson('/api/v1/staff/shifts/publish', [
            'from' => now()->toDateString(),
            'to' => now()->addDays(7)->toDateString(),
        ])
            ->assertOk()
            ->assertJsonPath('data.published', 0)
            ->assertJsonPath('data.published_at', null);
    }

    public function test_a_waiter_cannot_publish_the_week(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->postJson('/api/v1/staff/shifts/publish', [
            'from' => now()->toDateString(), 'to' => now()->addDay()->toDateString(),
        ])->assertStatus(403);
    }

    public function test_the_range_has_to_be_a_range(): void
    {
        $this->actingAsManager();

        $this->postJson('/api/v1/staff/shifts/publish', [
            'from' => now()->addWeek()->toDateString(),
            'to' => now()->toDateString(),
        ])->assertApiValidationErrors('to');
    }

    public function test_the_rota_can_be_narrowed_to_what_was_actually_promised(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $this->shiftFor($member, 2, now()->toDateTimeString());
        $this->shiftFor($member, 5);

        $this->getJson('/api/v1/staff/shifts?filter[published]=1')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        // The board itself still sees the draft — it is the thing being built.
        $this->getJson('/api/v1/staff/shifts')->assertOk()->assertJsonCount(2, 'data');
    }

    // ============ Swaps ============

    public function test_a_swap_hands_the_shift_over_and_records_why(): void
    {
        $this->actingAsManager();
        $leaving = $this->memberAt($this->chilonzor, 'Jasur');
        $covering = $this->memberAt($this->chilonzor, 'Nodira');
        $shift = $this->shiftFor($leaving, 2, now()->toDateTimeString());

        $swap = $this->postJson('/api/v1/staff/shift-swaps', [
            'shift_id' => $shift->id,
            'reason' => 'To\'yga boraman',
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/v1/staff/shift-swaps/{$swap}/approve", [
            'offered_to_id' => $covering->id,
            'note' => 'Nodira roziligini berdi',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $this->assertSame($covering->id, $shift->refresh()->staff_member_id);
        // The slot is still work somebody has to turn up for, so it stays on
        // the published rota rather than becoming `swapped` and dropping off.
        $this->assertSame('planned', $shift->status);
    }

    public function test_an_open_request_cannot_be_approved_without_naming_a_taker(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $shift = $this->shiftFor($member, 2, now()->toDateTimeString());

        $swap = $this->postJson('/api/v1/staff/shift-swaps', ['shift_id' => $shift->id])
            ->assertCreated()->json('data.id');

        // A Saturday with a gap in it that reads as covered.
        $this->postJson("/api/v1/staff/shift-swaps/{$swap}/approve")
            ->assertApiError('shift.swap_needs_a_taker', 'offered_to_id');

        $this->assertSame($member->id, $shift->refresh()->staff_member_id);
    }

    public function test_one_open_request_per_shift(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $shift = $this->shiftFor($member, 2, now()->toDateTimeString());

        $this->postJson('/api/v1/staff/shift-swaps', ['shift_id' => $shift->id])->assertCreated();

        $this->postJson('/api/v1/staff/shift-swaps', ['shift_id' => $shift->id])
            ->assertApiError('shift.swap_already_pending', 'shift_id');
    }

    public function test_a_refused_request_may_be_asked_again(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $shift = $this->shiftFor($member, 2, now()->toDateTimeString());

        $first = $this->postJson('/api/v1/staff/shift-swaps', ['shift_id' => $shift->id])
            ->assertCreated()->json('data.id');
        $this->postJson("/api/v1/staff/shift-swaps/{$first}/reject", ['note' => 'Hech kim yo\'q'])->assertOk();

        // The uniqueness only holds while a request is open — a shift refused
        // once and asked about again next week is two rows of history.
        $this->postJson('/api/v1/staff/shift-swaps', ['shift_id' => $shift->id])->assertCreated();

        $this->assertSame(2, ShiftSwap::query()->where('shift_id', $shift->id)->count());
    }

    public function test_a_decided_request_cannot_be_decided_again(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $covering = $this->memberAt($this->chilonzor, 'Nodira');
        $shift = $this->shiftFor($member, 2, now()->toDateTimeString());

        $swap = $this->postJson('/api/v1/staff/shift-swaps', ['shift_id' => $shift->id])
            ->assertCreated()->json('data.id');
        $this->postJson("/api/v1/staff/shift-swaps/{$swap}/approve", ['offered_to_id' => $covering->id])->assertOk();

        $this->postJson("/api/v1/staff/shift-swaps/{$swap}/reject")
            ->assertApiError('shift.swap_already_decided');
    }

    public function test_a_shift_that_is_over_cannot_be_swapped_out_of(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $shift = $this->shiftFor($member, -3, now()->toDateTimeString());

        $this->postJson('/api/v1/staff/shift-swaps', ['shift_id' => $shift->id])
            ->assertApiError('shift.already_over', 'shift_id');
    }

    public function test_a_shift_cannot_be_handed_to_the_person_already_on_it(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $shift = $this->shiftFor($member, 2, now()->toDateTimeString());

        $this->postJson('/api/v1/staff/shift-swaps', [
            'shift_id' => $shift->id, 'offered_to_id' => $member->id,
        ])->assertApiError('shift.swap_to_self', 'offered_to_id');
    }

    public function test_an_accountant_may_read_swaps_but_never_decide_one(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $shift = $this->shiftFor($member, 2, now()->toDateTimeString());
        $swap = $this->postJson('/api/v1/staff/shift-swaps', ['shift_id' => $shift->id])
            ->assertCreated()->json('data.id');

        $reader = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $reader->assignRole('accountant');
        $this->actingAs($reader);

        $this->getJson('/api/v1/staff/shift-swaps')->assertOk();
        $this->postJson("/api/v1/staff/shift-swaps/{$swap}/approve")->assertStatus(403);
    }

    // ============ The roster's derived columns ============

    public function test_the_roster_reports_turnout_against_the_rota(): void
    {
        $manager = $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);

        // Three shifts that have already started; two turned up for.
        foreach ([-5, -4, -3] as $index => $daysBack) {
            $starts = now()->subDays(abs($daysBack))->startOfDay()->addHours(10);

            Shift::factory()->create([
                'tenant_id' => $this->tenant->id,
                'branch_id' => $this->chilonzor->id,
                'staff_member_id' => $member->id,
                'starts_at' => $starts,
                'ends_at' => $starts->copy()->addHours(9),
                'status' => 'confirmed',
                'published_at' => now()->subDays(10),
            ]);

            if ($index === 2) {
                continue;
            }

            Attendance::factory()->create([
                'tenant_id' => $this->tenant->id,
                'branch_id' => $this->chilonzor->id,
                'staff_member_id' => $member->id,
                'checked_in_at' => $starts->copy()->addMinutes(2),
                'checked_out_at' => $starts->copy()->addHours(9),
            ]);
        }

        $this->getJson('/api/v1/staff/members')
            ->assertOk()
            ->assertJsonPath('data.0.shifts_due', 3)
            ->assertJsonPath('data.0.shifts_attended', 2)
            ->assertJsonPath('data.0.attendance_rate', 67)
            ->assertJsonPath('data.0.has_pin', false);

        // And the PIN column is one bit, from the core credential store.
        app(PinCredentials::class)->set($manager, '4271');
        $member->forceFill(['user_id' => $manager->getKey()])->save();

        $this->getJson('/api/v1/staff/members')->assertOk()->assertJsonPath('data.0.has_pin', true);
    }

    public function test_somebody_with_no_rostered_history_has_no_turnout_figure(): void
    {
        $this->actingAsManager();
        $this->memberAt($this->chilonzor);

        // Null, not zero. Zero reads as "never turns up", which is the opposite
        // of what an empty history means.
        $this->getJson('/api/v1/staff/members')
            ->assertOk()
            ->assertJsonPath('data.0.attendance_rate', null);
    }

    public function test_a_shift_still_ahead_is_not_counted_against_turnout(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $this->shiftFor($member, 3, now()->toDateTimeString());

        // Otherwise every rate falls as the week is published.
        $this->getJson('/api/v1/staff/members')
            ->assertOk()
            ->assertJsonPath('data.0.shifts_due', 0)
            ->assertJsonPath('data.0.attendance_rate', null);
    }

    // ============ Branch isolation ============

    public function test_an_empty_branch_is_a_roll_up_and_a_named_one_is_a_wall(): void
    {
        $this->actingAsManager();
        $this->memberAt($this->chilonzor, 'Jasur');
        $this->memberAt($this->termiz, 'Sardor');

        // No X-Branch: every venue, which is what an owner's roster reads.
        $this->withHeaders(['X-Tenant' => $this->tenant->slug])
            ->getJson('/api/v1/staff/members')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        // Named: that venue only.
        $this->withHeaders(['X-Tenant' => $this->tenant->slug, 'X-Branch' => $this->termiz->slug])
            ->getJson('/api/v1/staff/members')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.first_name', 'Sardor');
    }

    public function test_the_rota_is_narrowed_by_branch_too(): void
    {
        $this->actingAsManager();
        $here = $this->memberAt($this->chilonzor, 'Jasur');
        $there = $this->memberAt($this->termiz, 'Sardor');
        $this->shiftFor($here, 2, now()->toDateTimeString());
        $this->shiftFor($there, 2, now()->toDateTimeString());

        $this->withHeaders(['X-Tenant' => $this->tenant->slug, 'X-Branch' => $this->chilonzor->slug])
            ->getJson('/api/v1/staff/shifts')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.staff_member_id', $here->id);
    }

    public function test_publishing_at_one_venue_leaves_the_other_alone(): void
    {
        $this->actingAsManager();
        $here = $this->memberAt($this->chilonzor, 'Jasur');
        $there = $this->memberAt($this->termiz, 'Sardor');
        $mine = $this->shiftFor($here, 2);
        $theirs = $this->shiftFor($there, 2);

        $this->withHeaders(['X-Tenant' => $this->tenant->slug, 'X-Branch' => $this->chilonzor->slug])
            ->postJson('/api/v1/staff/shifts/publish', [
                'from' => now()->toDateString(),
                'to' => now()->addDays(7)->toDateString(),
            ])
            ->assertOk()
            ->assertJsonPath('data.published', 1);

        $this->assertNotNull($mine->refresh()->published_at);
        // A manager at Chilonzor must not promise Termiz's week for them.
        $this->assertNull($theirs->refresh()->published_at);
    }

    // ============ The seeded week ============

    public function test_the_seeded_rota_arrives_published(): void
    {
        $this->actingAsManager();
        $this->seed(StaffDatabaseSeeder::class);
        $this->seed(StaffShiftSeeder::class);

        $shifts = Shift::query()->count();

        $this->assertGreaterThan(0, $shifts);
        // A seeded rota that stayed a draft would draw an empty week on every
        // screen that reads the promise rather than the manager's working copy
        // — the crew app's own day among them.
        $this->assertSame($shifts, Shift::query()->published()->count());
    }

    // ============ Tenant isolation ============

    public function test_another_restaurants_shift_cannot_be_swapped(): void
    {
        $this->actingAsManager();
        $member = $this->memberAt($this->chilonzor);
        $shift = $this->shiftFor($member, 2, now()->toDateTimeString());

        $other = Tenant::query()->create([
            'name' => 'Lagmon uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('branch-manager');
        $this->actingAs($stranger);

        $this->postJson('/api/v1/staff/shift-swaps', ['shift_id' => $shift->id])
            ->assertApiValidationErrors('shift_id');
    }
}
