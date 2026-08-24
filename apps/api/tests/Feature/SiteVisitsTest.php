<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\SiteVisit;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Counting who looked at the restaurant's website.
 *
 * The console's Site → Traffic tab drew a whole dashboard — "4 820 visits this
 * week, +18.4%", a conversion rate, a source breakdown — for a platform where
 * nothing counted a visit. This is the counter and the read that let the tab
 * stop saying so, plus the two properties that make a first-party counter
 * trustworthy: it never double-counts, and it never fails the page.
 */
final class SiteVisitsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona-site', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function actingAsOwner(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    public function test_rendering_the_public_site_counts_a_visit(): void
    {
        $this->getJson('/api/v1/public/site', ['X-Tenant' => $this->tenant->slug])->assertOk();
        $this->getJson('/api/v1/public/site', ['X-Tenant' => $this->tenant->slug])->assertOk();

        // One row per (restaurant, day, path), incremented. A visit log would
        // be the flexible choice and the wrong one: nobody is ever shown an
        // individual visit.
        $this->assertSame(1, SiteVisit::query()->count());
        $this->assertSame(2, SiteVisit::query()->firstOrFail()->visits);
        $this->assertSame('/', SiteVisit::query()->firstOrFail()->path);
    }

    public function test_a_query_string_is_not_a_page(): void
    {
        $this->getJson(
            '/api/v1/public/site?path=/menu%3Futm_source%3Dtelegram',
            ['X-Tenant' => $this->tenant->slug],
        )->assertOk();

        // Otherwise every share of the same page is a different page, and the
        // ranking becomes a list of campaign tags.
        $this->assertSame('/menu', SiteVisit::query()->firstOrFail()->path);
    }

    public function test_the_read_answers_a_row_per_day_including_the_quiet_ones(): void
    {
        $this->actingAsOwner();

        SiteVisit::query()->create([
            'tenant_id' => $this->tenant->id,
            'day' => Carbon::today()->toDateString(),
            'path' => '/',
            'visits' => 12,
        ]);

        $response = $this->getJson('/api/v1/site-visits?period=week')->assertOk();

        // Seven rows for a seven-day window. A series that omitted the quiet
        // days would draw a chart whose x-axis lies.
        $this->assertCount(7, $response->json('data.series'));
        $this->assertSame(12, $response->json('meta.visits'));
        $this->assertSame(12, $response->json('data.series.6.visits'));
        $this->assertSame(0, $response->json('data.series.0.visits'));
    }

    public function test_the_window_before_is_answered_so_the_console_can_compare(): void
    {
        $this->actingAsOwner();

        foreach ([['day' => Carbon::today(), 'visits' => 10], ['day' => Carbon::today()->subDays(8), 'visits' => 4]] as $row) {
            SiteVisit::query()->create([
                'tenant_id' => $this->tenant->id,
                'day' => $row['day']->toDateString(),
                'path' => '/',
                'visits' => $row['visits'],
            ]);
        }

        // The difference is drawn by the console. Computing the percentage here
        // would be a figure nobody could check against the two it came from.
        $this->getJson('/api/v1/site-visits?period=week')
            ->assertOk()
            ->assertJsonPath('meta.visits', 10)
            ->assertJsonPath('meta.previous_visits', 4);
    }

    public function test_the_pages_panel_ranks_by_visits(): void
    {
        $this->actingAsOwner();

        foreach ([['/', 40], ['/menu', 90]] as [$path, $visits]) {
            SiteVisit::query()->create([
                'tenant_id' => $this->tenant->id,
                'day' => Carbon::today()->toDateString(),
                'path' => $path,
                'visits' => $visits,
            ]);
        }

        $this->getJson('/api/v1/site-visits')
            ->assertOk()
            ->assertJsonPath('data.pages.0.path', '/menu')
            ->assertJsonPath('data.pages.0.visits', 90);
    }

    public function test_a_reader_without_settings_view_is_refused(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->getJson('/api/v1/site-visits')->assertStatus(403);
    }

    public function test_another_restaurants_traffic_is_invisible(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Boshqa', 'slug' => 'boshqa-site', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($other);
        SiteVisit::query()->create([
            'tenant_id' => $other->id,
            'day' => Carbon::today()->toDateString(),
            'path' => '/',
            'visits' => 500,
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->actingAsOwner();

        $this->getJson('/api/v1/site-visits')
            ->assertOk()
            ->assertJsonPath('meta.visits', 0);
    }
}
