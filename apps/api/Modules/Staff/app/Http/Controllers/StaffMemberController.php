<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Counters\BranchCounters;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Staff\Http\Requests\StoreStaffMemberRequest;
use Modules\Staff\Http\Requests\UpdateStaffMemberRequest;
use Modules\Staff\Http\Resources\StaffMemberResource;
use Modules\Staff\Models\StaffMember;
use Modules\Staff\Services\CrewLogin;
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

        // The roster's derived columns arrive as subqueries on this one
        // statement — see StaffMember::scopeWithRosterFigures.
        $records = QueryBuilder::for(StaffMember::query()->withRosterFigures())
            ->allowedFilters([
                AllowedFilter::exact('employee_code'),
                AllowedFilter::exact('position'),
                AllowedFilter::exact('status'),
                AllowedFilter::exact('branch_code'),
                AllowedFilter::exact('branch', 'branch_id'),
                AllowedFilter::partial('last_name'),
            ])
            ->allowedSorts(['employee_code', 'last_name', 'position', 'hourly_rate', 'hired_at', 'created_at'])
            ->allowedIncludes(['shifts', 'attendances'])
            ->defaultSort('last_name')
            ->paginate($perPage)
            ->withQueryString();

        return StaffMemberResource::collection($records);
    }

    public function __construct(private readonly CrewLogin $logins) {}

    /**
     * Hiring somebody opens their login in the same breath.
     *
     * The HR row and the account used to be written by two different hands —
     * this endpoint and nothing — so a new hire had no account, no pairing
     * code and no way into the app they had just installed. Now the response
     * carries the PIN once, beside the employee code: the manager reads both
     * to the person in front of them, and the server keeps only a hash.
     */
    public function store(StoreStaffMemberRequest $request): JsonResponse
    {
        $attributes = $request->validated();

        if (($attributes['employee_code'] ?? null) === null) {
            $attributes['employee_code'] = $this->nextEmployeeCode();
        }

        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = StaffMember::create($attributes)->refresh();

        ['pin' => $pin] = $this->logins->open($record);

        return response()->json([
            'pin' => $pin,
            'data' => (new StaffMemberResource($record->fresh()?->load('shifts') ?? $record))->resolve($request),
        ], 201);
    }

    /**
     * A login for somebody hired before logins came with hiring — or a fresh
     * PIN for somebody who forgot theirs. Same act: the account is opened if it
     * is missing, the PIN is rotated either way, and it is shown exactly once.
     *
     * `staff.manage`, like issuing a pairing code: both hand out a credential
     * that signs in as another person.
     */
    public function login(Request $request, StaffMember $member): JsonResponse
    {
        ['pin' => $pin, 'created' => $created] = $this->logins->open($member);

        return response()->json([
            'pin' => $pin,
            'created' => $created,
            'data' => (new StaffMemberResource($member->fresh() ?? $member))->resolve($request),
        ], $created ? 201 : 200);
    }

    /**
     * The next `EMP-0007` for this restaurant.
     *
     * Off `branch_counters`, which is one atomic upsert — two managers hiring
     * at the same moment get different numbers, where `max(code) + 1` would
     * hand them both the same one and lose the second to the unique index.
     * The counter is per tenant rather than per branch: a code identifies a
     * person, and a person who transfers venues keeps their number.
     *
     * A restaurant that already typed `EMP-0007` by hand would collide, so the
     * counter is advanced past whatever exists rather than trusted blindly —
     * a handful of attempts, then the code is left to the caller.
     */
    private function nextEmployeeCode(): string
    {
        $counters = app(BranchCounters::class);

        for ($attempt = 0; $attempt < 25; $attempt++) {
            $code = sprintf('EMP-%04d', $counters->next('staff.employee_code'));

            if (! StaffMember::withTrashed()->where('employee_code', $code)->exists()) {
                return $code;
            }
        }

        throw ApiException::detailed(
            'request.validation_failed',
            'Xodim kodini yaratib bo\'lmadi — kodni qo\'lda kiriting.',
            'Не удалось создать код сотрудника — введите его вручную.',
            'Could not allocate an employee code — send one explicitly.',
            field: 'employee_code',
        );
    }

    public function show(StaffMember $member): StaffMemberResource
    {
        // Re-read through the scope: the figures are subqueries, and a model
        // resolved by route binding carries none of them.
        $withFigures = StaffMember::query()->withRosterFigures()->whereKey($member->getKey())->firstOrFail();

        return new StaffMemberResource($withFigures->load('shifts'));
    }

    public function update(UpdateStaffMemberRequest $request, StaffMember $member): StaffMemberResource
    {
        $member->update($request->validated());

        // A changed position is a changed role, now rather than at the next
        // PIN rotation — see CrewLogin::syncRole.
        if ($request->has('position')) {
            $this->logins->syncRole($member);
        }

        return new StaffMemberResource($member->refresh()->load('shifts'));
    }

    /**
     * A console password for somebody whose work is the desk — shown once,
     * beside the login they will type. `staff.manage`, like the PIN and the
     * pairing code: a credential that signs in as somebody else.
     *
     * Refused for a position that never sits at the console. A waiter with a
     * console password is a waiter who can be phished for one, for a door
     * they have no reason to open.
     */
    public function password(Request $request, StaffMember $member): JsonResponse
    {
        if (! in_array($member->position, CrewLogin::DESK_POSITIONS, true)) {
            throw ApiException::of('staff.not_a_desk_position', field: 'position');
        }

        ['password' => $password, 'login' => $login, 'created' => $created] = $this->logins->password($member);

        return response()->json([
            'password' => $password,
            'login' => $login,
            'created' => $created,
            'data' => (new StaffMemberResource($member->fresh() ?? $member))->resolve($request),
        ], $created ? 201 : 200);
    }

    /**
     * Letting somebody go closes their login with them.
     *
     * The row is soft-deleted, as every people record here is. The account is
     * the part that must not linger: a waiter whose phone still holds a live
     * token after their last shift is a waiter who can still clear a table's
     * bill from the bus home.
     */
    public function destroy(StaffMember $member): Response
    {
        $this->logins->close($member);
        $member->delete();

        return response()->noContent();
    }
}
