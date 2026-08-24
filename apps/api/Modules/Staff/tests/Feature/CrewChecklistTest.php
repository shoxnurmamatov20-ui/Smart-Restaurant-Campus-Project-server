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
use Illuminate\Testing\TestResponse;
use Modules\Staff\Models\Shift;
use Modules\Staff\Models\StaffAction;
use Modules\Staff\Models\StaffMember;
use Tests\TestCase;

/**
 * The two verbs whose product is the journal, and the reads that give them
 * a point.
 *
 * A tick that only lives in a component is a tick a locked phone forgets, and
 * a cash declaration nobody can read back is a courier's word against a
 * cashier's count with no record between them. These cover the round trip:
 * queue it, read it back on the right trading day, and never read anybody
 * else's.
 */
final class CrewChecklistTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $chilonzor;

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
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function crew(string $role = 'waiter', ?Tenant $tenant = null, ?Branch $branch = null): StaffMember
    {
        $tenant ??= $this->tenant;
        $branch ??= $this->chilonzor;

        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $user->assignRole($role);

        $member = StaffMember::factory()->create([
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'user_id' => $user->getKey(),
            'status' => 'active',
        ]);

        $this->actingAs($user);

        return $member;
    }

    /** @param array<int, array<string, mixed>> $entries */
    private function send(array $entries): TestResponse
    {
        return $this->postJson('/api/v1/staff/actions', ['entries' => $entries]);
    }

    // ============ The cash declaration ============

    public function test_a_courier_can_declare_what_they_are_carrying(): void
    {
        $this->crew('courier');

        $this->send([[
            'local_id' => 'c-1',
            'kind' => 'cash_handover',
            'at' => now()->toIso8601String(),
            'payload' => ['amount_tiyin' => 24_000_000, 'drops' => 3],
        ]])->assertCreated()->assertJsonPath('data.results.0.status', 'applied');

        $row = StaffAction::query()->where('local_id', 'c-1')->firstOrFail();

        // The journal and nowhere else: the money moves when a cashier counts
        // it into a drawer against their own shift.
        $this->assertSame('staff.actions', $row->applied_to);
        $this->assertSame(24_000_000, $row->payload['amount_tiyin']);
    }

    public function test_declaring_nothing_is_refused_rather_than_stored_as_zero(): void
    {
        $this->crew('courier');

        $this->send([[
            'local_id' => 'c-2',
            'kind' => 'cash_handover',
            'at' => now()->toIso8601String(),
            'payload' => ['amount_tiyin' => 0],
        ]])->assertCreated()->assertJsonPath('data.results.0.reason', 'payload_incomplete');
    }

    public function test_an_implausible_amount_is_refused(): void
    {
        $this->crew('courier');

        // Two extra zeroes on a nine-hundred-thousand-so'm round. The cashier
        // would spend the evening looking for the difference.
        $this->send([[
            'local_id' => 'c-3',
            'kind' => 'cash_handover',
            'at' => now()->toIso8601String(),
            'payload' => ['amount_tiyin' => 90_000_000_000],
        ]])->assertCreated()->assertJsonPath('data.results.0.reason', 'amount_implausible');
    }

    // ============ Checklist ticks ============

    public function test_a_tick_is_recorded_and_read_back(): void
    {
        $this->crew('branch-manager');

        $this->send([[
            'local_id' => 'k-1',
            'kind' => 'checklist_tick',
            'at' => now()->toIso8601String(),
            'payload' => ['list' => 'closing', 'step' => 'fridges'],
        ]])->assertCreated()->assertJsonPath('data.results.0.status', 'applied');

        $this->getJson('/api/v1/staff/checklists/today')
            ->assertOk()
            ->assertJsonPath('data.ticks.0.list', 'closing')
            ->assertJsonPath('data.ticks.0.step', 'fridges');
    }

    public function test_an_unknown_run_through_is_refused(): void
    {
        $this->crew('branch-manager');

        // The server owns which list, so a month of ticks cannot end up split
        // between `closing` and `close`.
        $this->send([[
            'local_id' => 'k-2',
            'kind' => 'checklist_tick',
            'at' => now()->toIso8601String(),
            'payload' => ['list' => 'close', 'step' => 'fridges'],
        ]])->assertCreated()->assertJsonPath('data.results.0.reason', 'unknown_checklist');
    }

    public function test_the_last_declaration_is_the_one_that_is_read_back(): void
    {
        $this->crew('courier');

        $this->send([
            ['local_id' => 'c-4', 'kind' => 'cash_handover', 'at' => now()->subMinutes(20)->toIso8601String(), 'payload' => ['amount_tiyin' => 24_000_000]],
            ['local_id' => 'c-5', 'kind' => 'cash_handover', 'at' => now()->toIso8601String(), 'payload' => ['amount_tiyin' => 27_000_000]],
        ])->assertCreated();

        // Summing them would double the round; the figure the cashier counts
        // against is the one the rider stood behind last.
        $this->getJson('/api/v1/staff/checklists/today')
            ->assertOk()
            ->assertJsonPath('data.cash_handover.amount_tiyin', 27_000_000);
    }

    public function test_a_checklist_read_shows_only_the_askers_own_ticks(): void
    {
        $this->crew('branch-manager');
        $this->send([[
            'local_id' => 'k-3', 'kind' => 'checklist_tick', 'at' => now()->toIso8601String(),
            'payload' => ['list' => 'closing', 'step' => 'fridges'],
        ]])->assertCreated();

        // A second person on a second handset, in the same restaurant.
        $this->crew('courier');

        $this->getJson('/api/v1/staff/checklists/today')
            ->assertOk()
            ->assertJsonCount(0, 'data.ticks');
    }

    public function test_another_restaurants_ticks_are_invisible(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Boshqa', 'slug' => 'boshqa', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $otherBranch = Branch::factory()->named('Yunusobod', 'YUN')->create(['tenant_id' => $other->id]);

        app(TenantContext::class)->set($other);
        $this->crew('branch-manager', $other, $otherBranch);
        $this->send([[
            'local_id' => 'k-4', 'kind' => 'checklist_tick', 'at' => now()->toIso8601String(),
            'payload' => ['list' => 'closing', 'step' => 'fridges'],
        ]])->assertCreated();

        app(TenantContext::class)->set($this->tenant);
        $this->crew('branch-manager');

        $this->getJson('/api/v1/staff/checklists/today')
            ->assertOk()
            ->assertJsonCount(0, 'data.ticks');
    }

    public function test_a_nonsense_day_is_a_router_refusal_not_a_query(): void
    {
        $this->crew('branch-manager');

        // The route constrains `{day_key}`, so a stray segment never reaches a
        // Carbon parse.
        $this->getJson('/api/v1/staff/checklists/yesterday')->assertNotFound();
    }

    // ============ The swap form's read ============

    public function test_the_swap_form_gets_shift_ids_and_colleague_ids(): void
    {
        $member = $this->crew();

        $mine = Shift::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'staff_member_id' => $member->id,
            'starts_at' => now()->addDays(2)->setTime(10, 0),
            'ends_at' => now()->addDays(2)->setTime(22, 0),
            'status' => 'planned',
            'published_at' => now(),
        ]);

        $colleague = StaffMember::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'status' => 'active',
        ]);

        $answer = $this->getJson('/api/v1/staff/me/upcoming')->assertOk();

        $answer->assertJsonPath('data.shifts.0.id', $mine->id);
        $this->assertContains(
            $colleague->id,
            array_column($answer->json('data.colleagues'), 'id'),
        );

        // Three fields per colleague and no more: a waiter asking a cook to
        // cover Thursday must be able to name them, not read their wage.
        $first = $answer->json('data.colleagues.0');
        $this->assertSame(['id', 'full_name', 'position'], array_keys($first));
    }

    public function test_an_unpublished_shift_is_not_offered_for_swapping(): void
    {
        $member = $this->crew();

        Shift::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'staff_member_id' => $member->id,
            'starts_at' => now()->addDays(2)->setTime(10, 0),
            'ends_at' => now()->addDays(2)->setTime(22, 0),
            'status' => 'planned',
            'published_at' => null,
        ]);

        // Asking a colleague to cover a draft is asking about a promise that
        // has not been made.
        $this->getJson('/api/v1/staff/me/upcoming')->assertOk()->assertJsonCount(0, 'data.shifts');
    }

    public function test_a_shift_that_has_already_ended_is_not_offered(): void
    {
        $member = $this->crew();

        Shift::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'staff_member_id' => $member->id,
            'starts_at' => now()->subDays(2)->setTime(10, 0),
            'ends_at' => now()->subDays(2)->setTime(22, 0),
            'status' => 'completed',
            'published_at' => now()->subWeek(),
        ]);

        $this->getJson('/api/v1/staff/me/upcoming')->assertOk()->assertJsonCount(0, 'data.shifts');
    }

    public function test_somebody_who_is_not_on_the_rota_gets_an_empty_answer(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        // An owner covering a shift is signed in with no personnel row. The
        // form has to render and "you have no rostered shifts" is the truth.
        $this->getJson('/api/v1/staff/me/upcoming')
            ->assertOk()
            ->assertJsonCount(0, 'data.shifts')
            ->assertJsonCount(0, 'data.colleagues');
    }
}
