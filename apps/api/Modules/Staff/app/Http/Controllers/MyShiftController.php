<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\Shift;
use Modules\Staff\Models\StaffMember;

/**
 * "What am I doing today, and when do I next work?"
 *
 * The staff app's home panel, and the smallest useful answer to the two
 * questions somebody opens it with. Deliberately not a roster endpoint: it
 * answers about the caller and nobody else, so it carries no permission and
 * exposes no personnel data — a waiter cannot learn what a cook earns or
 * whether the manager was late.
 *
 * The day boundary is the venue's, not the calendar's. A cook who clocked in at
 * 05:40 and a bartender still working at 01:30 are both on today's shift, and
 * `BusinessDay` is the one place that decides where the line falls — DECISIONS
 * Q3, and the same helper every report groups by.
 */
final class MyShiftController extends Controller
{
    /**
     * How far ahead the swap form looks.
     *
     * Two weeks: the rota is published a week at a time, so a fortnight covers
     * the published week and the one being drafted. A longer window would list
     * shifts nobody has agreed to yet, and asking a colleague to cover one of
     * those is asking about a promise that has not been made.
     */
    private const SWAP_HORIZON_DAYS = 14;

    public function today(Request $request, BusinessDay $day): JsonResponse
    {
        /** @var User $person */
        $person = $request->user();

        $member = StaffMember::query()->where('user_id', $person->getKey())->first();

        if ($member === null) {
            /*
             * Signed in, but not on the roster — an owner covering a shift, or
             * an account created before anybody was hired.
             *
             * An empty day rather than a 404: the panel has to render, and "you
             * are not on the rota" is a true and useful answer. A 404 would put
             * an error screen in front of somebody whose only problem is that
             * nobody has added them yet.
             */
            return response()->json(['data' => self::emptyDay()]);
        }

        [$dayFrom, $dayTo] = $day->window();

        $shifts = Shift::query()
            ->where('staff_member_id', $member->id)
            ->where('status', '!=', 'cancelled')
            ->whereNotNull('published_at')
            ->where('starts_at', '>=', $dayFrom)
            ->where('starts_at', '<', $dayTo)
            ->orderBy('starts_at')
            ->get();

        $attendances = Attendance::query()
            ->where('staff_member_id', $member->id)
            ->where('checked_in_at', '>=', $dayFrom)
            ->where('checked_in_at', '<', $dayTo)
            ->orderBy('checked_in_at')
            ->get();

        $open = $attendances->firstWhere('checked_out_at', null);

        /*
         * Minutes worked so far.
         *
         * The closed records carry their own frozen figure; the open one is
         * counted up to now, because a screen that showed zero until somebody
         * clocked out would be useless for the whole shift it is about.
         */
        $worked = $attendances
            ->filter(static fn (Attendance $row): bool => $row->checked_out_at !== null)
            ->sum('minutes_worked');

        if ($open !== null) {
            $worked += max(0, (int) $open->checked_in_at->diffInMinutes(now()));
        }

        // The next one after today's window, so a waiter finishing a Friday
        // night is told about Sunday rather than about the shift they are
        // standing in.
        $next = Shift::query()
            ->where('staff_member_id', $member->id)
            ->where('status', '!=', 'cancelled')
            ->whereNotNull('published_at')
            ->where('starts_at', '>=', $dayTo)
            ->orderBy('starts_at')
            ->first();

        return response()->json([
            'data' => [
                'business_date' => $day->dateFor(),
                'member' => [
                    'id' => $member->id,
                    'full_name' => $member->full_name,
                    'position' => $member->position,
                    'branch_id' => $member->branch_id,
                ],
                'shifts' => $shifts->map(static fn (Shift $shift): array => [
                    'id' => $shift->id,
                    'starts_at' => $shift->starts_at->toIso8601String(),
                    'ends_at' => $shift->ends_at->toIso8601String(),
                    'role' => $shift->role,
                    'status' => $shift->status,
                ])->all(),
                'clocked_in' => $open !== null,
                'clocked_in_at' => $open?->checked_in_at?->toIso8601String(),
                'minutes_worked' => (int) $worked,
                'is_late' => $attendances->contains(static fn (Attendance $row): bool => (bool) $row->is_late),
                'next_shift' => $next === null ? null : [
                    'id' => $next->id,
                    'starts_at' => $next->starts_at->toIso8601String(),
                    'ends_at' => $next->ends_at->toIso8601String(),
                    'role' => $next->role,
                ],
            ],
        ]);
    }

