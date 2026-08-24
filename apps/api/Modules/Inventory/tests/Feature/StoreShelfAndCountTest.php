<?php

declare(strict_types=1);

namespace Modules\Inventory\Tests\Feature;

use App\Contracts\Inventory\StockLedger;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\StockMovement;
use Tests\TestCase;

/**
 * The four things the store screen could not ask the API for.
 *
 * Which shelf a thing is on, how it is bought, what one purchase unit costs,
 * and what a scanner finds. StockControlTest already covers the balance and the
 * movement ledger; this covers the columns that were answering `null` and the
 * count sheet that had nowhere to post.
 */
final class StoreShelfAndCountTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsStorekeeper(): User
    {
        $user = User::factory()->create();
        $user->assignRole('storekeeper');
        $this->actingAs($user);

        return $user;
    }

    // ============ How a thing is bought ============

    public function test_the_purchase_price_is_derived_and_never_stored_twice(): void
    {
        $this->actingAsStorekeeper();

        // A sack of flour: fifty kilos, held in grams, priced per gram.
        $this->postJson('/api/v1/inventory/ingredients', [
            'sku' => 'ING-9001',
            'name' => 'Un',
            'unit' => 'g',
            'purchase_unit' => 'sack',
            'units_per_purchase' => 50_000,
            'cost_per_unit' => 7,
            'store' => 'main',
            'shelf_life_days' => 180,
        ])
            ->assertCreated()
            ->assertJsonPath('data.factor', 50_000)
            // 7 tiyin a gram × 50 000 g. No second column holds this, so the
            // two figures cannot drift apart.
            ->assertJsonPath('data.price_tiyin', 350_000)
            ->assertJsonPath('data.store', 'main')
            ->assertJsonPath('data.shelf_life_days', 180);
    }

    public function test_a_purchase_unit_holding_nothing_is_refused(): void
    {
        $this->actingAsStorekeeper();

        // Zero would divide a shelf by nothing on the way to the screen.
        $this->postJson('/api/v1/inventory/ingredients', [
            'sku' => 'ING-9002', 'name' => 'Tuz', 'units_per_purchase' => 0,
        ])->assertApiValidationErrors('units_per_purchase');
    }

    // ============ Which shelf ============

    public function test_the_store_chips_filter_on_the_server(): void
    {
        $this->actingAsStorekeeper();
        Ingredient::factory()->inStore('bar')->create(['name' => 'Limon']);
        Ingredient::factory()->inStore('kitchen')->create(['name' => 'Smetana']);
        Ingredient::factory()->inStore('main')->create(['name' => 'Guruch']);

        $this->getJson('/api/v1/inventory/ingredients?filter[store]=bar')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Limon');

        // No chip means every shelf, the same way an empty branch means every
        // venue: the storekeeper's default view is the whole store.
        $this->getJson('/api/v1/inventory/ingredients')->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_a_movement_is_found_through_the_shelf_its_ingredient_sits_on(): void
    {
        $this->actingAsStorekeeper();
        $bar = Ingredient::factory()->inStore('bar')->create();
        $main = Ingredient::factory()->inStore('main')->create();

        $bar->move('write_off', -100, 'Sindi');
        $main->move('write_off', -100, 'Muddati tugadi');

        $this->getJson('/api/v1/inventory/movements?filter[store]=bar')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.ingredient_id', $bar->id);
    }

    // ============ The scanner ============

    public function test_a_barcode_finds_exactly_one_thing(): void
    {
        $this->actingAsStorekeeper();
        Ingredient::factory()->create(['barcode' => '4780015680012', 'name' => 'Guruch']);
        Ingredient::factory()->create(['barcode' => '4780015680029', 'name' => 'Un']);

        $this->getJson('/api/v1/inventory/items?barcode=4780015680029')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Un');
    }

    public function test_an_unregistered_barcode_answers_an_empty_list_not_a_refusal(): void
    {
        $this->actingAsStorekeeper();
        Ingredient::factory()->create(['barcode' => '4780015680012']);

        // A 404 would give a storekeeper holding a crate nothing to do. An
        // empty list lets the screen say "not on file — add it?".
        $this->getJson('/api/v1/inventory/items?barcode=0000000000000')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_the_lookup_with_nothing_to_look_for_answers_nothing(): void
    {
        $this->actingAsStorekeeper();
        Ingredient::factory()->count(3)->create();

        // A scanner that fired with no code must not page through the store.
        $this->getJson('/api/v1/inventory/items')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_the_same_barcode_cannot_be_given_to_two_things_here(): void
    {
        $this->actingAsStorekeeper();
        Ingredient::factory()->create(['barcode' => '4780015680012']);

        $this->postJson('/api/v1/inventory/ingredients', [
            'sku' => 'ING-9003', 'name' => 'Boshqa', 'barcode' => '4780015680012',
        ])->assertApiValidationErrors('barcode');
    }

    public function test_two_restaurants_may_hold_the_same_barcode(): void
    {
        $this->actingAsStorekeeper();
        Ingredient::factory()->create(['barcode' => '4780015680012', 'name' => 'Guruch']);

        $other = Tenant::query()->create([
            'name' => 'Lagmon uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('storekeeper');
        $this->actingAs($stranger);

        // The index is per restaurant, because a national barcode names a
        // product and two restaurants both stock it.
        $this->postJson('/api/v1/inventory/ingredients', [
            'sku' => 'ING-9004', 'name' => 'Guruch', 'barcode' => '4780015680012',
        ])->assertCreated();

        // And the scan still only ever finds their own row.
        $this->getJson('/api/v1/inventory/items?barcode=4780015680012')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.sku', 'ING-9004');
    }

    // ============ Counting ============

    public function test_a_count_posts_only_the_lines_that_disagree(): void
    {
        $this->actingAsStorekeeper();
        $short = Ingredient::factory()->create(['stock_quantity' => 10_000]);
        $exact = Ingredient::factory()->create(['stock_quantity' => 5_000]);
        $over = Ingredient::factory()->create(['stock_quantity' => 2_000]);

        $this->postJson('/api/v1/inventory/counts', [
            'reference' => 'SANOQ-2026-08',
            'lines' => [
                ['ingredient_id' => $short->id, 'counted' => 9_400],
                ['ingredient_id' => $exact->id, 'counted' => 5_000],
                ['ingredient_id' => $over->id, 'counted' => 2_150],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.counted', 3)
            ->assertJsonPath('data.adjusted', 2)
            ->assertJsonPath('data.lines.0.variance', -600)
            ->assertJsonPath('data.lines.1.status', 'matched')
            ->assertJsonPath('data.lines.2.variance', 150);

        $this->assertSame(9_400, $short->refresh()->stock_quantity);
        // A count that agrees with the book is not a movement. A ledger a
        // storekeeper has to skim past is one they stop reading.
        $this->assertSame(0, StockMovement::query()->where('ingredient_id', $exact->id)->count());
        $this->assertSame(2_150, $over->refresh()->stock_quantity);
    }

    public function test_one_unknown_line_does_not_throw_away_the_sheet(): void
    {
        $this->actingAsStorekeeper();
        $real = Ingredient::factory()->create(['stock_quantity' => 1_000]);

        $this->postJson('/api/v1/inventory/counts', [
            'lines' => [
                ['ingredient_id' => $real->id, 'counted' => 900],
                ['ingredient_id' => 999_999, 'counted' => 40],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.lines.0.status', 'adjusted')
            ->assertJsonPath('data.lines.1.status', 'unknown');

        $this->assertSame(900, $real->refresh()->stock_quantity);
    }

    public function test_a_negative_count_is_refused(): void
    {
        $this->actingAsStorekeeper();
        $ingredient = Ingredient::factory()->create();

        // A shelf holds nothing or something. A minus sign is a typo, and
        // accepting it would post a variance twice the size of the real one.
        $this->postJson('/api/v1/inventory/counts', [
            'lines' => [['ingredient_id' => $ingredient->id, 'counted' => -5]],
        ])->assertApiValidationErrors('lines.0.counted');
    }

    public function test_a_cook_may_read_the_store_but_not_count_it(): void
    {
        $user = User::factory()->create();
        $user->assignRole('cook');
        $this->actingAs($user);
        $ingredient = Ingredient::factory()->create();

        $this->getJson('/api/v1/inventory/items?barcode=1')->assertOk();
        $this->postJson('/api/v1/inventory/counts', [
            'lines' => [['ingredient_id' => $ingredient->id, 'counted' => 1]],
        ])->assertStatus(403);
    }

    public function test_another_restaurant_cannot_be_counted_from_here(): void
    {
        $this->actingAsStorekeeper();
        $mine = Ingredient::factory()->create(['stock_quantity' => 1_000]);

        $other = Tenant::query()->create([
            'name' => 'Lagmon uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('storekeeper');
        $this->actingAs($stranger);

        // Reported as unknown rather than refused, and that is the honest
        // answer: from this restaurant the row does not exist.
        $this->postJson('/api/v1/inventory/counts', [
            'lines' => [['ingredient_id' => $mine->id, 'counted' => 1]],
        ])->assertCreated()->assertJsonPath('data.lines.0.status', 'unknown');

        $this->assertSame(1_000, $mine->refresh()->stock_quantity);
    }

    // ============ The contract other modules write through ============

    public function test_the_ledger_contract_never_takes_more_than_is_there(): void
    {
        $this->actingAsStorekeeper();
        $ingredient = Ingredient::factory()->create(['stock_quantity' => 400]);

        // A phone that sent grams where the person typed kilograms is a wrong
        // number, not a bigger loss. Clamped, so the balance stays out of the
        // negatives the direct route already refuses.
        $change = app(StockLedger::class)->writeOff($ingredient->id, 4_000, 'Muzlatkich ishlamadi');

        $this->assertNotNull($change);
        $this->assertSame(-400, $change->delta);
        $this->assertSame(0, $change->balance);
        $this->assertSame(0, $ingredient->refresh()->stock_quantity);
    }

    public function test_the_ledger_contract_answers_null_for_something_it_does_not_have(): void
    {
        $this->actingAsStorekeeper();

        // Null rather than an exception: the caller is a batch, and one bad
        // line out of twelve must come back as one rejection.
        $this->assertNull(app(StockLedger::class)->writeOff(999_999, 10, 'Yo\'q'));
        $this->assertNull(app(StockLedger::class)->recordCount(999_999, 10));
    }
}
