<?php

declare(strict_types=1);

namespace Modules\Tables\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Tables\Models\Hall;
use Modules\Tables\Models\Reservation;
use Modules\Tables\Models\RestaurantTable;
use Tests\TestCase;

/**
 * Feature tests for the Tables module — halls, floor plan and reservations.
 */
final class TablesControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    /** The owner is the only role with delete on every module. */
    private function actingAsOwner(): User
    {
        $user = User::factory()->create();
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    private function actingAsHost(): User
    {
        $user = User::factory()->create();
        $user->assignRole('host');
        $this->actingAs($user);

        return $user;
    }

    // ============ Auth & RBAC ============

    public function test_unauthenticated_user_cannot_list_tables(): void
    {
        $this->getJson('/api/v1/tables/tables')->assertStatus(401);
    }

    public function test_cook_has_no_access_to_the_floor_plan(): void
    {
        $user = User::factory()->create();
        $user->assignRole('cook');
        $this->actingAs($user);

        $this->getJson('/api/v1/tables/tables')->assertStatus(403);
    }

    public function test_host_can_read_and_seat_but_not_delete(): void
    {
        $this->actingAsHost();
        $table = RestaurantTable::factory()->create();

        $this->getJson('/api/v1/tables/tables')->assertOk();
        $this->postJson("/api/v1/tables/tables/{$table->id}/status", ['status' => 'occupied'])->assertOk();
        $this->deleteJson("/api/v1/tables/tables/{$table->id}")->assertStatus(403);
    }

    // ============ Halls ============

    public function test_owner_can_create_a_hall(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/v1/tables/halls', [
            'code' => 'MAIN',
            'name' => 'Asosiy zal',
            'capacity' => 48,
        ])
            ->assertCreated()
            ->assertJsonPath('data.code', 'MAIN')
            ->assertJsonPath('data.name', 'Asosiy zal');

        $this->assertDatabaseHas('halls', ['code' => 'MAIN', 'capacity' => 48]);
    }

    public function test_hall_code_is_unique_per_restaurant(): void
    {
        $this->actingAsOwner();
        Hall::factory()->create(['code' => 'MAIN']);

        $this->postJson('/api/v1/tables/halls', ['code' => 'MAIN', 'name' => 'Ikkinchi zal'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('code');
    }

    public function test_hall_listing_includes_table_counts(): void
    {
        $this->actingAsOwner();
        $hall = Hall::factory()->create();
        RestaurantTable::factory()->count(3)->inHall($hall)->create();

        $this->getJson('/api/v1/tables/halls')
            ->assertOk()
            ->assertJsonPath('data.0.tables_count', 3);
    }

    // ============ Tables ============

    public function test_owner_can_create_and_soft_delete_a_table(): void
    {
        $this->actingAsOwner();
        $hall = Hall::factory()->create();

        $id = $this->postJson('/api/v1/tables/tables', [
            'hall_id' => $hall->id,
            'label' => 'A-7',
            'seats' => 4,
            'kind' => 'regular',
        ])
            ->assertCreated()
            ->assertJsonPath('data.label', 'A-7')
            ->assertJsonPath('data.status', 'free')
            ->json('data.id');

        $this->deleteJson("/api/v1/tables/tables/{$id}")->assertNoContent();
        $this->assertSoftDeleted('restaurant_tables', ['id' => $id]);
    }

    public function test_table_rejects_an_unknown_kind(): void
    {
        $this->actingAsOwner();
        $hall = Hall::factory()->create();

        $this->postJson('/api/v1/tables/tables', [
            'hall_id' => $hall->id,
            'label' => 'X-1',
            'kind' => 'helipad',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('kind');
    }

    public function test_free_filter_excludes_busy_tables(): void
    {
        $this->actingAsOwner();
        RestaurantTable::factory()->count(2)->create();
        RestaurantTable::factory()->count(3)->occupied()->create();

        $this->getJson('/api/v1/tables/tables?filter[free]=1')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_status_endpoint_moves_a_table_through_the_floor_cycle(): void
    {
        $this->actingAsOwner();
        $table = RestaurantTable::factory()->create();

        $this->postJson("/api/v1/tables/tables/{$table->id}/status", ['status' => 'occupied'])
            ->assertOk()
            ->assertJsonPath('data.status', 'occupied');

        $this->postJson("/api/v1/tables/tables/{$table->id}/status", ['status' => 'cleaning'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cleaning');
    }

    // ============ Reservations ============

    public function test_owner_can_book_a_table(): void
    {
        $this->actingAsOwner();
        $table = RestaurantTable::factory()->create();

        $this->postJson('/api/v1/tables/reservations', [
            'restaurant_table_id' => $table->id,
            'guest_name' => 'Aziz Karimov',
            'guest_phone' => '+998901234567',
            'guests_count' => 4,
            'starts_at' => now()->addHours(3)->toIso8601String(),
            'source' => 'bot',
        ])
            ->assertCreated()
            ->assertJsonPath('data.guest_name', 'Aziz Karimov')
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.is_upcoming', true);
    }

    public function test_a_reservation_cannot_be_made_in_the_past(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/v1/tables/reservations', [
            'guest_name' => 'Aziz',
            'guest_phone' => '+998901234567',
            'guests_count' => 2,
            'starts_at' => now()->subHour()->toIso8601String(),
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('starts_at');
    }

    public function test_seating_a_reservation_also_occupies_the_table(): void
    {
        $this->actingAsOwner();
        $table = RestaurantTable::factory()->create(['status' => 'reserved']);
        $reservation = Reservation::factory()->confirmed()->create([
            'restaurant_table_id' => $table->id,
        ]);

        $this->postJson("/api/v1/tables/reservations/{$reservation->id}/seat")
            ->assertOk()
            ->assertJsonPath('data.status', 'seated');

        // The whole point: the floor map must not be left lying.
        $this->assertDatabaseHas('restaurant_tables', ['id' => $table->id, 'status' => 'occupied']);
    }

    public function test_a_cancelled_reservation_cannot_be_seated(): void
    {
        $this->actingAsOwner();
        $reservation = Reservation::factory()->cancelled()->create();

        $this->postJson("/api/v1/tables/reservations/{$reservation->id}/seat")
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
    }

    public function test_upcoming_filter_hides_past_reservations(): void
    {
        $this->actingAsOwner();
        Reservation::factory()->count(2)->create();
        Reservation::factory()->count(3)->past()->create();

        $this->getJson('/api/v1/tables/reservations?filter[upcoming]=1')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    // ============ Module info ============

    public function test_module_info_reports_floor_state(): void
    {
        $this->actingAsOwner();
        Hall::factory()->create();
        RestaurantTable::factory()->count(4)->create();
        RestaurantTable::factory()->count(2)->occupied()->create();

        $this->getJson('/api/v1/tables/')
            ->assertOk()
            ->assertJsonPath('module', 'Tables')
            ->assertJsonPath('counts.tables_total', 6)
            ->assertJsonPath('counts.tables_free', 4)
            ->assertJsonPath('counts.tables_occupied', 2);
    }

    // ============ Tenant isolation ============

    public function test_one_restaurant_never_sees_another_restaurants_floor(): void
    {
        $a = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $hall = Hall::factory()->create(['tenant_id' => $a->id]);
        RestaurantTable::factory()->count(3)->create([
            'tenant_id' => $a->id,
            'hall_id' => $hall->id,
        ]);

        $user = User::factory()->create(['tenant_id' => $a->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/tables/tables')->assertOk()->assertJsonCount(3, 'data');

        // Asking for another restaurant is refused outright: an empty list
        // would read as "no data" and hide the attempt entirely.
        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/tables/tables')
            ->assertStatus(403)
            ->assertJsonPath('code', 'TENANT_MISMATCH');
    }
}
