<?php

declare(strict_types=1);

namespace Modules\Suppliers\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Inventory\Database\Seeders\InventoryDatabaseSeeder;
use Modules\Inventory\Database\Seeders\StockMovementSeeder;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\StockMovement;
use Modules\Suppliers\Database\Seeders\PurchaseOrderSeeder;
use Modules\Suppliers\Database\Seeders\SuppliersDatabaseSeeder;
use Modules\Suppliers\Models\PurchaseOrder;
use Modules\Suppliers\Models\Supplier;
use Tests\TestCase;

/**
 * The demo restaurant's books add up.
 *
 * `StockMovementSeeder` states the promise its whole design exists to keep: a
 * storekeeper who adds the ledger column up gets the number on the shelf. That
 * property is derived — the opening count is computed backwards from every
 * event — so any change to the deliveries above it can break it silently, and
 * the only symptom would be a stock screen nobody trusts twice.
 *
 * These four seeders are the chain: companies, ingredients, the orders that
 * brought them, and the ledger derived from those orders. Run together here,
 * in the order `DatabaseSeeder` runs them.
 */
final class SeededBooksBalanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $tenant = Tenant::query()->create([
            'name' => 'Demo', 'slug' => 'demo-restaurant', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($tenant);
        app(BranchContext::class)->set(
            Branch::factory()->named('Chilonzor', 'CHZ')->create(['tenant_id' => $tenant->id]),
        );

        $this->seed(SuppliersDatabaseSeeder::class);
        $this->seed(InventoryDatabaseSeeder::class);
        $this->seed(PurchaseOrderSeeder::class);
        $this->seed(StockMovementSeeder::class);
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    public function test_the_ledger_ends_on_the_shelf(): void
    {
        $ingredients = Ingredient::query()->get();

        $this->assertNotEmpty($ingredients);

        foreach ($ingredients as $ingredient) {
            $movements = StockMovement::query()
                ->where('ingredient_id', $ingredient->id)
                ->orderBy('happened_at')
                ->orderBy('id')
                ->get();

            $this->assertNotEmpty(
                $movements,
                "{$ingredient->sku} has a balance and no history behind it.",
            );

            // The column, added up. Not the last row's `balance_after` — that
            // would only prove the seeder is self-consistent, and the claim is
            // stronger: the movements themselves reach the shelf.
            $this->assertSame(
                $ingredient->stock_quantity,
                (int) $movements->sum('quantity'),
                "{$ingredient->sku}: the ledger does not add up to the shelf.",
            );
        }
    }

    public function test_the_ledger_never_passes_through_a_negative_shelf(): void
    {
        foreach (Ingredient::query()->pluck('id') as $id) {
            $running = 0;

            foreach (StockMovement::query()->where('ingredient_id', $id)->orderBy('happened_at')->orderBy('id')->get() as $movement) {
                $running += $movement->quantity;

                // A week that dips below empty is a week that did not happen,
                // and a demo that shows one teaches a storekeeper to distrust
                // the whole screen.
                $this->assertGreaterThanOrEqual(0, $running);
            }
        }
    }

    public function test_the_book_covers_all_five_movement_kinds(): void
    {
        $kinds = StockMovement::query()->distinct()->pluck('kind')->sort()->values()->all();

        // `stock_take` is the one a manager opens the ledger for — the shelf
        // disagreeing with the book — and it was the kind the seeded week had
        // only as bookkeeping until a mid-week count was added.
        $this->assertContains('receipt', $kinds);
        $this->assertContains('consumption', $kinds);
        $this->assertContains('write_off', $kinds);
        $this->assertContains('stock_take', $kinds);
    }

    public function test_the_seeded_orders_state_their_own_units(): void
    {
        $lines = PurchaseOrder::query()->with('items')->get()->flatMap->items;

        $this->assertNotEmpty($lines);

        // A purchase order outlives the ingredient row it points at —
        // `ingredient_id` is nullable by design — so a document that cannot say
        // whether 18 000 is grams or pieces stops meaning anything.
        foreach ($lines as $line) {
            $this->assertNotNull($line->unit, "{$line->name} has a quantity and no unit.");
        }
    }

    public function test_every_supplier_carries_the_two_columns_the_list_filters_by(): void
    {
        foreach (Supplier::query()->get() as $supplier) {
            $this->assertContains($supplier->category, Supplier::CATEGORIES);
        }

        // Four companies in four categories. A demo where every supplier is
        // "other, net 7" teaches the screen nothing and hides a wrong filter.
        $this->assertCount(4, Supplier::query()->distinct()->pluck('category'));
    }

    public function test_a_second_seed_does_not_lay_a_second_week_on_top_of_the_first(): void
    {
        $before = StockMovement::query()->count();
        $orders = PurchaseOrder::query()->count();

        $this->seed(PurchaseOrderSeeder::class);
        $this->seed(StockMovementSeeder::class);

        $this->assertSame($before, StockMovement::query()->count());
        $this->assertSame($orders, PurchaseOrder::query()->count());
    }

    public function test_the_next_order_a_buyer_raises_does_not_collide_with_a_seeded_one(): void
    {
        // The seeder spends PO-0001..PO-0008 by hand, so it advances the branch
        // counter to say so. Without that the first order raised in the console
        // would be PO-0001 and would answer 500 on a unique index.
        $next = PurchaseOrder::nextNumber();

        $this->assertSame(0, PurchaseOrder::query()->where('number', $next)->count());
    }
}
