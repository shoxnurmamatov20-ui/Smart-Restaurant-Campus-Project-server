<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\Tenant;
use App\Models\User;
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
    public function __construct(private TenantContext $context) {}

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
                return response()->json([
                    'message' => 'Siz boshqa restoran ma\'lumotiga kira olmaysiz.',
                    'code' => 'TENANT_MISMATCH',
                ], Response::HTTP_FORBIDDEN);
            }

            // No header, or a header naming their own restaurant: use theirs.
            $requested ??= Tenant::query()
                ->where('id', $ownTenantId)
                ->where('status', 'active')
                ->first();

            if ($requested === null) {
                return response()->json([
                    'message' => 'Restoran faol emas.',
                    'code' => 'TENANT_INACTIVE',
                ], Response::HTTP_FORBIDDEN);
            }
        }

        if ($requested === null && config('tenancy.require_tenant')) {
            return response()->json([
                'message' => 'Tenant context is required.',
                'code' => 'TENANT_REQUIRED',
            ], Response::HTTP_BAD_REQUEST);
        }

        $this->context->set($requested);

        try {
            return $next($request);
        } finally {
            $this->context->clear();
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
