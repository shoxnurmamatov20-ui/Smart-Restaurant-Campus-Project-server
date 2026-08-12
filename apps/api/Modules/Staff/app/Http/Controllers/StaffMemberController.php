<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Staff\Http\Requests\StoreStaffMemberRequest;
use Modules\Staff\Http\Requests\UpdateStaffMemberRequest;
use Modules\Staff\Http\Resources\StaffMemberResource;
use Modules\Staff\Models\StaffMember;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for staff members.
 *
 * Mounted under /api/v1/staff/members and gated by Spatie permission
 * middleware on the route definition (Modules/Staff/routes/api.php).
 */
final class StaffMemberController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(StaffMember::class)
            ->allowedFilters([
                AllowedFilter::exact('employee_code'),
                AllowedFilter::exact('position'),
                AllowedFilter::exact('status'),
                AllowedFilter::exact('branch_code'),
                AllowedFilter::partial('last_name'),
            ])
            ->allowedSorts(['employee_code', 'last_name', 'hired_at', 'created_at'])
            ->allowedIncludes(['shifts', 'attendances'])
            ->defaultSort('last_name')
            ->paginate($perPage)
            ->withQueryString();

        return StaffMemberResource::collection($records);
    }

    public function store(StoreStaffMemberRequest $request): StaffMemberResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = StaffMember::create($request->validated())->refresh();

        return new StaffMemberResource($record->load('shifts'));
    }

    public function show(StaffMember $member): StaffMemberResource
    {
        return new StaffMemberResource($member->load('shifts'));
    }

    public function update(UpdateStaffMemberRequest $request, StaffMember $member): StaffMemberResource
    {
        $member->update($request->validated());

        return new StaffMemberResource($member->refresh()->load('shifts'));
    }

    public function destroy(StaffMember $member): Response
    {
        $member->delete();

        return response()->noContent();
    }
}
