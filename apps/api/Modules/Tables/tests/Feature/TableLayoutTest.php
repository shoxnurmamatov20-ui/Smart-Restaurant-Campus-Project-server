<?php

declare(strict_types=1);

namespace Modules\Tables\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Tables\Models\Hall;
use Modules\Tables\Models\RestaurantTable;
use Tests\TestCase;

/**
 * Moving a table on the plan, and moving it between rooms.
 *
 * The floor screen's "edit layout" button was an `ActionButton`: it flashed a
 * sentence about a plan editor and opened nothing. What it needed was not a
 * canvas but two facts a table could not hold — where it sits in its room, and
 * which room that is. The second was already writable; this covers both, plus
 * the property that makes the column safe to add: a restaurant that never opens
 * the editor sees exactly the plan it saw before.
 */
final class TableLayoutTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi-layout', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);
    }

    protected function tearDown(): void
    {
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

    private function hall(string $name): Hall
    {
        return Hall::factory()->create(['tenant_id' => $this->tenant->id, 'name' => $name]);
    }

    public function test_a_table_can_be_given_a_place_on_the_plan(): void
    {
        $this->actingAsManager();
        $table = RestaurantTable::factory()->create([
            'tenant_id' => $this->tenant->id,
            'hall_id' => $this->hall('Zal')->id,
        ]);

        $this->patchJson("/api/v1/tables/tables/{$table->id}", ['position' => 3])
            ->assertOk()
            ->assertJsonPath('data.position', 3);

        $this->assertSame(3, $table->refresh()->position);
    }

    public function test_a_table_can_be_moved_to_another_room(): void
    {
        $this->actingAsManager();
        $zal = $this->hall('Zal');
        $vip = $this->hall('VIP');

        $table = RestaurantTable::factory()->create([
            'tenant_id' => $this->tenant->id, 'hall_id' => $zal->id,
        ]);

        $this->patchJson("/api/v1/tables/tables/{$table->id}", [
            'hall_id' => $vip->id,
            'position' => 1,
        ])->assertOk()->assertJsonPath('data.hall.id', $vip->id);

        $this->assertSame($vip->id, $table->refresh()->hall_id);
    }

    public function test_the_list_comes_back_in_plan_order_then_by_label(): void
    {
        $this->actingAsManager();
        $hall = $this->hall('Zal');

        // A-1 placed last, A-9 placed first: a plan a host reads window to
        // kitchen rather than in the order somebody typed the tables in.
        RestaurantTable::factory()->create([
            'tenant_id' => $this->tenant->id, 'hall_id' => $hall->id,
            'label' => 'A-1', 'position' => 2,
        ]);
        RestaurantTable::factory()->create([
            'tenant_id' => $this->tenant->id, 'hall_id' => $hall->id,
            'label' => 'A-9', 'position' => 1,
        ]);

        $this->getJson('/api/v1/tables/tables')
            ->assertOk()
            ->assertJsonPath('data.0.label', 'A-9')
            ->assertJsonPath('data.1.label', 'A-1');
    }

    public function test_an_unplaced_floor_still_comes_back_in_label_order(): void
    {
        $this->actingAsManager();
        $hall = $this->hall('Zal');

        // Every row that predates the editor is `position = 0`, so a
        // restaurant that never opens it sees exactly what it saw before.
        foreach (['A-9', 'A-1'] as $label) {
            RestaurantTable::factory()->create([
                'tenant_id' => $this->tenant->id, 'hall_id' => $hall->id, 'label' => $label,
            ]);
        }

        $this->getJson('/api/v1/tables/tables')
            ->assertOk()
            ->assertJsonPath('data.0.label', 'A-1')
            ->assertJsonPath('data.1.label', 'A-9');
    }

    public function test_a_position_off_the_end_of_the_plan_is_refused(): void
    {
        $this->actingAsManager();
        $table = RestaurantTable::factory()->create([
            'tenant_id' => $this->tenant->id, 'hall_id' => $this->hall('Zal')->id,
        ]);

        // A slipped keypress must not push a table past every other one.
        $this->patchJson("/api/v1/tables/tables/{$table->id}", ['position' => 999_999])
            ->assertStatus(422)
            ->assertApiValidationErrors('position');
    }

    public function test_somebody_without_tables_update_cannot_rearrange_the_room(): void
    {
        $table = RestaurantTable::factory()->create([
            'tenant_id' => $this->tenant->id, 'hall_id' => $this->hall('Zal')->id,
        ]);

        /*
         * An accountant, not a waiter. A waiter genuinely holds
         * `tables.update` — it is how they claim a table on the floor — so the
         * layout editor rides on the same permission the room already uses.
         * Whether rearranging the plan deserves a heavier one is a question for
         * the roles screen rather than something this endpoint should decide
         * unilaterally.
         */
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('accountant');
        $this->actingAs($user);

        $this->patchJson("/api/v1/tables/tables/{$table->id}", ['position' => 2])
            ->assertStatus(403);
    }

    public function test_another_restaurants_table_cannot_be_moved(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Boshqa', 'slug' => 'boshqa-layout', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($other);
        $theirs = RestaurantTable::factory()->create([
            'tenant_id' => $other->id,
            'hall_id' => Hall::factory()->create(['tenant_id' => $other->id])->id,
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->actingAsManager();

        $this->patchJson("/api/v1/tables/tables/{$theirs->id}", ['position' => 5])
            ->assertStatus(404);
        $this->assertSame(0, $theirs->refresh()->position);
    }
}