    /**
     * "Which of my shifts could I ask somebody to cover, and who is free?"
     *
     * The swap form's read, and the reason that form could not post before it
     * existed. `POST /staff/shift-swaps` needs a **shift id** and, optionally,
     * a **colleague's staff-member id**; the phone had neither. It drew a
     * weekday heading — "Payshanba" — which names a different Thursday every
     * week, and a list of first names.
     *
     * Under `me/` and unguarded, like `today()`, and for the same reason with
     * one addition. The shifts are the caller's own. The colleagues are not,
     * and that is why this answers **three fields per person** — id, name and
     * position — and nothing else. A waiter asking a cook to cover Thursday has
     * to be able to name them; what they must not learn is a wage, a phone
     * number or an attendance record, and `GET /staff/members` (which carries
     * all three) stays behind `staff.view` where it belongs.
     *
     * Same branch only. A swap is somebody physically standing in a room, and
     * offering a Termiz waiter a Tashkent Friday is a request nobody can accept.
     */
    public function upcoming(Request $request, BusinessDay $day): JsonResponse
    {
        /** @var User $person */
        $person = $request->user();

        $member = StaffMember::query()->where('user_id', $person->getKey())->first();

        if ($member === null) {
            // Not on the roster, so there is nothing to swap out of. An empty
            // answer rather than a 404 — the form has to render and "you have
            // no rostered shifts" is the true reason it is empty.
            return response()->json(['data' => ['shifts' => [], 'colleagues' => []]]);
        }

        [, $dayTo] = $day->window();

        /*
         * From the start of the current trading day, not from `now()`.
         *
         * A waiter halfway through a Friday evening who has been taken ill is
         * the case this whole form exists for, and `starts_at >= now()` would
         * hide the one shift they need covering. `ShiftSwapController` makes
         * the same call the other way round and says so: it refuses on
         * `ends_at`, not on `starts_at`.
         */
        $shifts = Shift::query()
            ->where('staff_member_id', $member->id)
            ->where('status', '!=', 'cancelled')
            ->whereNotNull('published_at')
            /*
             * PHP's clock, never SQL's `now()`. A comparison the database
             * evaluates is a comparison a test cannot travel through, and this
             * platform freezes time in tests on purpose.
             */
            ->where('ends_at', '>=', now())
            ->where('starts_at', '<', $dayTo->addDays(self::SWAP_HORIZON_DAYS))
            ->orderBy('starts_at')
            ->limit(30)
            ->get();

        $colleagues = StaffMember::query()
            ->where('id', '!=', $member->id)
            ->where('status', 'active')
            ->when($member->branch_id !== null, fn ($query) => $query->where('branch_id', $member->branch_id))
            /*
             * By the stored columns, not by `full_name` — that is an accessor
             * and PostgreSQL has never heard of it. Ordering by a name a person
             * is actually addressed by is the point: a list of colleagues you
             * have to scan for is a list somebody picks the wrong row from.
             */
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->limit(60)
            ->get();

        return response()->json([
            'data' => [
                'shifts' => $shifts->map(static fn (Shift $shift): array => [
                    'id' => $shift->id,
                    'starts_at' => $shift->starts_at->toIso8601String(),
                    'ends_at' => $shift->ends_at->toIso8601String(),
                    'role' => $shift->role,
                    'status' => $shift->status,
                ])->all(),
                'colleagues' => $colleagues->map(static fn (StaffMember $row): array => [
                    'id' => $row->id,
                    'full_name' => $row->full_name,
                    'position' => $row->position,
                ])->all(),
            ],
        ]);
    }

    /** @return array<string, mixed> */
    private static function emptyDay(): array
    {
        return [
            'business_date' => app(BusinessDay::class)->dateFor(),
            'member' => null,
            'shifts' => [],
            'clocked_in' => false,
            'clocked_in_at' => null,
            'minutes_worked' => 0,
            'is_late' => false,
            'next_shift' => null,
        ];
    }
}
