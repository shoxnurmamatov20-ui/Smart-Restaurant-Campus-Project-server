<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Http\Middleware\ResolveTenant;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Modules\Finance\Models\Payment;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Tests\TestCase;

/**
 * The wall between two restaurants, tested by id rather than by listing.
 *
 * Listing endpoints were always filtered by the BelongsToTenant global scope,
 * which made isolation look complete. Fetching one record by id was not: Laravel
 * runs SubstituteBindings before route middleware by default, so the dish was
 * loaded before any restaurant had been resolved, the scope had no tenant to
 * filter by, and the row came back. Any signed-in user could read — and with a
 * PATCH, rewrite — a competitor's data by guessing an integer.
 *
 * bootstrap/app.php now pins ResolveTenant above SubstituteBindings. These
 * tests exist so that ordering is never quietly reverted.
 */
final class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $mine;

    private Tenant $theirs;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->mine = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $this->theirs = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    /** Sign in as the owner of our restaurant — the widest possible permissions. */
    private function signIn(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->mine->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        app(TenantContext::class)->set($this->mine);

        return $user;
    }

    /** Build a fixture that belongs to the other restaurant. */
    private function theirs(callable $make): mixed
    {
        $context = app(TenantContext::class);
        $previous = $context->tenant();

        $context->set($this->theirs);
        $record = $make();
        $context->set($previous);

        return $record;
    }

    // ============ Reading one record by id ============

    public function test_a_dish_belonging_to_another_restaurant_is_not_readable_by_id(): void
    {
        $this->signIn();
        $theirDish = $this->theirs(fn (): MenuItem => MenuItem::factory()->create(['sku' => 'SECRET']));

        $this->getJson("/api/v1/menu/items/{$theirDish->id}")->assertStatus(404);
    }

    public function test_an_order_belonging_to_another_restaurant_is_not_readable_by_id(): void
    {
        $this->signIn();
        $theirOrder = $this->theirs(fn (): Order => Order::factory()->create());

        $this->getJson("/api/v1/orders/orders/{$theirOrder->id}")->assertStatus(404);
    }

    public function test_a_payment_belonging_to_another_restaurant_is_not_readable_by_id(): void
    {
        $this->signIn();
        $theirPayment = $this->theirs(fn (): Payment => Payment::factory()->create());

        $this->getJson("/api/v1/finance/payments/{$theirPayment->id}")->assertStatus(404);
    }

    // ============ Writing to one record by id ============

    public function test_another_restaurants_prices_cannot_be_rewritten(): void
    {
        $this->signIn();
        $theirDish = $this->theirs(fn (): MenuItem => MenuItem::factory()->create(['price' => 4500000]));

        $this->patchJson("/api/v1/menu/items/{$theirDish->id}", ['price' => 100])->assertStatus(404);

        $this->assertSame(4500000, $theirDish->refresh()->price);
    }

    public function test_another_restaurants_dish_cannot_be_deleted(): void
    {
        $this->signIn();
        $theirDish = $this->theirs(fn (): MenuItem => MenuItem::factory()->create());

        $this->deleteJson("/api/v1/menu/items/{$theirDish->id}")->assertStatus(404);

        $this->assertDatabaseHas('menu_items', ['id' => $theirDish->id]);
    }

    public function test_another_restaurants_dish_cannot_be_pulled_from_sale(): void
    {
        $this->signIn();
        $theirDish = $this->theirs(fn (): MenuItem => MenuItem::factory()->create(['is_available' => true]));

        // Stop-list is the cheapest way to sabotage a competitor's evening.
        $this->postJson("/api/v1/menu/items/{$theirDish->id}/stop")->assertStatus(404);

        $this->assertTrue($theirDish->refresh()->is_available);
    }

    // ============ Our own records still work ============

    public function test_our_own_records_are_reachable_by_id(): void
    {
        $this->signIn();
        $ourDish = MenuItem::factory()->create(['price' => 4500000]);

        $this->getJson("/api/v1/menu/items/{$ourDish->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $ourDish->id);

        $this->patchJson("/api/v1/menu/items/{$ourDish->id}", ['price' => 5000000])->assertOk();

        $this->assertSame(5000000, $ourDish->refresh()->price);
    }

    // ============ Listing ============

    public function test_a_list_shows_only_our_own_records(): void
    {
        $this->signIn();
        MenuItem::factory()->count(2)->create();
        $this->theirs(fn () => MenuItem::factory()->count(5)->create());

        $this->getJson('/api/v1/menu/items')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    // ============ Asking for someone else's restaurant outright ============

    public function test_naming_another_restaurant_in_the_header_is_refused(): void
    {
        $this->signIn();

        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/menu/items')
            ->assertStatus(403)
            ->assertJsonPath('code', 'TENANT_MISMATCH');
    }

    public function test_naming_our_own_restaurant_in_the_header_is_fine(): void
    {
        $this->signIn();
        MenuItem::factory()->count(3)->create();

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/menu/items')
            ->assertOk()
            ->assertJsonCount(3, 'data');
    }

    // ============ The ordering this all rests on ============

    public function test_the_tenant_is_resolved_before_route_model_binding(): void
    {
        $priority = app(Kernel::class);
        $reflection = new \ReflectionProperty($priority, 'middlewarePriority');
        /** @var array<int, string> $list */
        $list = $reflection->getValue($priority);

        $tenant = array_search(ResolveTenant::class, $list, true);
        $binding = array_search(SubstituteBindings::class, $list, true);

        $this->assertIsInt($tenant, 'ResolveTenant must appear in the middleware priority list.');
        $this->assertIsInt($binding, 'SubstituteBindings must appear in the middleware priority list.');
        $this->assertLessThan(
            $binding,
            $tenant,
            'Route-model binding must never run before the restaurant is known — that is a cross-tenant read.',
        );
    }
}
