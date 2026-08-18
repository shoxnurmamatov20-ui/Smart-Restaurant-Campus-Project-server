<?php

declare(strict_types=1);

namespace Tests\Architecture;

use App\Http\Middleware\StartTenancyClosed;
use App\Support\Tenancy\DatabaseTenancy;
use Illuminate\Routing\Route as CompiledRoute;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Every API route says which restaurant it is for, or says why it cannot.
 *
 * Row-level security fails closed: a request that never claims a tenant reads
 * nothing and writes nothing. That is the right default, and it means a route
 * without tenant resolution is not "unscoped" any more — it is broken, and
 * broken in the quietest possible way. An empty list is a valid-looking answer
 * and a refused insert is a 500 nobody attributes to tenancy.
 *
 * It cost four production paths before this test existed, all of them green in
 * CI at the time: pairing a terminal, every Telegram bot endpoint, the platform
 * operator's sign-in, and the outbox health check — which reported a healthy
 * empty outbox no matter how large the backlog, because it could not see a
 * single row.
 *
 * So: either a route carries ResolveTenant, or it is listed below with the
 * reason it does not need to. Adding a route to the list is a decision someone
 * has to write a sentence for.
 *
 * @see StartTenancyClosed why a request starts with none
 * @see DatabaseTenancy::withoutTenancy() the escape hatch
 */
final class TenancyClaimTest extends TestCase
{
    /**
     * Routes that resolve no tenant, and why that is correct.
     *
     * @var array<string, string>
     */
    private const TENANTLESS = [
        // Platform-level, by definition: these answer for the whole node.
        'api/health' => 'node health — counts the outbox across every restaurant, via withoutTenancy()',
        'api/health/live' => 'liveness — touches no tenanted table',
        'api/health/ready' => 'readiness — touches no tenanted table',

        // Identity. `public.users` is the one table exempt from row-level
        // security precisely so these can work: auth:sanctum resolves a token's
        // owner before any middleware has established a tenant, and guarding
        // users would make every sign-in on the platform fail.
        'api/v1/auth/login' => 'sign-in — reads users, which is RLS-exempt for exactly this reason',
        'api/v1/auth/register' => 'sign-up — CREATES the restaurant, then claims it mid-transaction',
        'api/v1/admin/login' => 'platform operator — belongs to no restaurant; its audit row is written via withoutTenancy()',

        // The device door. A tablet holding nothing but an eight-character
        // code cannot name its restaurant, because working out which one it
        // belongs to is the entire purpose of the code.
        'api/v1/pos/terminals/pair' => 'pairing — the code IS the identity; the lookup runs in withoutTenancy()',
    ];

    public function test_every_api_route_claims_a_tenant_or_says_why_not(): void
    {
        $unclaimed = [];

        foreach (Route::getRoutes()->getRoutes() as $route) {
            /** @var CompiledRoute $route */
            $uri = $route->uri();

            if (! str_starts_with($uri, 'api/')) {
                continue;
            }

            if ($this->resolvesATenant($route)) {
                continue;
            }

            if (array_key_exists($uri, self::TENANTLESS)) {
                continue;
            }

            $unclaimed[] = $uri;
        }

        $this->assertSame([], $unclaimed, sprintf(
            "These routes resolve no tenant, so with row-level security live they read nothing\n"
            ."and write nothing:\n  - %s\n\n"
            ."Give them the `tenant` middleware, or add them to TenancyClaimTest::TENANTLESS\n"
            .'with the reason they do not need one.',
            implode("\n  - ", $unclaimed),
        ));
    }

    public function test_the_documented_exceptions_all_still_exist(): void
    {
        // A stale exemption is worse than none: it silently covers whatever
        // route later takes that path.
        $live = [];

        foreach (Route::getRoutes()->getRoutes() as $route) {
            /** @var CompiledRoute $route */
            $live[$route->uri()] = true;
        }

        foreach (array_keys(self::TENANTLESS) as $uri) {
            $this->assertArrayHasKey($uri, $live, "TENANTLESS lists {$uri}, which is no longer a route.");
        }
    }

    private function resolvesATenant(CompiledRoute $route): bool
    {
        foreach ($route->gatherMiddleware() as $middleware) {
            if (! is_string($middleware)) {
                continue;
            }

            if ($middleware === 'tenant' || str_contains($middleware, 'ResolveTenant')) {
                return true;
            }
        }

        return false;
    }
}
