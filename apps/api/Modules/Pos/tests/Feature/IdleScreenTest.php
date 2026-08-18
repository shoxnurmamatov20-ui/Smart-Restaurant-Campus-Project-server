<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Payment;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Services\TerminalPairing;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\StaffMember;
use Modules\Tables\Models\Hall;
use Modules\Tables\Models\RestaurantTable;
use Tests\TestCase;

/**
 * What a till shows all day when nobody is signed in.
 *
 * The idle screen renders before any PIN exists, so the device token is the
 * only credential in the room. Everything here is about that being enough and
 * not more: the payload is scoped to the terminal's own branch, it refuses a
 * user token outright, and the three live figures reach it through core
 * contracts because the till must not import Tables, Staff or Finance.
 */
final class IdleScreenTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $chilonzor;

    private Branch $yunusobod;

    private Terminal $terminal;

    private string $deviceToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->chilonzor = $this->branch('Chilonzor', 'chilonzor');
        $this->yunusobod = $this->branch('Yunusobod', 'yunusobod');

        $this->terminal = Terminal::factory()->create([
            'code' => 'POS-3',
            'name' => 'Kirish',
            'mode' => 'counter',
            'branch_id' => $this->chilonzor->id,
        ]);

        $code = app(TerminalPairing::class)->issueCode($this->terminal);
        $paired = app(TerminalPairing::class)->redeem($code, 'test-device');
        $this->deviceToken = $paired['token']->plainTextToken;
    }

    private function branch(string $name, string $slug): Branch
    {
        return Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => $name, 'slug' => $slug,
            'city' => 'Toshkent', 'address' => 'Bunyodkor shoh ko\'chasi 12',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    /** @return TestResponse */
    private function idle(?string $token = null)
    {
        return $this->withHeaders([
            'Authorization' => 'Bearer '.($token ?? $this->deviceToken),
            'X-Tenant' => $this->tenant->slug,
        ])->getJson('/api/v1/pos/idle');
    }

    private function tablesIn(Branch $branch, string $status, int $count): void
    {
        $hall = Hall::factory()->create(['branch_id' => $branch->id]);

        RestaurantTable::factory()->count($count)->create([
            'hall_id' => $hall->id,
            'branch_id' => $branch->id,
            'status' => $status,
            'is_active' => true,
        ]);
    }

    // ============ Who may look ============

    public function test_a_paired_device_may_read_its_own_idle_screen(): void
    {
        $this->idle()
            ->assertOk()
            ->assertJsonPath('terminal.code', 'POS-3')
            ->assertJsonPath('branch.name', 'Chilonzor')
            ->assertJsonPath('restaurant.name', 'Osh Markazi');
    }

    public function test_the_screen_carries_the_venue_address_the_design_prints(): void
    {
        // The design's idle line is "Chilonzor filiali · Bunyodkor shoh
        // ko'chasi 12" — the address is part of the screen, not decoration, and
        // a guest reading it is how they know which venue they are standing in.
        $this->idle()
            ->assertOk()
            ->assertJsonPath('branch.address', 'Bunyodkor shoh ko\'chasi 12')
            ->assertJsonPath('branch.city', 'Toshkent');
    }

    public function test_an_unauthenticated_tablet_is_refused(): void
    {
        $this->getJson('/api/v1/pos/idle')->assertUnauthorized();
    }

    public function test_a_user_token_is_refused_even_for_the_owner(): void
    {
        // Not an oversight — the payload is scoped by the TERMINAL's branch,
        // and a user has no terminal. Answering an owner's token would mean
        // guessing which till they meant.
        $owner = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $owner->assignRole('owner');

        $this->idle($owner->createToken('console')->plainTextToken)
            ->assertApiError('pos.terminal_token_required');
    }

    public function test_a_switched_off_till_stops_answering_at_once(): void
    {
        // Taking a till out of service has to bite immediately, not when its
        // device token eventually expires — that is the whole point of being
        // able to switch one off from the back office.
        $this->terminal->forceFill(['status' => 'disabled'])->save();

        $this->idle()->assertApiError('pos.terminal_disabled');
    }

    public function test_the_heartbeat_accepts_a_device_token(): void
    {
        $this->withHeaders([
            'Authorization' => 'Bearer '.$this->deviceToken,
            'X-Tenant' => $this->tenant->slug,
        ])->postJson('/api/v1/pos/terminals/heartbeat')->assertOk();
    }

    /**
     * Deliberately a second test rather than a second request in the one above.
     *
     * Sanctum's guard caches the user it resolved on the guard instance, and
     * that instance lives in the container for the whole test method — so a
     * second request with a different bearer token is still answered as the
     * first token's owner. Written as one test, this passed while proving
     * nothing: the owner's request came back as the terminal's own heartbeat,
     * 200 and all. One authentication per test.
     */
    public function test_the_heartbeat_refuses_a_user_token(): void
    {
        // Same gate as the idle screen — the two device endpoints must not
        // drift apart, because a person's token names no till.
        $owner = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $owner->assignRole('owner');

        $this->withHeaders([
            'Authorization' => 'Bearer '.$owner->createToken('console')->plainTextToken,
            'X-Tenant' => $this->tenant->slug,
        ])->postJson('/api/v1/pos/terminals/heartbeat')
            ->assertApiError('pos.terminal_token_required');
    }

    // ============ The four figures ============

    public function test_the_room_counts_come_from_the_floor_plan(): void
    {
        $this->tablesIn($this->chilonzor, 'occupied', 3);
        $this->tablesIn($this->chilonzor, 'reserved', 2);
        $this->tablesIn($this->chilonzor, 'free', 7);
        $this->tablesIn($this->chilonzor, 'cleaning', 4);

        $this->idle()
            ->assertOk()
            // A reserved table cannot be given away, so from the doorway it is
            // taken: 3 + 2.
            ->assertJsonPath('stats.occupied_tables', 5)
            ->assertJsonPath('stats.free_tables', 7);
    }

    public function test_a_table_being_cleaned_is_neither_occupied_nor_free(): void
    {
        // The two counts deliberately do not add up to the room. A host cannot
        // seat anyone at a table being wiped, and nobody is sitting at it —
        // forcing it into one bucket would make one of the two numbers a lie.
        $this->tablesIn($this->chilonzor, 'cleaning', 6);

        $this->idle()
            ->assertOk()
            ->assertJsonPath('stats.occupied_tables', 0)
            ->assertJsonPath('stats.free_tables', 0);
    }

    public function test_the_counts_are_scoped_to_this_tills_branch(): void
    {
        $this->tablesIn($this->chilonzor, 'occupied', 2);
        $this->tablesIn($this->yunusobod, 'occupied', 9);

        // A till at the door in Chilonzor showing Yunusobod's room would send
        // a host to a table in another district.
        $this->idle()->assertOk()->assertJsonPath('stats.occupied_tables', 2);
    }

    public function test_on_shift_counts_people_in_the_building_not_the_rota(): void
    {
        $member = StaffMember::factory()->create(['branch_id' => $this->chilonzor->id]);
        $other = StaffMember::factory()->create(['branch_id' => $this->chilonzor->id]);
        $elsewhere = StaffMember::factory()->create(['branch_id' => $this->yunusobod->id]);

        // Two checked in here, one of them already gone home, one checked in
        // at the other branch.
        Attendance::factory()->create([
            'staff_member_id' => $member->id, 'branch_id' => $this->chilonzor->id,
            'checked_in_at' => now()->subHours(3), 'checked_out_at' => null,
        ]);
        Attendance::factory()->create([
            'staff_member_id' => $other->id, 'branch_id' => $this->chilonzor->id,
            'checked_in_at' => now()->subHours(8), 'checked_out_at' => now()->subHour(),
        ]);
        Attendance::factory()->create([
            'staff_member_id' => $elsewhere->id, 'branch_id' => $this->yunusobod->id,
            'checked_in_at' => now()->subHours(2), 'checked_out_at' => null,
        ]);

        $this->idle()->assertOk()->assertJsonPath('stats.on_shift', 1);
    }

    public function test_takings_are_todays_captured_money_in_tiyin(): void
    {
        $shift = CashShift::factory()->create(['branch_id' => $this->chilonzor->id]);

        Payment::factory()->create([
            'cash_shift_id' => $shift->id, 'amount' => 4_500_000, 'status' => 'captured',
        ]);
        Payment::factory()->create([
            'cash_shift_id' => $shift->id, 'amount' => 1_500_000, 'status' => 'captured',
        ]);
        // Refunded money went back — it is not takings.
        Payment::factory()->create([
            'cash_shift_id' => $shift->id, 'amount' => 9_000_000, 'status' => 'refunded',
        ]);

        $this->idle()->assertOk()->assertJsonPath('stats.takings_tiyin', 6_000_000);
    }

    public function test_takings_are_scoped_to_this_tills_branch(): void
    {
        // Payments carry no branch — money belongs to a shift, the shift to a
        // branch. So this is the join that could silently show the whole chain's
        // turnover on one door terminal.
        $here = CashShift::factory()->create(['branch_id' => $this->chilonzor->id]);
        $there = CashShift::factory()->create(['branch_id' => $this->yunusobod->id]);

        Payment::factory()->create([
            'cash_shift_id' => $here->id, 'amount' => 2_000_000, 'status' => 'captured',
        ]);
        Payment::factory()->create([
            'cash_shift_id' => $there->id, 'amount' => 50_000_000, 'status' => 'captured',
        ]);

        $this->idle()->assertOk()->assertJsonPath('stats.takings_tiyin', 2_000_000);
    }

    public function test_yesterdays_money_is_not_todays_takings(): void
    {
        $shift = CashShift::factory()->create(['branch_id' => $this->chilonzor->id]);

        Payment::factory()->create([
            'cash_shift_id' => $shift->id, 'amount' => 7_000_000, 'status' => 'captured',
            'business_date' => now()->subDay()->toDateString(),
        ]);

        $this->idle()->assertOk()->assertJsonPath('stats.takings_tiyin', 0);
    }

    // ============ Liveness ============

    public function test_reading_the_idle_screen_is_proof_of_life(): void
    {
        // A till at the entrance may idle all day and never send a heartbeat.
        // Without this it would read "offline" on the manager's screen while
        // sitting there working perfectly.
        $this->terminal->forceFill(['last_seen_at' => now()->subHours(4)])->save();

        $this->idle()->assertOk();

        $this->assertTrue(
            $this->terminal->refresh()->last_seen_at?->gt(now()->subMinute()) ?? false,
            'Reading the idle screen must refresh last_seen_at',
        );
    }

    public function test_the_business_date_is_the_trading_day(): void
    {
        $this->idle()
            ->assertOk()
            ->assertJsonStructure(['business_date', 'server_time']);
    }
}
