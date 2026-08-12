<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Orders\Models\Order;
use Modules\Tables\Models\Hall;
use Tests\TestCase;

/**
 * The wall between two venues of the same restaurant.
 *
 * TenantIsolationTest guards one business from another. This guards one
 * address from another inside the same business, which is a different problem
 * with a different failure: the rows are legitimately owned by the signed-in
 * user's restaurant, so no permission check catches a leak. A branch manager
 * reading the whole chain's takings is not a security breach in the usual
 * sense — it is simply the wrong number on their screen, every day, silently.
 *
 * Note the deliberate asymmetry with tenancy: an empty tenant context is a
 * hole, an empty branch context is a roll-up. The owner is *supposed* to see
 * all five venues at once, so "no branch set" must return everything rather
 * than nothing, and that is tested here too.
 */
final class BranchIsolationTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $chilonzor;

    private Branch $termiz;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);

        $this->chilonzor = Branch::factory()->named('Chilonzor', 'CHZ')->create(['tenant_id' => $this->tenant->id]);
        $this->termiz = Branch::factory()->named('Termiz', 'TRM', 'Termiz')->create(['tenant_id' => $this->tenant->id]);
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    /** Create a hall at a named venue, whatever the ambient context is. */
    private function hallAt(Branch $branch, string $code): Hall
    {
        $previous = app(BranchContext::class)->branch();
        app(BranchContext::class)->set($branch);

        try {
            return Hall::query()->create([
                'code' => $code,
                'name' => $code.' zali',
                'capacity' => 40,
            ]);
        } finally {
            app(BranchContext::class)->set($previous);
        }
    }

    public function test_a_venue_lists_only_its_own_halls(): void
    {
        $this->hallAt($this->chilonzor, 'CHZ-MAIN');
        $this->hallAt($this->termiz, 'TRM-MAIN');

        app(BranchContext::class)->set($this->chilonzor);

        $codes = Hall::query()->pluck('code');

        $this->assertContains('CHZ-MAIN', $codes);
        $this->assertNotContains('TRM-MAIN', $codes, 'Chilonzor is reading a hall that stands in Termiz.');
    }

    public function test_no_branch_set_rolls_up_every_venue(): void
    {
        $this->hallAt($this->chilonzor, 'CHZ-MAIN');
        $this->hallAt($this->termiz, 'TRM-MAIN');

        app(BranchContext::class)->clear();

        $codes = Hall::query()->pluck('code');

        // The owner's view: both venues at once. This is the case that must NOT
        // behave like tenancy, where an empty context is a bug.
        $this->assertContains('CHZ-MAIN', $codes);
        $this->assertContains('TRM-MAIN', $codes);
    }

    public function test_a_new_row_is_stamped_with_the_active_branch(): void
    {
        app(BranchContext::class)->set($this->termiz);

        $hall = Hall::query()->create(['code' => 'AUTO', 'name' => 'Avtomatik', 'capacity' => 10]);

        $this->assertSame($this->termiz->id, $hall->branch_id);
        $this->assertSame($this->tenant->id, $hall->tenant_id, 'Branch stamping must not replace tenant stamping.');
    }

    public function test_an_order_at_one_venue_is_invisible_at_another(): void
    {
        app(BranchContext::class)->set($this->chilonzor);
        $mine = Order::factory()->create();

        app(BranchContext::class)->set($this->termiz);

        $this->assertNull(
            Order::query()->find($mine->id),
            'A bill opened in Chilonzor showed up on the Termiz till.'
        );
    }

    public function test_a_pinned_user_cannot_ask_for_another_venue(): void
    {
        $user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
        ]);
        $user->assignRole('branch-manager');

        $response = $this->actingAs($user)
            ->withHeaders(['X-Tenant' => $this->tenant->slug, 'X-Branch' => $this->termiz->slug])
            ->getJson('/api/v1/branches');

        // A refusal, not an empty list: an empty list reads as "quiet day in
        // Termiz" and hides the fact that someone asked.
        $response->assertForbidden();
        $response->assertJsonPath('code', 'BRANCH_MISMATCH');
    }

    public function test_an_unpinned_user_may_choose_a_venue(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'branch_id' => null]);
        $user->assignRole('owner');

        $response = $this->actingAs($user)
            ->withHeaders(['X-Tenant' => $this->tenant->slug, 'X-Branch' => $this->termiz->slug])
            ->getJson('/api/v1/auth/context');

        $response->assertOk();
        $response->assertJsonPath('branch.slug', $this->termiz->slug);
        $response->assertJsonPath('branch_pinned', false);
    }

    public function test_a_branch_from_another_restaurant_never_resolves(): void
    {
        $other = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $theirs = Branch::factory()->named('Chilonzor', 'CHZ')->create(['tenant_id' => $other->id]);

        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'branch_id' => null]);
        $user->assignRole('owner');

        // Same slug, different restaurant. Resolving it would hand one chain's
        // numbers to another under a name they both legitimately use.
        $response = $this->actingAs($user)
            ->withHeaders(['X-Tenant' => $this->tenant->slug, 'X-Branch' => $theirs->slug])
            ->getJson('/api/v1/auth/context');

        $response->assertOk();
        $response->assertJsonPath('branch.id', $this->chilonzor->id);
    }

    public function test_an_unknown_branch_slug_is_refused_rather_than_ignored(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'branch_id' => null]);
        $user->assignRole('owner');

        // Ignoring the header would silently run the request across every
        // venue — the opposite of what the caller asked for.
        $response = $this->actingAs($user)
            ->withHeaders(['X-Tenant' => $this->tenant->slug, 'X-Branch' => 'yoq-filial'])
            ->getJson('/api/v1/auth/context');

        $response->assertNotFound();
        $response->assertJsonPath('code', 'BRANCH_NOT_FOUND');
    }

    public function test_a_pinned_user_sees_only_their_own_venue_in_the_switcher(): void
    {
        $user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
        ]);
        $user->assignRole('branch-manager');

        $response = $this->actingAs($user)
            ->withHeaders(['X-Tenant' => $this->tenant->slug])
            ->getJson('/api/v1/branches');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.slug', $this->chilonzor->slug);
    }
}
