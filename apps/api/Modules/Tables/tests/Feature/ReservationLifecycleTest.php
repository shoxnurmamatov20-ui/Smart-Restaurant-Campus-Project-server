<?php

declare(strict_types=1);

namespace Modules\Tables\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Modules\Tables\Events\TableStateChanged;
use Modules\Tables\Models\Hall;
use Modules\Tables\Models\Reservation;
use Modules\Tables\Models\RestaurantTable;
use Tests\TestCase;

/**
 * A booking from the phone call to the empty table.
 *
 * `pending → confirmed → seated → completed`, with `no_show` and `cancelled`
 * as the two ways out. The last rung was missing, and its absence meant a party
 * who came, ate and left stayed `seated` for ever — so the diary never emptied
 * and the only way to close a booking was to file it under the same word as one
 * the guest called off.
 */
final class ReservationLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi',
            'slug' => 'osh-markazi',
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);

        $this->branch = Branch::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Chilonzor',
            'slug' => 'chilonzor',
            'code' => 'CHI',
            'city' => 'Toshkent',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);
    }

    private function actingAsRole(string $role): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);
        $this->actingAs($user);

        return $user;
    }

    private function table(string $label = 'A-7'): RestaurantTable
    {
        $hall = Hall::factory()->create(['tenant_id' => $this->tenant->id, 'branch_id' => $this->branch->id]);

        return RestaurantTable::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'hall_id' => $hall->id,
            'label' => $label,
        ]);
    }

    private function booking(array $attributes = []): Reservation
    {
        return Reservation::factory()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'status' => 'pending',
            'starts_at' => now()->addHours(3),
        ], $attributes));
    }

    // ============ Creating one from the console ============

    public function test_a_manager_books_a_table_for_a_named_venue(): void
    {
        $this->actingAsRole('branch-manager');
        $table = $this->table();

        $response = $this->postJson('/api/v1/tables/reservations', [
            'branch_id' => $this->branch->id,
            'restaurant_table_id' => $table->id,
            'guest_name' => 'Kamolov',
            'guest_phone' => '+998901234567',
            'guests_count' => 6,
            'starts_at' => now()->addHours(4)->toIso8601String(),
            'source' => 'phone',
        ])->assertCreated();

        $response->assertJsonPath('data.guest_name', 'Kamolov');
        $response->assertJsonPath('data.status', 'pending');
        // The venue, because an owner reading the whole business has no
        // `X-Branch` for `BelongsToBranch` to fill this from — and a booking with
        // no branch surfaces at every venue's diary at once.
        $response->assertJsonPath('data.branch_id', $this->branch->id);
    }

    public function test_a_waiter_cannot_take_a_booking(): void
    {
        $this->actingAsRole('waiter');

        $this->postJson('/api/v1/tables/reservations', [
            'guest_name' => 'Kamolov',
            'guest_phone' => '+998901234567',
            'guests_count' => 2,
            'starts_at' => now()->addHours(4)->toIso8601String(),
        ])->assertStatus(403);
    }

    // ============ The ladder ============

    public function test_the_whole_ladder_from_pending_to_completed(): void
    {
        $this->actingAsRole('host');
        $table = $this->table();
        $booking = $this->booking(['restaurant_table_id' => $table->id]);

        $this->postJson("/api/v1/tables/reservations/{$booking->id}/confirm")
            ->assertOk()->assertJsonPath('data.status', 'confirmed');

        $this->postJson("/api/v1/tables/reservations/{$booking->id}/seat")
            ->assertOk()->assertJsonPath('data.status', 'seated');

        // Seating moves the furniture too — a host who does one and forgets the
        // other leaves the floor map lying.
        $this->assertSame('occupied', $table->refresh()->status);

        $this->postJson("/api/v1/tables/reservations/{$booking->id}/complete")
            ->assertOk()->assertJsonPath('data.status', 'completed');

        // And the table is NOT cleared by completing the booking: the party
        // leaving means it needs turning, which is a floor action.
        $this->assertSame('occupied', $table->refresh()->status);
    }

    public function test_a_booking_that_was_never_seated_cannot_be_completed(): void
    {
        $this->actingAsRole('host');
        $booking = $this->booking();

        $this->postJson("/api/v1/tables/reservations/{$booking->id}/complete")
            ->assertStatus(422);

        $this->assertSame('pending', $booking->refresh()->status);
    }

    public function test_a_party_that_ate_can_never_be_marked_a_no_show(): void
    {
        $this->actingAsRole('host');
        $booking = $this->booking();

        $this->postJson("/api/v1/tables/reservations/{$booking->id}/no-show")
            ->assertOk()->assertJsonPath('data.status', 'no_show');

        $seated = $this->booking(['status' => 'seated']);

        // A no-show is a fact about a table that stayed empty. Marking a regular
        // who ate as one is how a restaurant blacklists its own customer.
        $this->postJson("/api/v1/tables/reservations/{$seated->id}/no-show")
            ->assertStatus(422);
        $this->assertSame('seated', $seated->refresh()->status);
    }

    public function test_a_completed_booking_is_out_of_the_upcoming_diary(): void
    {
        $this->actingAsRole('host');
        $done = $this->booking(['status' => 'seated']);
        $done->complete();

        $this->booking(['guest_name' => 'Tonight']);

        $response = $this->getJson('/api/v1/tables/reservations?filter[upcoming]=1')->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Tonight', $response->json('data.0.guest_name'));
    }

    public function test_another_restaurant_never_sees_the_diary(): void
    {
        $other = Tenant::query()->create([
            'name' => 'City Cafe',
            'slug' => 'city-cafe',
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);

        $this->booking(['guest_name' => 'Kamolov']);

        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('owner');
        $this->actingAs($stranger);

        $this->getJson('/api/v1/tables/reservations')->assertOk()->assertJsonCount(0, 'data');
    }

    // ============ The floor channel ============

    public function test_the_room_hears_about_a_table_changing_hands(): void
    {
        Event::fake([TableStateChanged::class]);

        $this->actingAsRole('host');
        $table = $this->table();

        $this->postJson("/api/v1/tables/tables/{$table->id}/status", ['status' => 'occupied'])
            ->assertOk();

        Event::assertDispatched(
            TableStateChanged::class,
            fn (TableStateChanged $event): bool => $event->tableId === $table->id
                && $event->branchId === $this->branch->id
                && $event->from === 'free'
                && $event->to === 'occupied'
                && $event->label === 'A-7',
        );
    }

    public function test_seating_a_booking_announces_the_table_too(): void
    {
        Event::fake([TableStateChanged::class]);

        $this->actingAsRole('host');
        $table = $this->table();
        $booking = $this->booking(['restaurant_table_id' => $table->id]);

        $this->postJson("/api/v1/tables/reservations/{$booking->id}/seat")->assertOk();

        // The whole reason the broadcast lives on the model: seating a booking
        // moves a table through code that has no idea a floor screen exists.
        Event::assertDispatched(
            TableStateChanged::class,
            fn (TableStateChanged $event): bool => $event->to === 'occupied',
        );
    }

    public function test_a_table_set_to_the_state_it_is_already_in_says_nothing(): void
    {
        Event::fake([TableStateChanged::class]);

        $this->actingAsRole('host');
        $table = $this->table();

        $this->postJson("/api/v1/tables/tables/{$table->id}/status", ['status' => 'free'])
            ->assertOk();

        // A no-op would otherwise redraw every handset in the building to report
        // that nothing happened.
        Event::assertNotDispatched(TableStateChanged::class);
    }

    public function test_the_floor_event_names_the_branch_channel(): void
    {
        $event = new TableStateChanged($this->branch->id, 7, 'A-7', 'free', 'occupied');

        $channels = array_map(static fn ($channel): string => (string) $channel->name, $event->broadcastOn());

        $this->assertSame(['private-branch.'.$this->branch->id.'.floor'], $channels);
        $this->assertSame('tables.table.changed', $event->broadcastAs());
    }
}
