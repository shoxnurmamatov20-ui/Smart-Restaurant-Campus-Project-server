<?php

declare(strict_types=1);

namespace Modules\Marketplace\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Marketplace\Database\Seeders\MarketplaceDatabaseSeeder;
use Modules\Marketplace\Models\Consumer;
use Modules\Marketplace\Models\Store;
use Modules\Marketplace\Models\StoreItem;
use Modules\Menu\Database\Seeders\MenuDatabaseSeeder;
use Tests\TestCase;

/**
 * The demo marketplace, checked against the design it was transcribed from.
 *
 * A seeder is the one piece of code nobody runs in a test until it breaks in
 * front of somebody installing the platform — and this one reads what four
 * other seeders wrote, through a contract, inside a tenancy it did not
 * establish. Three chances to be quietly wrong.
 *
 * The figures asserted below are the ones from `STORES` in
 * `packages/surfaces/src/mp/data.ts`. They are checked rather than trusted
 * because every marketplace screen was built against them: a demo that rounds
 * 4.9 to 5 makes the first live render look like a regression, and the closed
 * shop is a state the design deliberately drew and a seeder could quietly open.
 */
final class MarketplaceSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $tenant = Tenant::query()->create([
            'name' => 'Demo Restaurant', 'slug' => 'demo-restaurant', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        /*
         * The same two contexts `DatabaseSeeder` establishes before it calls
         * anything. Without them `BelongsToTenant` stamps nothing and the whole
         * demo lands owned by nobody — invisible to every account in it, which
         * is the failure that put the paragraph in `DatabaseSeeder`.
         */
        app(TenantContext::class)->set($tenant);
        app(BranchContext::class)->set(Branch::factory()->create(['tenant_id' => $tenant->id]));

        // The window stocks itself from the restaurant's catalogue, so the
        // catalogue has to exist first — which is why this seeder runs last.
        $this->seed(MenuDatabaseSeeder::class);
        $this->seed(MarketplaceDatabaseSeeder::class);
    }

    public function test_it_opens_the_eight_storefronts_the_design_draws(): void
    {
        $this->assertSame(8, Store::query()->count());

        $slugs = Store::query()->orderBy('id')->pluck('slug')->all();

        $this->assertSame([
            'osh-xona', 'smart-restaurant', 'choyxona-navruz', 'lavash-baraka',
            'pizza-roma', 'milliy-taomlar', 'burger-xona', 'shashlik-markazi',
        ], $slugs);
    }

    public function test_the_figures_are_the_designs_own(): void
    {
        $osh = Store::query()->where('slug', 'osh-xona')->firstOrFail();

        $this->assertSame('Osh Xona', $osh->name);
        $this->assertSame(4.9, $osh->rating());
        $this->assertSame(1_240, $osh->reviews_count);
        // 12 000 so'm, in tiyin.
        $this->assertSame(1_200_000, $osh->delivery_fee_tiyin);
        $this->assertSame(25, $osh->minutes_from);
        $this->assertSame(35, $osh->minutes_to);
        $this->assertSame('Yangi narxlar', $osh->translate('offer', 'uz'));

        // The one storefront that charges nothing to deliver, and its badge
        // says so — the design pairs the two and a seeder could split them.
        $smart = Store::query()->where('slug', 'smart-restaurant')->firstOrFail();
        $this->assertSame(0, $smart->delivery_fee_tiyin);
        $this->assertSame('Bepul yetkazish', $smart->translate('offer', 'uz'));
    }

    public function test_one_shop_is_shut_because_the_design_drew_it_that_way(): void
    {
        $closed = Store::query()->where('is_open', false)->get();

        // Exactly one. It is what makes the dimmed card and its "Yopiq" overlay
        // a state somebody has actually looked at.
        $this->assertCount(1, $closed);

        $shop = $closed->firstOrFail();

        $this->assertSame('shashlik-markazi', $shop->slug);

        // Shut, but on the market: a closed shop is still in the directory.
        $this->assertSame('live', $shop->status);
    }

    public function test_every_window_is_stocked_from_the_restaurants_own_catalogue(): void
    {
        $this->assertGreaterThan(0, StoreItem::query()->count());

        foreach (Store::query()->get() as $store) {
            $this->assertGreaterThan(
                0,
                $store->items()->count(),
                "{$store->slug} has an empty shop window.",
            );
        }
    }

    public function test_drinks_carry_no_markup_and_food_does(): void
    {
        // The first storefront in the cycle takes three thousand so'm on food.
        $osh = Store::query()->where('slug', 'osh-xona')->firstOrFail();

        $markups = $osh->items()->pluck('markup_tiyin')->unique()->sort()->values()->all();

        /*
         * Two values and no more: zero on the drinks, 300 000 on everything
         * else. Nobody accepts a tea costing three thousand more because it
         * arrived by moped, and the merchant's catalogue screen needs at least
         * one row where the two prices match so the "no markup" case is visible.
         */
        $this->assertSame([0, 300_000], $markups);
    }

    public function test_it_can_be_run_twice_without_opening_sixteen_shops(): void
    {
        // `db:seed` gets run more than once on a working machine.
        $this->seed(MarketplaceDatabaseSeeder::class);

        $this->assertSame(8, Store::query()->count());
    }

    public function test_it_leaves_two_customers_one_of_them_on_plus(): void
    {
        $this->assertSame(2, Consumer::query()->count());

        $subscriber = Consumer::query()->where('phone', '+998901234567')->firstOrFail();
        $ordinary = Consumer::query()->where('phone', '+998907654321')->firstOrFail();

        // One of each, because free delivery is the whole subscription and a
        // demo where every basket ships free never shows the fee at all.
        $this->assertTrue($subscriber->hasPlus());
        $this->assertFalse($ordinary->hasPlus());
    }
}
