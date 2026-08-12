<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\StoreBranchRequest;
use App\Http\Requests\UpdateBranchRequest;
use App\Http\Resources\BranchResource;
use App\Models\Branch;
use App\Models\User;
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
        $branch->update($request->validated());

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
