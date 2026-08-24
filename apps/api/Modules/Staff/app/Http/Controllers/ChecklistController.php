<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Staff\Models\StaffAction;

/**
 * What this person has already ticked off, and what they say they are carrying.
 *
 * The read that makes `StaffAction::JOURNAL_ONLY_KINDS` worth queueing. Both
 * kinds have nowhere to land but the journal — the model says why — and until
 * this existed a phone could write them and nothing could read them back: the
 * closing run-through lived in component state, so a handset that slept
 * mid-round restarted the list and two people sharing one saw an empty one.
 *
 * ---------------------------------------------------------------------------
 * Scoped to the asker, which is what lets it sit outside a permission
 *
 * Every row here is the caller's own. A manager's queue of what the whole shift
 * ticked is a different read with a different permission; this one answers
 * "what have I already done", which is the question the phone in somebody's
 * hand is asking, and no `staff.view` should be needed to answer it about
 * yourself. `ModuleRouteGuardTest` records the route with that reason.
 *
 * ---------------------------------------------------------------------------
 * The trading day, not the calendar day
 *
 * `forBusinessDate()` on an indexed column. A closing run-through finishes
 * after midnight in any venue that trades late, and grouping by the timestamp's
 * calendar date would split one evening across two days and show both half
 * done. `today` resolves through `BusinessDay`, which is the same boundary the
 * Z-report a cashier signed used.
 */
final class ChecklistController extends Controller
{
    public function show(Request $request, BusinessDay $day, string $day_key): JsonResponse
    {
        // The router constrains `{day_key}` to `today` or `YYYY-MM-DD`, so a
        // stray segment is a 404 before anything reaches a date parse.
        $date = $day_key === 'today' ? $day->dateFor() : $day_key;

        $rows = StaffAction::query()
            ->applied()
            ->where('user_id', $request->user()?->getAuthIdentifier())
            ->whereIn('kind', StaffAction::JOURNAL_ONLY_KINDS)
            ->forBusinessDate($date)
            ->orderBy('happened_at')
            ->get();

        $ticks = $rows
            ->where('kind', 'checklist_tick')
            ->map(static fn (StaffAction $row): array => [
                'list' => $row->payload['list'] ?? null,
                'step' => $row->payload['step'] ?? null,
                'at' => $row->happened_at->toIso8601String(),
            ])
            ->values()
            ->all();

        /*
         * The LAST declaration of the day, not the sum of them.
         *
         * A rider who declares twice has corrected themselves, not doubled
         * their round — and the figure a cashier counts against is the one the
         * rider stood behind last. Summing would put a round in the till twice
         * and leave somebody looking for the difference all evening.
         */
        $cash = $rows->where('kind', 'cash_handover')->last();

        return response()->json([
            'data' => [
                'day' => $date,
                'ticks' => $ticks,
                'cash_handover' => $cash === null ? null : [
                    'amount_tiyin' => $cash->payload['amount_tiyin'] ?? null,
                    'drops' => $cash->payload['drops'] ?? null,
                    'at' => $cash->happened_at->toIso8601String(),
                ],
            ],
        ]);
    }
}
