<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Errors\ErrorResponse;
use App\Support\Tenancy\DatabaseTenancy;
use App\Support\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Decides which restaurant this request is operating in.
 *
 * Resolution order:
 *   1. `X-Tenant` header      — canonical for the API, POS, bots
 *   2. subdomain              — production routing
 *   3. the signed-in user's own tenant
 *
 * The third step is what makes the platform usable: a waiter's tablet should
 * not have to know its restaurant's slug. The first two exist for clients that
 * legitimately act across tenants (platform staff, the guest QR menu).
 *
 * Security rule: a user who belongs to a tenant is PINNED to it. Asking for a
 * different one is refused outright rather than quietly returning an empty
 * list — an empty list looks like "no data" and hides the attempt.
 */
final readonly class ResolveTenant
{
    public function __construct(
        private TenantContext $context,
        private DatabaseTenancy $database,
    ) {}

    /**
     * @param Closure(Request): Response $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $requested = $this->resolveFromHeader($request) ?? $this->resolveFromSubdomain($request);

        $user = $request->user();
        $ownTenantId = $user instanceof User ? $user->tenant_id : null;

        if ($ownTenantId !== null) {
            if ($requested !== null && $requested->id !== $ownTenantId) {
                return ErrorResponse::code('tenant.mismatch');
            }

            // No header, or a header naming their own restaurant: use theirs.
            $requested ??= Tenant::query()
                ->where('id', $ownTenantId)
                ->where('status', 'active')
                ->first();

            if ($requested === null) {
                return ErrorResponse::code('tenant.inactive');
            }
        }

        // The platform operator is the one identity that legitimately stands
        // outside every restaurant: tenant_id null, super-admin role, signed
        // in through /admin/login. Refusing them under require_tenant would
        // break their logout (leaving revoked-in-name-only tokens alive) and
        // every platform console endpoint, which are cross-tenant by
        // definition. Note the order — a super-admin who DID name a tenant
        // resolved above and is scoped like anybody else.
        $isPlatformOperator = $requested === null
            && $user instanceof User
            && $ownTenantId === null
            && $user->hasRole('super-admin');

        if ($requested === null && ! $isPlatformOperator && config('tenancy.require_tenant')) {
            // Everyone else without a tenant is exactly who this flag exists
            // to stop: a till that forgot its header must not read the whole
            // platform.
            return ErrorResponse::code('tenant.required');
        }

        $this->context->set($requested);

        // The database now learns the same answer the application did. For a
        // resolved tenant the RLS policies scope every guarded table to it;
        // for the platform operator they open (their reads are cross-tenant
        // by definition); for anything else they stay closed, so a query that
        // reaches the database without a tenant reads nothing rather than
        // everything.
        if ($requested !== null) {
            $this->database->focus($requested->id);
        } elseif ($isPlatformOperator) {
            $this->database->bypass();
        } else {
            // Said out loud rather than left to whatever the process happened
            // to be in. This branch used to do nothing, which was accidentally
            // right in production (a web process rests fail-closed) and wrong
            // under tests, where a console process rests on BYPASS — so every
            // feature test ran with row-level security effectively off, and a
            // whole class of RLS bug was invisible to the suite. It cost a
            // real one: pairing a terminal reads across tenants by design, the
            // policies refused it in production, and 624 green tests said
            // nothing.
            $this->database->close();
        }

        try {
            return $next($request);
        } finally {
            $this->context->clear();
            $this->database->reset();
        }
    }

    private function resolveFromHeader(Request $request): ?Tenant
    {
        $slug = trim((string) $request->header((string) config('tenancy.header')));

        if ($slug === '') {
            return null;
        }

        return Tenant::query()
            ->where('slug', $slug)
            ->where('status', 'active')
            ->first();
    }

    private function resolveFromSubdomain(Request $request): ?Tenant
    {
        $host = $request->getHost();
        $centralDomains = config('tenancy.central_domains', []);

        if (in_array($host, $centralDomains, true)) {
            return null;
        }

        $slug = explode('.', $host)[0] ?? null;

        if ($slug === null || $slug === 'www') {
            return null;
        }

        return Tenant::query()
            ->where('slug', $slug)
            ->where('status', 'active')
            ->first();
    }
}
