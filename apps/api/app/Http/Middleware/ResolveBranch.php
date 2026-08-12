<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\Branch;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Decides which venue of the restaurant this request is operating in.
 *
 * Runs immediately after ResolveTenant, and depends on it: a branch is only
 * meaningful once the restaurant is known, and a branch belonging to a
 * different restaurant must never resolve.
 *
 * Resolution order:
 *   1. `X-Branch` header — canonical for the API, POS terminals and the
 *      top-bar branch switcher
 *   2. the signed-in user's own branch, when they are pinned to one
 *   3. nothing — which means "every branch of this restaurant"
 *
 * Step 3 is a feature. An owner comparing five venues, an accountant closing
 * the month and every group-level report run with no branch set, and the
 * BelongsToBranch scope simply does not narrow. That is why this middleware
 * has no `require_branch` equivalent to tenancy's: a request without a branch
 * is a roll-up, not a leak.
 *
 * Security rule, same shape as ResolveTenant: a user pinned to a branch cannot
 * ask for another one. The answer is a refusal, not an empty list — an empty
 * list reads as "nothing happened here today" and hides the attempt.
 */
final readonly class ResolveBranch
{
    public function __construct(
        private BranchContext $context,
        private TenantContext $tenants,
    ) {}

    /**
     * @param Closure(Request): Response $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $requested = $this->resolveFromHeader($request);

        if ($requested === false) {
            return response()->json([
                'message' => 'Bunday filial topilmadi.',
                'code' => 'BRANCH_NOT_FOUND',
            ], Response::HTTP_NOT_FOUND);
        }

        $user = $request->user();
        $ownBranchId = $user instanceof User ? $user->branch_id : null;

        if ($ownBranchId !== null) {
            if ($requested !== null && $requested->id !== $ownBranchId) {
                return response()->json([
                    'message' => 'Siz boshqa filial ma\'lumotiga kira olmaysiz.',
                    'code' => 'BRANCH_MISMATCH',
                ], Response::HTTP_FORBIDDEN);
            }

            $requested ??= Branch::query()->whereKey($ownBranchId)->first();

            if ($requested === null || ! $requested->isActive()) {
                return response()->json([
                    'message' => 'Filial faol emas.',
                    'code' => 'BRANCH_INACTIVE',
                ], Response::HTTP_FORBIDDEN);
            }
        }

        $this->context->set($requested);

        try {
            return $next($request);
        } finally {
            $this->context->clear();
        }
    }

    /**
     * @return Branch|null|false false when a slug was given but matched nothing
     */
    private function resolveFromHeader(Request $request): Branch|null|false
    {
        $slug = trim((string) $request->header((string) config('tenancy.branch_header')));

        if ($slug === '') {
            return null;
        }

        $tenantId = $this->tenants->id();

        if ($tenantId === null) {
            // No restaurant resolved, so no branch can be trusted to belong to
            // one. Silently ignoring the header would run the request
            // unscoped, which is exactly the leak this class exists to stop.
            return false;
        }

        $branch = Branch::query()
            ->withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('slug', $slug)
            ->where('status', 'active')
            ->first();

        return $branch ?? false;
    }
}
