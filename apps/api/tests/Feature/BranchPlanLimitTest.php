<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\PlatformPlan;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A restaurant may not open more venues than it is paying for.
 *
 * `POST /api/v1/branches` has existed since the foundation and counted nothing,
 * which meant the platform sold a two-branch tier and shipped an endpoint that
 * would create twenty. The ceiling is `platform_plans.branch_limit` — nullable,
 * and null genuinely means no ceiling, because "no limit" written as 999999 is
 * a limit somebody hits at three in the morning.
 */
final class BranchPlanLimitTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        PlatformPlan::query()->create([
            'key' => 'start', 'price_tiyin' => 49_000_00, 'branch_limit' => 2,
            'position' => 1, 'is_active' => true,
        ]);
        PlatformPlan::query()->create([
            'key' => 'enterprise', 'price_tiyin' => 499_000_00, 'branch_limit' => null,
            'position' => 3, 'is_active' => true,
        ]);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona-plan', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
            'plan_key' => 'start',
        ]);
        app(TenantContext::class)->set($this->tenant);
    }

    private function actingAsOwner(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    private function venue(string $name, string $slug): Branch
    {
        return Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => $name, 'slug' => $slug,
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    public function test_a_venue_within_the_plan_is_created(): void
    {
        $this->actingAsOwner();
        $this->venue('Chilonzor', 'chilonzor');

        $this->postJson('/api/v1/branches', ['name' => 'Termiz', 'slug' => 'termiz'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Termiz');
    }

    public function test_the_venue_past_the_ceiling_is_refused_with_a_price_not_a_validation(): void
    {
        $this->actingAsOwner();
        $this->venue('Chilonzor', 'chilonzor');
        $this->venue('Termiz', 'termiz');

        $this->postJson('/api/v1/branches', ['name' => 'Sergeli', 'slug' => 'sergeli'])
            ->assertApiError('plan.limit_exceeded')
            ->assertJsonPath('error.limit', 2)
            ->assertJsonPath('error.plan', 'start');

        $this->assertSame(2, Branch::query()->count());
    }

    public function test_an_archived_venue_does_not_free_a_slot(): void
    {
        $this->actingAsOwner();
        $this->venue('Chilonzor', 'chilonzor');
        $this->venue('Termiz', 'termiz')->delete();

        // A soft-deleted venue still holds its name, its slug and every order
        // it ever took, and coming back is one restore away. Letting a third be
        // created would put the restaurant over its ceiling the moment anybody
        // restored it.
        $this->postJson('/api/v1/branches', ['name' => 'Sergeli', 'slug' => 'sergeli'])
            ->assertApiError('plan.limit_exceeded');
    }

    public function test_a_tier_with_no_ceiling_has_no_ceiling(): void
    {
        $this->tenant->forceFill(['plan_key' => 'enterprise'])->save();
        $this->actingAsOwner();

        foreach (['a', 'b', 'c', 'd'] as $slug) {
            $this->venue("Venue {$slug}", $slug);
        }

        $this->postJson('/api/v1/branches', ['name' => 'Fifth', 'slug' => 'fifth'])->assertCreated();
    }

    public function test_a_restaurant_on_no_plan_is_not_refused(): void
    {
        $this->tenant->forceFill(['plan_key' => null])->save();
        $this->actingAsOwner();
        $this->venue('Chilonzor', 'chilonzor');
        $this->venue('Termiz', 'termiz');

        // An operator who has not put a tenant on a tier has not decided
        // anything, and refusing them would be this code deciding for them.
        $this->postJson('/api/v1/branches', ['name' => 'Sergeli', 'slug' => 'sergeli'])->assertCreated();
    }

    public function test_another_restaurants_venues_do_not_count_against_this_one(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Lagmon', 'slug' => 'lagmon-plan', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
            'plan_key' => 'start',
        ]);

        Branch::query()->create([
            'tenant_id' => $other->id, 'name' => 'Their one', 'slug' => 'their-one',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        Branch::query()->create([
            'tenant_id' => $other->id, 'name' => 'Their two', 'slug' => 'their-two',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $this->actingAsOwner();

        // The count runs through the tenant scope, so a busy neighbour cannot
        // spend this restaurant's allowance.
        $this->postJson('/api/v1/branches', ['name' => 'Chilonzor', 'slug' => 'chilonzor'])
            ->assertCreated();
    }
}
