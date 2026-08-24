<?php

declare(strict_types=1);

namespace Modules\Marketplace\Tests\Feature;

use App\Contracts\Menu\StopList;
use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Marketplace\Models\Consumer;
use Modules\Marketplace\Models\Store;
use Modules\Marketplace\Models\StoreItem;
use Modules\Menu\Models\MenuItem;
use Tests\TestCase;

/**
 * The shop window: the two endpoints that answer to nobody in particular.
 *
 * Two things are being checked here and the first is easy to lose sight of.
 * These endpoints read across restaurants with the connection fail-closed by
 * default, so a version of this module that FORGOT `withoutTenancy()` would
 * answer an empty list — a valid-looking answer, a green-looking screen, and a
 * marketplace with nothing on it. That is the failure mode `StartTenancyClosed`
 * was written to make loud, and these tests are where it gets loud.
 *
 * The second is what the window may show: live storefronts only, closed ones
 * dimmed rather than hidden, and nothing that belongs to a customer or a ledger.
 */
final class StorefrontDirectoryTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $osh;

    private Tenant $lavash;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->osh = $this->tenant('osh-xona');
        $this->lavash = $this->tenant('lavash-baraka');
    }

    private function tenant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug), 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    public function test_the_directory_lists_every_restaurant_on_the_platform(): void
    {
        Store::factory()->create(['tenant_id' => $this->osh->id, 'slug' => 'osh-xona', 'name' => 'Osh Xona']);
        Store::factory()->create(['tenant_id' => $this->lavash->id, 'slug' => 'lavash-baraka', 'name' => 'Lavash Baraka']);

        // No token, no `X-Tenant`, no session. Exactly what a browser sends.
        $response = $this->getJson('/api/v1/mp/stores')->assertOk();

        $slugs = array_column((array) $response->json('data'), 'slug');
        $this->assertEqualsCanonicalizing(['osh-xona', 'lavash-baraka'], $slugs);
    }

    public function test_a_storefront_that_is_not_live_is_not_in_the_window(): void
    {
        Store::factory()->create(['tenant_id' => $this->osh->id, 'slug' => 'live-one']);
        Store::factory()->paused()->create(['tenant_id' => $this->lavash->id, 'slug' => 'paused-one']);

        $slugs = array_column((array) $this->getJson('/api/v1/mp/stores')->assertOk()->json('data'), 'slug');

        $this->assertSame(['live-one'], $slugs);

        // And it cannot be reached by name either — a paused shop is off the
        // market, not merely unlisted.
        $this->getJson('/api/v1/mp/stores/paused-one')->assertApiError('marketplace.store_not_found');
    }

    public function test_a_closed_shop_is_still_drawn_because_the_design_dims_it(): void
    {
        Store::factory()->closed()->create(['tenant_id' => $this->osh->id, 'slug' => 'shashlik-markazi']);

        $response = $this->getJson('/api/v1/mp/stores')->assertOk();

        // Present, and honest about it. A guest planning tomorrow needs to know
        // the restaurant exists; the card wears "Yopiq" over it.
        $this->assertSame('shashlik-markazi', $response->json('data.0.slug'));
        $this->assertFalse($response->json('data.0.is_open'));
    }

    public function test_the_window_answers_the_cuisine_circles_and_the_search_box(): void
    {
        Store::factory()->create([
            'tenant_id' => $this->osh->id, 'slug' => 'osh-xona', 'name' => 'Osh Xona', 'cuisine' => 'osh',
        ]);
        Store::factory()->create([
            'tenant_id' => $this->lavash->id, 'slug' => 'lavash-baraka', 'name' => 'Lavash Baraka',
            'cuisine' => 'lavash',
            'offer' => ['uz' => 'Bepul yetkazish', 'ru' => 'Бесплатная доставка', 'en' => 'Free delivery'],
        ]);

        $byCuisine = $this->getJson('/api/v1/mp/stores?cuisine=lavash')->assertOk();
        $this->assertSame(['lavash-baraka'], array_column((array) $byCuisine->json('data'), 'slug'));

        $byName = $this->getJson('/api/v1/mp/stores?q=osh')->assertOk();
        $this->assertSame(['osh-xona'], array_column((array) $byName->json('data'), 'slug'));

        /*
         * "bepul" lives only on a badge, and in Uzbek. Somebody typing it is
         * looking for free delivery — searching the name alone answers nothing,
         * and searching one language answers nothing for the other two.
         */
        $byBadge = $this->getJson('/api/v1/mp/stores?q=bepul')->assertOk();
        $this->assertSame(['lavash-baraka'], array_column((array) $byBadge->json('data'), 'slug'));

        $byRussianBadge = $this->getJson('/api/v1/mp/stores?q=бесплатная')->assertOk();
        $this->assertSame(['lavash-baraka'], array_column((array) $byRussianBadge->json('data'), 'slug'));
    }

    public function test_distance_is_answered_only_when_the_asker_says_where_they_are(): void
    {
        // Roughly two kilometres due north of the reference point.
        Store::factory()->create([
            'tenant_id' => $this->osh->id, 'slug' => 'near-one',
            'latitude_e6' => 41_311_081 + 17_966, 'longitude_e6' => 69_240_562,
        ]);

        $blind = $this->getJson('/api/v1/mp/stores')->assertOk();
        $this->assertNull($blind->json('data.0.distance_metres'));

        $located = $this->getJson('/api/v1/mp/stores?near=41.311081,69.240562')->assertOk();
        $metres = $located->json('data.0.distance_metres');

        $this->assertIsInt($metres);
        $this->assertGreaterThan(1_800, $metres);
        $this->assertLessThan(2_200, $metres);
    }

    public function test_a_nonsense_near_parameter_still_answers_the_directory(): void
    {
        Store::factory()->create(['tenant_id' => $this->osh->id, 'slug' => 'osh-xona']);

        // A browser that could not get a fix must still see the shops. Ignored
        // rather than refused, and a latitude of 900 is a client bug rather
        // than a request worth answering 422.
        $this->getJson('/api/v1/mp/stores?near=nonsense')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/mp/stores?near=900,900')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_a_shop_window_shows_its_market_prices_not_its_dining_room_ones(): void
    {
        $owner = User::factory()->create(['tenant_id' => $this->osh->id]);
        $owner->assignRole('owner');
        $this->actingAs($owner);

        $plov = MenuItem::factory()->create(['sku' => 'OSH-1', 'price' => 4_400_000]);
        $tea = MenuItem::factory()->create(['sku' => 'CHY-1', 'price' => 800_000, 'kind' => 'drink']);
        $roomOnly = MenuItem::factory()->create(['sku' => 'ROOM-1', 'price' => 9_000_000]);

        $store = Store::factory()->create(['tenant_id' => $this->osh->id, 'slug' => 'osh-xona']);

        StoreItem::create(['store_id' => $store->id, 'menu_item_id' => $plov->id, 'markup_tiyin' => 300_000]);
        StoreItem::create(['store_id' => $store->id, 'menu_item_id' => $tea->id, 'markup_tiyin' => 0]);
        StoreItem::create(['store_id' => $store->id, 'menu_item_id' => $roomOnly->id, 'is_listed' => false]);

        // Signed out again — this is a stranger reading a menu.
        app('auth')->forgetGuards();

        $response = $this->getJson('/api/v1/mp/stores/osh-xona')->assertOk();

        $menu = collect((array) $response->json('data.menu'))->keyBy('menu_item_id');

        $this->assertCount(2, $menu, 'A dish that is not listed must not be on the market.');

        $this->assertSame(4_700_000, $menu[$plov->id]['price_tiyin']);
        // The struck-through price the design draws beside a marked-up dish.
        $this->assertSame(4_400_000, $menu[$plov->id]['was_tiyin']);

        // Nothing struck through where the two prices agree.
        $this->assertSame(800_000, $menu[$tea->id]['price_tiyin']);
        $this->assertNull($menu[$tea->id]['was_tiyin']);

        /*
         * And every row names the chip it belongs under.
         *
         * Sent rather than left to the client, because both clients invented
         * one from the dish's own title — which gives every dish its own
         * category and makes the store screen's filter empty the list.
         */
        $this->assertIsString($menu[$plov->id]['section']);
        $this->assertNotSame('', $menu[$plov->id]['section']);
    }

    public function test_a_dish_the_kitchen_ran_out_of_is_crossed_out_rather_than_hidden(): void
    {
        $owner = User::factory()->create(['tenant_id' => $this->osh->id]);
        $owner->assignRole('owner');
        $this->actingAs($owner);

        $plov = MenuItem::factory()->create(['sku' => 'OSH-1', 'price' => 4_400_000]);
        $somsa = MenuItem::factory()->create(['sku' => 'SMS-1', 'price' => 1_200_000]);

        /*
         * The storefront names its venue, and it has to: the 86 sheet belongs to
         * a kitchen rather than to a business — `EloquentStopList` is scoped by
         * `BranchContext` and answers an empty list without one. A shop window
         * with no `branch_id` shows every dish as available however many the
         * kitchen has run out of, which is the bug this line is standing on.
         */
        $branch = Branch::factory()->create(['tenant_id' => $this->osh->id]);
        app(BranchContext::class)->set($branch);

        $store = Store::factory()->create([
            'tenant_id' => $this->osh->id, 'branch_id' => $branch->id, 'slug' => 'osh-xona',
        ]);
        StoreItem::create(['store_id' => $store->id, 'menu_item_id' => $plov->id]);
        StoreItem::create(['store_id' => $store->id, 'menu_item_id' => $somsa->id]);

        // 86'd: the kitchen has run out tonight.
        $this->assertTrue(app(StopList::class)->stop($somsa->id, 'Tugadi'));

        $menu = collect((array) $this->getJson('/api/v1/mp/stores/osh-xona')->assertOk()->json('data.menu'))
            ->keyBy('menu_item_id');

        /*
         * Both still drawn, one crossed out. Hiding it would tell a guest the
         * restaurant does not make somsa; showing it available would take an
         * order nobody can cook. This read `find()` once, which the catalogue
         * contract documents as always answering `is_stopped: false` — so every
         * sold-out dish was on sale.
         */
        $this->assertCount(2, $menu);
        $this->assertFalse($menu[$plov->id]['sold_out']);
        $this->assertTrue($menu[$somsa->id]['sold_out']);
    }

    public function test_a_dish_the_kitchen_ran_out_of_cannot_be_put_in_a_basket(): void
    {
        $owner = User::factory()->create(['tenant_id' => $this->osh->id]);
        $owner->assignRole('owner');
        $this->actingAs($owner);

        $branch = Branch::factory()->create(['tenant_id' => $this->osh->id]);
        app(BranchContext::class)->set($branch);

        $somsa = MenuItem::factory()->create(['sku' => 'SMS-1', 'price' => 1_200_000]);
        $store = Store::factory()->create([
            'tenant_id' => $this->osh->id, 'branch_id' => $branch->id, 'slug' => 'osh-xona',
        ]);
        StoreItem::create(['store_id' => $store->id, 'menu_item_id' => $somsa->id]);

        $this->assertTrue(app(StopList::class)->stop($somsa->id, 'Tugadi'));

        $consumer = Consumer::factory()->create();
        $this->app['auth']->forgetGuards();
        app(TenantContext::class)->clear();
        app(BranchContext::class)->clear();
        $this->withHeader('Authorization', 'Bearer '.$consumer->createToken('t', [Consumer::ABILITY])->plainTextToken);

        // The screen may draw it; the server must not sell it.
        $this->postJson('/api/v1/mp/orders', [
            'store' => 'osh-xona',
            'lines' => [['menu_item_id' => $somsa->id, 'quantity' => 1]],
            'address' => 'Chilonzor 24',
        ])->assertApiError('marketplace.dish_unavailable', 'lines');
    }

    public function test_the_window_never_answers_for_a_shop_that_does_not_exist(): void
    {
        $this->getJson('/api/v1/mp/stores/nothing-here')->assertApiError('marketplace.store_not_found');
    }
}
