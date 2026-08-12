<?php

declare(strict_types=1);

namespace Tests\Feature;

use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Crm\Models\Customer;
use Modules\Finance\Models\CashShift;
use Modules\Inventory\Models\Ingredient;
use Modules\Kitchen\Models\KitchenStation;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Modules\Staff\Models\StaffMember;
use Modules\Suppliers\Models\Supplier;
use Modules\Tables\Models\RestaurantTable;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * `php artisan migrate --seed` is the very first thing anyone runs on this
 * project. If the seeders drift out of order — Orders seeded before Menu, a
 * renamed column, a missing module — the app is broken before a single line of
 * feature code executes, and the failure looks like a setup problem rather than
 * a bug.
 *
 * This test runs the real DatabaseSeeder end to end so that never ships.
 */
final class SeedingSmokeTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_full_seeder_boots_a_working_restaurant(): void
    {
        $this->seed(DatabaseSeeder::class);

        // Foundation
        $this->assertDatabaseCount('tenants', 1);
        $this->assertGreaterThan(0, Role::count(), 'RBAC roles must be seeded');

        // Every Phase-1 module contributes real content
        $this->assertGreaterThan(0, MenuItem::count(), 'Menu');
        $this->assertGreaterThan(0, KitchenStation::count(), 'Kitchen stations');
        $this->assertGreaterThan(0, RestaurantTable::count(), 'Floor plan');
        $this->assertGreaterThan(0, Ingredient::count(), 'Store');
        $this->assertGreaterThan(0, Supplier::count(), 'Suppliers');
        $this->assertGreaterThan(0, StaffMember::count(), 'Team');
        $this->assertGreaterThan(0, Customer::count(), 'Guests');
        $this->assertGreaterThan(0, CashShift::count(), 'Till');
        $this->assertGreaterThan(0, Order::count(), 'Trading history');
    }

    public function test_seeded_orders_are_priced_from_the_seeded_menu(): void
    {
        $this->seed(DatabaseSeeder::class);

        $order = Order::query()->with('items')->has('items')->firstOrFail();

        $this->assertGreaterThan(0, $order->total, 'A seeded order must have a real total');
        $this->assertSame(
            (int) $order->items->sum('total_price'),
            $order->subtotal,
            'Seeded totals must be derived from the lines, not invented',
        );
    }

    public function test_seeding_twice_does_not_duplicate_the_menu(): void
    {
        $this->seed(DatabaseSeeder::class);
        $first = MenuItem::count();

        // Seeders use updateOrCreate — re-running after a partial failure must
        // be safe, not double every dish on the card.
        $this->seed(DatabaseSeeder::class);

        $this->assertSame($first, MenuItem::count());
    }
}
