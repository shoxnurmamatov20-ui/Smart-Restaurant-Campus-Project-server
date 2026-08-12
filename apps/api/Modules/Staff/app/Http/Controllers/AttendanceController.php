<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Modules\Staff\Http\Requests\StoreAttendanceRequest;
use Modules\Staff\Http\Requests\UpdateAttendanceRequest;
use Modules\Staff\Http\Resources\AttendanceResource;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\StaffMember;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for attendance records.
 *
 * Mounted under /api/v1/staff/attendances and gated by Spatie permission
 * middleware on the route definition (Modules/Staff/routes/api.php).
 */
final class AttendanceController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Attendance::class)
            ->allowedFilters([
                AllowedFilter::exact('member', 'staff_member_id'),
                AllowedFilter::exact('method'),
                AllowedFilter::exact('is_late'),
                AllowedFilter::callback('open', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->open();
                    }
                }),
            ])
            ->allowedSorts(['checked_in_at', 'minutes_worked', 'created_at'])
            ->allowedIncludes(['member'])
            ->defaultSort('-checked_in_at')
            ->paginate($perPage)
            ->withQueryString();

        return AttendanceResource::collection($records);
    }

    public function store(StoreAttendanceRequest $request): AttendanceResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = Attendance::create($request->validated())->refresh();

        return new AttendanceResource($record->load('member'));
    }

    public function show(Attendance $attendance): AttendanceResource
    {
        return new AttendanceResource($attendance->load('member'));
    }

    public function update(UpdateAttendanceRequest $request, Attendance $attendance): AttendanceResource
    {
        $attendance->update($request->validated());

        return new AttendanceResource($attendance->refresh()->load('member'));
    }

    public function destroy(Attendance $attendance): Response
    {
        $attendance->delete();

        return response()->noContent();
    }

    /**
     * Clock in. Refuses a second open record for the same person — a double
     * check-in would silently pay someone twice for the same hours.
     */
    public function checkIn(Request $request): AttendanceResource
    {
        $validated = $request->validate([
            'staff_member_id' => ['required', 'integer', 'exists:staff_members,id'],
            'method' => ['nullable', Rule::in(Attendance::METHODS)],
        ]);

        $member = StaffMember::query()->findOrFail($validated['staff_member_id']);
        abort_unless($member->status === 'active', 422, 'Faqat faol xodim smenaga kira oladi.');

        $open = Attendance::query()->open()->where('staff_member_id', $member->id)->first();
        abort_if($open !== null, 422, 'Bu xodim allaqachon smenada.');

        $attendance = Attendance::create([
            'staff_member_id' => $member->id,
            'checked_in_at' => now(),
            'method' => $validated['method'] ?? 'pin',
        ]);

        return new AttendanceResource($attendance->refresh());
    }

    public function checkOut(Request $request): AttendanceResource
    {
        $validated = $request->validate([
            'staff_member_id' => ['required', 'integer', 'exists:staff_members,id'],
        ]);

        $attendance = Attendance::query()->open()
            ->where('staff_member_id', $validated['staff_member_id'])
            ->latest('checked_in_at')
            ->first();

        abort_if($attendance === null, 422, 'Ochiq smena topilmadi.');
        $attendance->checkOut();

        return new AttendanceResource($attendance->refresh()->load('member'));
    }
}
