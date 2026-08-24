<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Modules\Tables\Services\BookingDiary;

/**
 * The times a guest may pick, on the restaurant's own website.
 *
 * The booking form has always drawn a fixed list of half hours and hoped. This
 * is what it should draw instead: the venue's real windows for that date, with
 * the slots that are already full left out.
 *
 * ---------------------------------------------------------------------------
 * What a stranger is told, and what they are not
 *
 * The instants, and whether each is still bookable. NOT how many covers are
 * left, and not how many are taken — those are `BookingDiary`'s answer to a
 * HOST, and publishing them would let anybody outside the building watch a
 * restaurant's evening fill up in real time. "Available" is the only fact a
 * guest needs and the only one that is theirs.
 *
 * A venue with no windows configured answers an empty list, and the form falls
 * back to its own fixed times — which is exactly what it does today, and what
 * `BookingDiary::refuse()` keeps accepting for the same reason: windows are a
 * feature a restaurant switches on, and every restaurant on the platform has
 * none until somebody fills them in.
 */
final class PublicBookingSlotController extends Controller
{
    public function __invoke(Request $request, BookingDiary $diary): JsonResponse
    {
        $validated = $request->validate([
            'branch_id' => ['nullable', 'integer', 'min:1'],
            'date' => ['nullable', 'date_format:Y-m-d'],
            /*
             * Party size, because it changes the answer.
             *
             * A slot with three seats left is bookable for two and not for six,
             * and a chooser that ignored this would offer a guest of six a time
             * the endpoint then refuses. One is the honest default: it asks
             * "is anything at all left".
             */
            'guests' => ['nullable', 'integer', 'min:1', 'max:20'],
        ]);

        $branch = $this->branchOrFail($validated['branch_id'] ?? null);
        $guests = (int) ($validated['guests'] ?? 1);

        $day = isset($validated['date'])
            ? Carbon::createFromFormat('Y-m-d', (string) $validated['date'])->startOfDay()
            : Carbon::now()->startOfDay();

        $now = Carbon::now();

        $slots = array_values(array_filter(
            array_map(static fn (array $slot): array => [
                'at' => $slot['at']->toIso8601String(),
                'available' => $slot['remaining'] >= $guests,
            ], $diary->slotsOn($branch, $day)),
            /*
             * Slots that have already passed are dropped rather than marked
             * unavailable. A guest looking at today at nine in the evening does
             * not want to read the whole afternoon greyed out — and `starts_at`
             * must be in the future anyway, so a past slot is a button that
             * could only ever produce a validation error.
             */
            static fn (array $slot): bool => Carbon::parse($slot['at'])->greaterThan($now),
        ));

        return response()->json(['data' => $slots]);
    }

    /**
     * Which venue, on the same terms the booking endpoint uses.
     *
     * One active venue needs no id; a chain does, and guessing would draw
     * another building's evening.
     */
    private function branchOrFail(mixed $branchId): Branch
    {
        if ($branchId === null) {
            $venues = Branch::query()->where('status', 'active')->take(2)->get();

            if ($venues->count() !== 1) {
                throw ApiException::of('tables.branch_required', field: 'branch_id', meta: [
                    'venues' => $venues->count(),
                ]);
            }

            /** @var Branch $only */
            $only = $venues->first();

            return $only;
        }

        /** @var Branch|null $branch */
        $branch = Branch::query()->whereKey((int) $branchId)->first();

        if ($branch === null || ! $branch->isActive()) {
            throw ApiException::of('tables.branch_required', field: 'branch_id');
        }

        return $branch;
    }
}
