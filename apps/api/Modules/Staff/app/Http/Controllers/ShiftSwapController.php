<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Errors\ApiException;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Support\Facades\DB;
use Modules\Staff\Http\Requests\DecideShiftSwapRequest;
use Modules\Staff\Http\Requests\StoreShiftSwapRequest;
use Modules\Staff\Http\Resources\ShiftSwapResource;
use Modules\Staff\Models\Shift;
use Modules\Staff\Models\ShiftSwap;
use Modules\Staff\Models\StaffMember;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * Asking to be let off a shift, and being let off it.
 *
 * Two permissions, on purpose: raising a request is `staff.update` and granting
 * one is `staff.manage`. The same three roles hold both today, so the split
 * buys nothing yet — it is here because the two acts are genuinely different,
 * and a shift-lead who may raise a swap without granting one is the obvious
 * next role. See the routes file.
 *
 * `shift-blocks.tsx` has been naming both halves in TODOs since the screen was
 * drawn — `POST /api/v1/staff/shift-swaps` and the verdict beside it.
 */
final class ShiftSwapController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(ShiftSwap::class)
            ->allowedFilters([
                AllowedFilter::exact('status'),
                AllowedFilter::exact('shift', 'shift_id'),
                AllowedFilter::exact('member', 'requested_by_id'),
            ])
            ->allowedSorts(['created_at', 'decided_at'])
            ->allowedIncludes(['shift', 'requestedBy', 'offeredTo'])
            ->defaultSort('-created_at')
            ->paginate($perPage)
            ->withQueryString();

        return ShiftSwapResource::collection($records);
    }

    public function store(StoreShiftSwapRequest $request): ShiftSwapResource
    {
        /** @var Shift|null $shift */
        $shift = Shift::query()->whereKey($request->integer('shift_id'))->first();

        // The tenant scope already narrowed this, so a null here is a shift
        // from another restaurant or one that has been deleted. Same answer for
        // both: from here it does not exist.
        if ($shift === null) {
            throw ApiException::of('shift.unknown', field: 'shift_id');
        }

        if ($shift->status === 'cancelled') {
            throw ApiException::of('shift.not_swappable', field: 'shift_id', meta: ['status' => $shift->status]);
        }

        // Nobody swaps out of a shift they have already worked. Checked against
        // the end rather than the start: a request raised two hours into a
        // twelve-hour shift is somebody who has been taken ill, and refusing it
        // is refusing the one case this is most needed for.
        if ($shift->ends_at->isPast()) {
            throw ApiException::of('shift.already_over', field: 'shift_id');
        }

        $offeredTo = $request->filled('offered_to_id')
            ? StaffMember::query()->whereKey($request->integer('offered_to_id'))->first()
            : null;

        if ($request->filled('offered_to_id') && $offeredTo === null) {
            throw ApiException::of('staff.employee_unknown', field: 'offered_to_id');
        }

        if ($offeredTo !== null && $offeredTo->id === $shift->staff_member_id) {
            throw ApiException::of('shift.swap_to_self', field: 'offered_to_id');
        }

        /*
         * One live request per shift, and the database says so — a partial
         * unique index over the pending rows. Checked here first only so the
         * answer is a catalogue code rather than a 500 off a constraint: two
         * taps on a slow connection is the ordinary way this happens.
         */
        $existing = ShiftSwap::query()->pending()->where('shift_id', $shift->id)->first();

        if ($existing !== null) {
            throw ApiException::of('shift.swap_already_pending', field: 'shift_id', meta: ['swap_id' => $existing->id]);
        }

        $swap = ShiftSwap::create([
            'branch_id' => $shift->branch_id,
            'shift_id' => $shift->id,
            'requested_by_id' => $shift->staff_member_id,
            'offered_to_id' => $offeredTo?->id,
            'status' => 'pending',
            'reason' => $request->filled('reason') ? (string) $request->string('reason') : null,
        ]);

        return new ShiftSwapResource($swap->refresh()->load(['shift', 'requestedBy', 'offeredTo']));
    }

    public function show(ShiftSwap $swap): ShiftSwapResource
    {
        return new ShiftSwapResource($swap->load(['shift', 'requestedBy', 'offeredTo']));
    }

    /**
     * Grant it: the shift changes hands, and the reason it did stays here.
     *
     * The shift's own `status` is deliberately left alone. `Shift::STATUSES`
     * carries a `swapped` value and using it would be the obvious move — and
     * would drop the shift off the published rota, because `shifts-server.ts`
     * builds the grid from every shift that is not `cancelled` and would then
     * have to learn a second exception. The slot is still work somebody is
     * expected to turn up for; only the name on it changed.
     */
    public function approve(DecideShiftSwapRequest $request, ShiftSwap $swap): ShiftSwapResource
    {
        $this->refuseIfDecided($swap);

        $takerId = $request->filled('offered_to_id')
            ? $request->integer('offered_to_id')
            : $swap->offered_to_id;

        if ($takerId === null) {
            // An open request approved without naming anybody would leave the
            // shift exactly where it was while the screen showed it settled —
            // a gap on Saturday that reads as covered.
            throw ApiException::of('shift.swap_needs_a_taker', field: 'offered_to_id');
        }

        /** @var StaffMember|null $taker */
        $taker = StaffMember::query()->whereKey($takerId)->first();

        if ($taker === null) {
            throw ApiException::of('staff.employee_unknown', field: 'offered_to_id');
        }

        if ($taker->id === $swap->requested_by_id) {
            throw ApiException::of('shift.swap_to_self', field: 'offered_to_id');
        }

        /** @var User|null $decider */
        $decider = $request->user();

        DB::transaction(function () use ($swap, $taker, $decider, $request): void {
            $swap->shift?->update(['staff_member_id' => $taker->id]);

            $swap->update([
                'offered_to_id' => $taker->id,
                'status' => 'approved',
                'decided_by' => $decider?->getKey(),
                'decided_at' => now(),
                'decision_note' => $request->filled('note') ? (string) $request->string('note') : null,
            ]);
        });

        return new ShiftSwapResource($swap->refresh()->load(['shift', 'requestedBy', 'offeredTo']));
    }

    /** Refuse it. The shift does not move and the request stays as history. */
    public function reject(DecideShiftSwapRequest $request, ShiftSwap $swap): ShiftSwapResource
    {
        $this->refuseIfDecided($swap);

        $swap->update([
            'status' => 'rejected',
            'decided_by' => $request->user()?->getKey(),
            'decided_at' => now(),
            'decision_note' => $request->filled('note') ? (string) $request->string('note') : null,
        ]);

        return new ShiftSwapResource($swap->refresh()->load(['shift', 'requestedBy', 'offeredTo']));
    }

    /**
     * The asker changing their mind.
     *
     * Guarded by `staff.update` rather than `staff.manage`, because withdrawing
     * a request is the other half of raising one. It is a different act from a
     * manager refusing it, and the two are recorded as different statuses so
     * the history says which happened.
     */
    public function cancel(ShiftSwap $swap): ShiftSwapResource
    {
        $this->refuseIfDecided($swap);

        $swap->update(['status' => 'cancelled', 'decided_at' => now()]);

        return new ShiftSwapResource($swap->refresh()->load(['shift', 'requestedBy', 'offeredTo']));
    }

    /** @throws ApiException */
    private function refuseIfDecided(ShiftSwap $swap): void
    {
        if ($swap->status !== 'pending') {
            throw ApiException::of('shift.swap_already_decided', meta: ['status' => $swap->status]);
        }
    }
}
