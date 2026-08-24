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
        'api/v1/auth/forgot-password' => 'reads users (RLS-exempt) and writes password_reset_tokens, which is keyed by email and has no tenant',
        'api/v1/auth/reset-password' => 'same two tables as forgot-password; the token is the proof, not a tenant',
        'api/v1/auth/register' => 'sign-up — CREATES the restaurant, then claims it mid-transaction',
        'api/v1/admin/login' => 'platform operator — belongs to no restaurant; its audit row is written via withoutTenancy()',

        // The device door. A tablet holding nothing but an eight-character
        // code cannot name its restaurant, because working out which one it
        // belongs to is the entire purpose of the code.
        'api/v1/pos/terminals/pair' => 'pairing — the code IS the identity; the lookup runs in withoutTenancy()',

        // The same door for a personal phone. A handset that has never been
        // enrolled holds no token and no restaurant, and working out which
        // restaurant it belongs to is the entire purpose of the code.
        'api/v1/staff/devices/pair' => 'enrolment — the code IS the identity; the lookup runs in withoutTenancy()',

        /*
         * Fetching an archive from the link we mailed. There is no `X-Tenant`
         * the caller could send that would mean anything: they have no session,
         * and a header a stranger sets is not a credential.
         *
         * The signed URL names the export row, and the row names the
         * restaurant — so the tenant is DERIVED from what was signed rather
         * than claimed by the request. The lookup runs in withoutTenancy() for
         * exactly the same reason terminal pairing does: working out which
         * restaurant this is for is the purpose of the request.
         */
        'api/v1/exports/{export}/download' => 'a signed archive link — the signature names the row, and the row names the restaurant; the lookup runs in withoutTenancy()',

        /*
         * The marketplace's consumer surface — the first thing on this platform
         * that stands ABOVE tenancy rather than inside it.
         *
         * A MyPOS customer has no restaurant. They browse forty of them, order
         * from one this evening and a different one tomorrow, and their account,
         * their address book and their order history belong to all of it. There
         * is no `X-Tenant` they could send: asking somebody to name a restaurant
         * before they have chosen one is the opposite of what a marketplace is.
         *
         * So these read across restaurants deliberately, and the reads are
         * scoped by something other than tenancy — which is the test each one
         * has to pass to be on this list:
         *
         *   the directory   is a shop window. Names, cuisines, delivery windows,
         *                   ratings, prices. Published on purpose; no customer,
         *                   no order, no takings and no commission is reachable.
         *   the front door  authenticates a phone number, and touches only the
         *                   tenant-free `marketplace.consumers`.
         *   everything else is scoped by `consumer_id` from a verified token —
         *                   see RequireConsumerToken and ConsumerOrderController,
         *                   which never take an id from a URL.
         *
         * `StorefrontDirectory` is the ONE class allowed to open the connection,
         * and the writes go back INTO the store's tenancy through `asStore()` so
         * every row is stamped and every policy is on while it is written.
         *
         * The merchant half of this module — `api/v1/marketplace/*` — carries
         * the `tenant` group like everything else and is deliberately absent
         * from this list.
         */
        'api/v1/mp/stores' => 'the marketplace directory: forty restaurants, no login; reads via StorefrontDirectory',
        'api/v1/mp/stores/{store}' => 'one shop window and its prices; the menu is read inside asStore()',
        'api/v1/mp/auth/otp' => 'a phone asking for a code; marketplace.consumers is tenant-free',
        'api/v1/mp/auth/otp/verify' => 'the code, for a token; marketplace.consumers is tenant-free',
        'api/v1/mp/me' => 'your own profile — the token is the scope',
        'api/v1/mp/me/addresses' => 'your own address book — the token is the scope',
        'api/v1/mp/plus' => 'your own subscription — the token is the scope',
        'api/v1/mp/plus/subscribe' => 'starting your own subscription — the token is the scope',
        'api/v1/mp/plus/cancel' => 'stopping your own subscription — the token is the scope',
        /*
         * A shopper's handset. The row it writes carries `tenant_id = null`,
         * because a MyPOS customer belongs to the platform rather than to any
         * restaurant — so the ONE insert runs inside
         * `App\Support\Push\GuestTokens`, which opens the connection for it and
         * for nothing else. CRM's `public/push/tokens` is the same endpoint for
         * a restaurant's own guest and carries the `tenant` group in the
         * ordinary way, which is why it is deliberately absent from this list.
         */
        'api/v1/mp/push/tokens' => 'your own phone; the row is tenant-free and written via GuestTokens',
        'api/v1/mp/orders' => 'your own orders, which cross restaurants because you do',
        'api/v1/mp/orders/{number}' => 'one of your own orders, scoped by consumer_id AND number',
        'api/v1/mp/orders/{number}/cancel' => 'as above; the write runs inside the store’s tenancy',
        'api/v1/mp/orders/{number}/rate' => 'as above; the write runs inside the store’s tenancy',
        'api/v1/mp/orders/{number}/dispute' => 'as above; the write runs inside the store’s tenancy',
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
