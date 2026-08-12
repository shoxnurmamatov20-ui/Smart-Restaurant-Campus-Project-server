<?php

declare(strict_types=1);

namespace Modules\Menu\Tests\Feature;

use App\Models\Tenant;
use App\Support\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Tests\TestCase;

/**
 * The QR menu under load.
 *
 * Every guest at every table opens this, usually more than once, and nobody has
 * to log in first — so it is both the busiest endpoint on the platform and the
 * easiest to hammer. What is asserted here is that a second guest costs nothing,
 * that a returning phone re-downloads nothing, and — the part that actually
 * matters to a chef — that a price change still reaches the table.
 */
final class PublicMenuCacheTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private MenuItem $dish;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);

        $category = MenuCategory::factory()->create([
            'tenant_id' => $this->tenant->id,
            'is_active' => true,
            'parent_id' => null,
            'name' => ['uz' => 'Issiq taomlar', 'ru' => 'Горячие блюда', 'en' => 'Hot dishes'],
        ]);

        $this->dish = MenuItem::factory()->create([
            'tenant_id' => $this->tenant->id,
            'menu_category_id' => $category->id,
            'name' => ['uz' => 'Osh', 'ru' => 'Плов', 'en' => 'Pilaf'],
            'price' => 4500000,
            'is_available' => true,
            'status' => 'active',
            'stopped_until' => null,
        ]);
    }

    /**
     * @param array<string, string> $headers
     */
    private function menu(array $headers = [])
    {
        return $this->withHeaders($headers + [
            'X-Tenant' => 'osh-markazi',
            'Accept-Language' => '',
        ])->getJson('/api/v1/public/menu');
    }

    /** How many queries one request actually costs. */
    private function queriesFor(callable $request): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();

        $request();

        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    // ============ Cost per guest ============

    public function test_the_second_guest_does_not_touch_the_menu_tables(): void
    {
        $this->menu()->assertOk();

        $queries = $this->queriesFor(fn () => $this->menu()->assertOk());

        // The tenant lookup still happens — that is the middleware resolving the
        // restaurant — but nothing reads categories or items again.
        $menuQueries = collect(DB::getQueryLog())
            ->filter(fn (array $q): bool => str_contains($q['query'], 'menu_items')
                || str_contains($q['query'], 'menu_categories'))
            ->count();

        $this->assertSame(0, $menuQueries, 'The cached menu still queried the menu tables.');
        $this->assertLessThanOrEqual(2, $queries, "A cached menu cost {$queries} queries.");
    }

    public function test_a_returning_phone_is_told_nothing_changed(): void
    {
        $etag = $this->menu()->assertOk()->headers->get('ETag');

        $this->assertNotNull($etag);

        // On a slow mobile connection this is the difference between redrawing
        // instantly and waiting for a payload the phone already has.
        $this->menu(['If-None-Match' => $etag])->assertStatus(304);
    }

    public function test_the_response_tells_caches_how_long_it_is_good_for(): void
    {
        // Symfony normalises the directive order, so match on content.
        $cacheControl = $this->menu()->assertOk()->headers->get('Cache-Control');

        $this->assertStringContainsString('max-age=60', (string) $cacheControl);
        $this->assertStringContainsString('public', (string) $cacheControl);
    }

    // ============ Freshness ============

    public function test_repricing_a_dish_reaches_the_table_immediately(): void
    {
        $this->menu()->assertOk()->assertJsonPath('data.0.items.0.price', 4500000);

        $this->dish->update(['price' => 5000000]);

        // A guest reading yesterday's price is the one thing worse than a slow menu.
        $this->menu()->assertOk()->assertJsonPath('data.0.items.0.price', 5000000);
    }

    public function test_putting_a_dish_on_the_stop_list_reaches_the_table_immediately(): void
    {
        $this->menu()->assertOk()->assertJsonCount(1, 'data.0.items');

        $this->dish->update(['is_available' => false]);

        $this->menu()->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_a_new_dish_appears_without_waiting_for_the_cache_to_expire(): void
    {
        $this->menu()->assertOk()->assertJsonCount(1, 'data.0.items');

        MenuItem::factory()->create([
            'tenant_id' => $this->tenant->id,
            'menu_category_id' => $this->dish->menu_category_id,
            'name' => ['uz' => 'Manti', 'ru' => 'Манты', 'en' => 'Manti'],
            'is_available' => true, 'status' => 'active', 'stopped_until' => null,
        ]);

        $this->menu()->assertOk()->assertJsonCount(2, 'data.0.items');
    }

    // ============ Variants ============

    public function test_each_language_is_cached_separately(): void
    {
        $this->menu(['X-Locale' => 'uz'])->assertOk()->assertJsonPath('data.0.items.0.title', 'Osh');

        // A Russian guest at the next table must not be served the Uzbek copy.
        $this->menu(['X-Locale' => 'ru'])->assertOk()->assertJsonPath('data.0.items.0.title', 'Плов');
        $this->menu(['X-Locale' => 'uz'])->assertOk()->assertJsonPath('data.0.items.0.title', 'Osh');
    }

    public function test_each_channel_is_cached_separately(): void
    {
        $this->dish->update(['channels' => ['dine_in']]);

        $this->withHeaders(['X-Tenant' => 'osh-markazi', 'Accept-Language' => ''])
            ->getJson('/api/v1/public/menu?channel=dine_in')
            ->assertOk()
            ->assertJsonCount(1, 'data.0.items');

        // Delivery does not sell this dish, and must not inherit the dine-in copy.
        $this->withHeaders(['X-Tenant' => 'osh-markazi', 'Accept-Language' => ''])
            ->getJson('/api/v1/public/menu?channel=delivery')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    // ============ Isolation ============

    public function test_one_restaurants_menu_is_never_served_to_another(): void
    {
        $other = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $this->menu()->assertOk()->assertJsonCount(1, 'data.0.items');

        app(TenantContext::class)->set($other);

        // The neighbour has no menu at all — a shared cache key would have given
        // them ours.
        $this->withHeaders(['X-Tenant' => 'city-cafe', 'Accept-Language' => ''])
            ->getJson('/api/v1/public/menu')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_one_restaurants_change_does_not_invalidate_anothers_cache(): void
    {
        $other = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $ours = $this->menu()->assertOk()->headers->get('ETag');

        // A busy neighbour repricing all evening must not keep flushing our menu.
        app(TenantContext::class)->set($other);
        MenuItem::factory()->create(['tenant_id' => $other->id]);

        app(TenantContext::class)->set($this->tenant);

        $this->assertSame($ours, $this->menu()->assertOk()->headers->get('ETag'));
    }
}
