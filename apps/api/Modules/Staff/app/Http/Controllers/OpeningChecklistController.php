<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Staff\Models\OpeningChecklistTick;

/**
 * The venue's opening checklist for one trading day.
 *
 * Not `ChecklistController` next door, and the difference is who is asking.
 * That one answers *"what have I ticked"* off the caller's own journal, for a
 * phone in somebody's hand. This is the morning list the console's rota screen
 * draws — one row per item per venue per day, with the name of whoever ticked
 * it — a record that can be shown to an inspector rather than a note to the
 * person holding the tablet.
 *
 * Until now that screen drew seven working tick boxes whose state lived in a
 * browser tab: refresh the page and the morning never happened. That is worse
 * than no checklist, because a list that looks recorded is one people believe
 * there is a trail of.
 *
 * ---------------------------------------------------------------------------
 * Two verbs and no third
 *
 * Reading gives the seven items and who ticked which; writing sets or clears
 * exactly one of them. There is deliberately no "save the whole list": two
 * managers working down the same list at the same time would each post their
 * own copy of it, and the last one would quietly un-tick the other's work.
 *
 * ---------------------------------------------------------------------------
 * The day is in the URL, and it has to be
 *
 * A bar that closes at two in the morning finishes its opening list after
 * midnight, and a manager checking on Friday what happened on Thursday is the
 * ordinary case. The column is a date, so the read is an equality on an indexed
 * column rather than `whereDate()` — which this codebase forbids by name,
 * because wrapping a column in a function is how a list scan gets into a hot
 * path.
 */
final class OpeningChecklistController extends Controller
{
    public function show(string $day, BranchContext $branches): JsonResponse
    {
        $date = $this->dayOrFail($day);

        $ticks = OpeningChecklistTick::query()
            ->where('business_day', $date)
            ->get()
            ->keyBy('item');

        return response()->json([
            'data' => array_map(
                static function (string $item) use ($ticks): array {
                    /** @var OpeningChecklistTick|null $tick */
                    $tick = $ticks->get($item);

                    return [
                        'item' => $item,
                        'done' => $tick !== null,
                        /*
                         * The name as it read that morning, not the account's
                         * name today. A person who left in April did still log
                         * the fridges in March, and a checklist that renamed
                         * them to an em dash is a checklist that lost its point.
                         */
                        'by' => $tick?->by_name,
                        'at' => $tick?->created_at?->toIso8601String(),
                    ];
                },
                OpeningChecklistTick::ITEMS,
            ),
            'meta' => [
                'day' => $date,
                'branch_id' => $branches->id(),
                'done' => $ticks->count(),
                'total' => count(OpeningChecklistTick::ITEMS),
            ],
        ]);
    }

    public function store(Request $request, string $day, BranchContext $branches): JsonResponse
    {
        $date = $this->dayOrFail($day);

        $data = $request->validate([
            'item' => ['required', 'string', Rule::in(OpeningChecklistTick::ITEMS)],
            /*
             * Explicit rather than a toggle.
             *
             * A toggle has to read the current state first, and two managers a
             * second apart would each read "not done" and each set it — landing
             * on done twice or on not-done once, depending on which write won.
             * The button on the screen knows which way it is going.
             */
            'done' => ['required', 'boolean'],
        ]);

        $user = $request->user();

        if ($data['done'] === false) {
            OpeningChecklistTick::query()
                ->where('business_day', $date)
                ->where('item', $data['item'])
                ->delete();

            return $this->show($day, $branches);
        }

        /*
         * `updateOrCreate` against the unique index, so the second press of the
         * same box on a busy opening is the same row rather than a constraint
         * violation reaching the client as a 500. `tenant_id` and `branch_id`
         * are stamped by the model's traits from the request's own context.
         */
        OpeningChecklistTick::query()->updateOrCreate(
            ['business_day' => $date, 'item' => $data['item']],
            [
                'user_id' => $user?->getAuthIdentifier(),
                'by_name' => $user?->name,
            ],
        );

        return $this->show($day, $branches);
    }

    /**
     * `2026-08-22`, or a refusal in the one error envelope.
     *
     * Validated here rather than by a route pattern so the answer carries a
     * code and three sentences: a console sending a malformed day gets
     * something it can show, where a 404 from a regex would look like a missing
     * endpoint.
     */
    /**
     * The trading day this path names.
     *
     * `today` resolves through `BusinessDay`, which is the boundary the till
     * and the reports use — a bar that closes at two in the morning is still
     * finishing yesterday's list, and a calendar date would split one evening
     * across two days and show both half done. The router allows the word;
     * this used to refuse it, so every screen asking for `today` got a 422.
     */
    private function dayOrFail(string $day): string
    {
        if ($day === 'today') {
            return app(BusinessDay::class)->dateFor();
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $day) !== 1 || strtotime($day) === false) {
            throw ApiException::of('request.validation_failed', field: 'day');
        }

        return $day;
    }
}
