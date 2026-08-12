<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Tenant;
use App\Support\Tenancy\TenantContext;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Cross-tenant isolation + middleware resolution tests.
 *
 * Tests split into two classes by infra requirement:
 *   - This file: middleware logic without DB (always runs)
 *   - {@see TenantIsolationTest}: full BelongsToTenant trait + global scope
 *     verification — needs a working PDO driver (pdo_sqlite or pdo_pgsql).
 *     Skipped automatically if no compatible driver is loaded.
 */
final class TenantResolutionTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware('tenant')->get('/tenant-probe', static fn () => response()->json([
            'tenant_id' => app(TenantContext::class)->id(),
            'has_tenant' => app(TenantContext::class)->hasTenant(),
        ]));
    }

    public function test_allows_missing_tenant_when_not_required(): void
    {
        config(['tenancy.require_tenant' => false]);

        $this
            ->getJson('/tenant-probe')
            ->assertOk()
            ->assertJson([
                'tenant_id' => null,
                'has_tenant' => false,
            ]);
    }

    public function test_rejects_missing_tenant_when_required(): void
    {
        config(['tenancy.require_tenant' => true]);

        $this
            ->getJson('/tenant-probe')
            ->assertBadRequest()
            ->assertJson([
                'code' => 'TENANT_REQUIRED',
                'message' => 'Tenant context is required.',
            ]);
    }

    public function test_ignores_empty_header_value(): void
    {
        config(['tenancy.require_tenant' => false]);

        // Empty header should be treated as "no tenant", not as a slug lookup.
        $this
            ->withHeaders(['X-Tenant' => ''])
            ->getJson('/tenant-probe')
            ->assertOk()
            ->assertJson(['tenant_id' => null]);
    }

    public function test_tenant_context_clears_after_request(): void
    {
        config(['tenancy.require_tenant' => false]);

        $this->getJson('/tenant-probe')->assertOk();

        // After the request finishes the middleware's finally{} block must clear
        // the singleton — otherwise tenant context bleeds across requests in
        // pooled/persistent workers (Octane, Reverb, queue workers).
        $this->assertNull(app(TenantContext::class)->id());
        $this->assertFalse(app(TenantContext::class)->hasTenant());
    }
}
