<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\BranchContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Modules\Tables\Models\BookingWindow;
use Modules\Tables\Services\BookingDiary;

/**
 * When each venue takes bookings — the back-office half.
 *
 * A window is a commercial statement rather than a piece of furniture: *"on
 * Fridays we seat from six to eleven, in half hours, twenty covers at a time"*.
 * The website's chooser is drawn from these and the booking endpoint refuses
 * anything outside them, so this is the one screen that decides both.
 *
 * `tables.*` permissions rather than a settings permission, because the people
 * who own this are the people who own the floor plan: a host and a branch
 * manager, not whoever administers the account.
 */
final class BookingWindowController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $windows = BookingWindow::query()
            ->when($request->filled('branch_id'), fn ($query) => $query->where('branch_id', $request->integer('branch_id')))
            ->orderBy('branch_id')
            ->orderBy('weekday')
            ->orderBy('opens_at')
            ->get();

        return response()->json([
            'data' => $windows->map(fn (BookingWindow $window): array => $this->payload($window))->all(),
        ]);
    }

    public function store(Request $request, BranchContext $branches): JsonResponse
    {
        $validated = $this->validated($request);

        /*
         * The venue, and it is required in substance even though the field is
         * optional in the request.
         *
         * `branch_id` is NOT NULL on this table — see the migration for why a
         * window belonging to "the business" would say the same hours for a mall
         * unit and a terrace — so the header has to answer when the body does
         * not. A manager pinned to one venue never sends it; an owner reading the
         * whole estate must.
         */
        $branchId = $validated['branch_id'] ?? $branches->id();

        if ($branchId === null) {
            throw ApiException::of('tables.branch_required', field: 'branch_id');
        }

        $this->branchOrFail((int) $branchId);

        $window = BookingWindow::create($validated + ['branch_id' => $branchId]);

        return response()->json(['data' => $this->payload($window)], Response::HTTP_CREATED);
    }

    public function update(Request $request, BookingWindow $bookingWindow): JsonResponse
    {
        $bookingWindow->update($this->validated($request));

        return response()->json(['data' => $this->payload($bookingWindow->refresh())]);
    }

    public function destroy(BookingWindow $bookingWindow): Response
    {
        /*
         * A hard delete, unlike most of this module.
         *
         * A window is a rule rather than a record: nothing points at it, no
         * booking references it, and a deleted one is simply a night the venue
         * no longer takes bookings on. Soft-deleting it would leave a row the
         * chooser has to remember to exclude, which is the shape of bug where a
         * restaurant "still shows Mondays".
         */
        $bookingWindow->delete();

        return response()->noContent();
    }

    /**
     * The slots on one date, with what is left in each — the staff-side view.
     *
     * The same arithmetic the website uses, deliberately: a host reading "four
     * seats left at seven" and a guest reading the chooser have to be looking at
     * one answer. See BookingDiary.
     */
    public function slots(Request $request, BookingDiary $diary, BranchContext $branches): JsonResponse
    {
        $request->validate([
            'branch_id' => ['nullable', 'integer', 'min:1'],
            // Validated rather than parsed defensively: a format the parser has
            // to guess at is a date somebody typed, and the honest place to
            // refuse it is the door.
            'date' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $branchId = $request->filled('branch_id') ? $request->integer('branch_id') : $branches->id();

        if ($branchId === null) {
            throw ApiException::of('tables.branch_required', field: 'branch_id');
        }

        $branch = $this->branchOrFail($branchId);
        $day = $this->dayOrFail($request->input('date'));

        return response()->json([
            'data' => array_map(static fn (array $slot): array => [
                'at' => $slot['at']->toIso8601String(),
                'capacity' => $slot['capacity'],
                'booked' => $slot['booked'],
                'remaining' => $slot['remaining'],
            ], $diary->slotsOn($branch, $day)),
        ]);
    }

    // ============ Internals ============

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'branch_id' => ['sometimes', 'integer', 'min:1'],
            // ISO-8601, so 1 is Monday. See the migration for why PHP's own
            // `w` (0 = Sunday) is the wrong convention to accept here.
            'weekday' => ['required', 'integer', 'min:1', 'max:7'],
            'opens_at' => ['required', 'date_format:H:i'],
            'closes_at' => ['required', 'date_format:H:i'],
            'slot_minutes' => ['sometimes', 'integer', 'min:'.BookingWindow::SLOT_MIN, 'max:'.BookingWindow::SLOT_MAX],
            // Zero is allowed and means "open, and full": the chooser still draws
            // the night, and nothing more can be booked into it.
            'capacity' => ['sometimes', 'integer', 'min:0', 'max:2000'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    private function branchOrFail(int $branchId): Branch
    {
        /** @var Branch|null $branch */
        $branch = Branch::query()->whereKey($branchId)->first();

        if ($branch === null) {
            throw ApiException::of('tables.branch_required', field: 'branch_id');
        }

        return $branch;
    }

    /**
     * The date asked about, defaulting to today.
     *
     * The format is already guaranteed by the validator above; this only has to
     * decide what "no date" means, and today is the answer a host wants when
     * they open the screen.
     */
    private function dayOrFail(mixed $date): Carbon
    {
        if ($date === null || $date === '') {
            return Carbon::now()->startOfDay();
        }

        $parsed = Carbon::createFromFormat('Y-m-d', (string) $date);

        if ($parsed === null) {
            throw ApiException::of('tables.reservation_invalid', field: 'date');
        }

        return $parsed->startOfDay();
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(BookingWindow $window): array
    {
        return [
            'id' => (int) $window->getKey(),
            'branch_id' => (int) $window->branch_id,
            'weekday' => $window->weekday,
            'opens_at' => substr((string) $window->opens_at, 0, 5),
            'closes_at' => substr((string) $window->closes_at, 0, 5),
            'slot_minutes' => $window->slot_minutes,
            'capacity' => $window->capacity,
            'is_active' => $window->is_active,
        ];
    }
}
