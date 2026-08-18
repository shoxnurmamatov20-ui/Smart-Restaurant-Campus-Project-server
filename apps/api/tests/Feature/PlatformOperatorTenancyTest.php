<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * `require_tenant` and the one identity allowed past it.
 *
 * When the flag went on in production, the platform operator broke in a way
 * nothing reported: their logout hit the tenant middleware with no tenant to
 * resolve, got `tenant.required`, and the token it was meant to revoke stayed
 * alive. The operator — tenant_id null, super-admin, signed in through
 * /admin/login — is the one caller for whom "no restaurant" is the truth
 * rather than a forgotten header. These tests pin the exact width of that
 * exception, because an exception in tenancy enforcement that drifts wider is
 * a cross-tenant read.
 */
final class PlatformOperatorTenancyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPermissionsSeeder::class);
        config(['tenancy.require_tenant' => true]);

        Route::middleware(['auth:sanctum', 'tenant'])->get('/operator-probe', static fn () => response()->json([
            'tenant_id' => app(TenantContext::class)->id(),
        ]));
    }

    private function tenant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug), 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    private function operator(): User
    {
        $operator = User::factory()->create(['tenant_id' => null]);
        $operator->assignRole('super-admin');

        return $operator;
    }

    public function test_the_platform_operator_passes_without_naming_a_restaurant(): void
    {
        $this->actingAs($this->operator());

        // No header, no own tenant — and that is the truth, not an omission.
        $this->getJson('/operator-probe')
            ->assertOk()
            ->assertJson(['tenant_id' => null]);
    }

    public function test_a_tenantless_user_without_the_role_is_still_refused(): void
    {
        // The exception is the super-admin ROLE, not the null tenant_id: a
        // half-provisioned account must not read the platform by accident.
        $this->actingAs(User::factory()->create(['tenant_id' => null]));

        $this->getJson('/operator-probe')->assertApiError('tenant.required');
    }

    public function test_an_operator_who_names_a_restaurant_is_scoped_to_it(): void
    {
        $tenant = $this->tenant('demo-restaurant');
        $this->actingAs($this->operator());

        // The carve-out is only for the tenantless case — with a header they
        // are scoped exactly like anybody else.
        $this->withHeaders(['X-Tenant' => $tenant->slug])
            ->getJson('/operator-probe')
            ->assertOk()
            ->assertJson(['tenant_id' => $tenant->id]);
    }

    public function test_the_operators_logout_actually_revokes_the_token(): void
    {
        // The regression that surfaced all of this: logout lives inside the
        // tenant group, so refusing the operator left "revoked" tokens alive.
        $operator = $this->operator();
        $token = $operator->createToken('platform')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/auth/logout')
            ->assertOk();

        $this->assertSame(0, $operator->tokens()->count());
    }
}
