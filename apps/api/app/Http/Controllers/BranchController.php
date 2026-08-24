<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\StoreBranchRequest;
use App\Http\Requests\UpdateBranchRequest;
use App\Http\Resources\BranchResource;
use App\Models\Branch;
use App\Models\PlatformPlan;
use App\Models\User;
use App\Support\Errors\ApiException;
use App\Support\Settings\SettingsSchema;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * The venues of one restaurant business.
 *
 * Core rather than module: several modules point at a branch and none of them
 * owns it. Mounted under /api/v1/branches and gated by `branches.manage`,
 * except for the listing — every signed-in person needs to read the list, if
 * only to render the branch switcher in the top bar.
 *
 * A user pinned to a branch sees exactly that one. Returning the whole chain
 * to a waiter would put five venues in a switcher they are not allowed to open.
 */
final class BranchController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Branch::class)
            ->allowedFilters([
                AllowedFilter::exact('status'),
                AllowedFilter::exact('code'),
                AllowedFilter::partial('name'),
                AllowedFilter::partial('city'),
            ])
            ->allowedSorts(['name', 'code', 'city', 'opened_at', 'created_at'])
            ->when($this->pinnedBranchId($request), fn ($query, int $id) => $query->whereKey($id))
            ->defaultSort('name')
            ->paginate($perPage)
            ->withQueryString();

        return BranchResource::collection($records);
    }

    public function store(StoreBranchRequest $request): BranchResource
    {
        $this->refuseBeyondThePlan();

        // refresh() so database defaults (status, timezone, timestamps) reach
        // the client; without it the response reports null for every column
        // the request did not send.
        $record = Branch::create($request->validated())->refresh();

        return new BranchResource($record);
    }

    public function show(Request $request, Branch $branch): BranchResource
    {
        $this->assertReadable($request, $branch);

        return new BranchResource($branch);
    }

    public function update(UpdateBranchRequest $request, Branch $branch): BranchResource
    {
        $changes = $request->validated();

        /*
         * `settings` is patched, not replaced.
         *
         * The console saves one panel at a time — the target stepper on one
         * screen, the opening hours on another — and `update()` writes the
         * whole jsonb column. Without the merge, saving a target would blank
         * the hours the branch was opened with, and nobody would notice until
         * the website said the venue was shut.
         */
        if (array_key_exists('settings', $changes) && is_array($changes['settings'])) {
            $changes['settings'] = SettingsSchema::merge($branch->settings, $changes['settings']);
        }

        $branch->update($changes);

        return new BranchResource($branch->refresh());
    }

    /**
     * Archives the venue; it is never hard-deleted.
     *
     * A branch is referenced by every order, shift and till reading it ever
     * produced. Removing the row would orphan the history that the accountant
     * still has to close the year with.
     */
    public function destroy(Branch $branch): Response
    {
        $branch->delete();

        return response()->noContent();
    }

    /**
     * A restaurant may not open more venues than it is paying for.
     *
     * The ceiling is `platform_plans.branch_limit`, which is nullable and means
     * exactly what the migration says it means: *"`enterprise` has no branch
     * limit, and 'no limit' written as 999999 is a limit somebody eventually
     * hits at three in the morning."* Null here is no ceiling, and so is a
     * restaurant on no plan at all — an operator who has not put a tenant on a
     * tier has not decided anything, and refusing them would be this code
     * deciding for them.
     *
     * Counted with `withTrashed()`. A soft-deleted venue still holds its name,
     * its slug and every order it ever took, and coming back is one restore
     * away — so a chain that archived two branches has not freed two slots, and
     * letting them create past the ceiling would put them over it the moment
     * anybody restored one.
     *
     * `plan.limit_exceeded` is 402 rather than 422, and that is the right
     * status here: nothing about the request is malformed, and what fixes it is
     * a payment rather than an edit.
     *
     * Read outside tenancy — `platform_plans` belongs to nobody, which is what
     * makes it the platform's (see ModuleBoundaryTest::TENANT_FREE_TABLES).
     */
    private function refuseBeyondThePlan(): void
    {
        $tenant = app(TenantContext::class)->tenant();

        if ($tenant?->plan_key === null) {
            return;
        }

        $limit = PlatformPlan::query()->where('key', $tenant->plan_key)->value('branch_limit');

        if ($limit === null) {
            return;
        }

        if (Branch::query()->withTrashed()->count() >= (int) $limit) {
            throw ApiException::of('plan.limit_exceeded', field: 'name', meta: [
                'limit' => (int) $limit,
                'plan' => $tenant->plan_key,
            ]);
        }
    }

    private function pinnedBranchId(Request $request): ?int
    {
        $user = $request->user();

        return $user instanceof User ? $user->branch_id : null;
    }

    private function assertReadable(Request $request, Branch $branch): void
    {
        $pinned = $this->pinnedBranchId($request);

        abort_if(
            $pinned !== null && $pinned !== $branch->id,
            Response::HTTP_FORBIDDEN,
            'Siz boshqa filial ma\'lumotiga kira olmaysiz.'
        );
    }
}
