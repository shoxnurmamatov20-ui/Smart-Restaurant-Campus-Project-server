<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Resources\NotificationResource;
use App\Models\ConsoleNotification;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;

/**
 * The bell in the console's top bar.
 *
 * Core rather than a module, for the same reason `branches` is: several modules
 * write into this list — Finance flags a variance, Pos asks for an approval,
 * Finance again when a fiscal document expires — and none of them owns it. A
 * notification is a fact about a PERSON, and people belong to the core.
 *
 * ---------------------------------------------------------------------------
 * Everything here answers about the caller, and nothing else
 *
 * There is no permission to check and no permission that would help. "May I
 * read my own notifications" is not a question an owner can answer differently
 * for a waiter, and a role that could be refused it would be a role whose
 * console silently stopped telling them things. So the guard is the query: the
 * WHERE names the caller, and an id belonging to somebody else is not refused,
 * it is not found — which is the shape every other self-scoped endpoint on this
 * platform uses (`auth/me`, `push/tokens`, `staff/me/today`).
 *
 * Under it sits the tenant scope from `BelongsToTenant` and, under that,
 * row-level security. Three belts for one list is not excessive here: the same
 * person can hold accounts at two restaurants, and the bell is the one screen
 * that renders on every other screen.
 *
 * ---------------------------------------------------------------------------
 * Unread only, and severity before clock
 *
 * The tray has exactly one other control — "Mark all read" — and a button that
 * empties a list has to actually empty it, so the feed is what is still
 * outstanding. There is no history view because the design draws none; every
 * row links to the module that owns the fact, which is where the history
 * actually lives.
 *
 * The order is the design's and it is not merely newest-first. Two of the six
 * rows the tray was drawn against end with somebody being short of money at the
 * end of a shift, and they belong at the top of the list at 09:00 the next
 * morning — under a rota that was published an hour ago they would not be read
 * at all. So: `high` then `mid` then `low`, and the clock inside each.
 */
final class NotificationController extends Controller
{
    private const MAX_PER_PAGE = 50;

    /**
     * `high` before `mid` before `low`.
     *
     * Spelled out rather than sorted on the column, because as text the three
     * read high, low, mid — which is alphabetical and is not the order anybody
     * means. A numeric rank column was the alternative and was rejected: it
     * would be a second copy of the same three words, free to drift from the
     * one the console paints.
     */
    private const SEVERITY_FIRST = "case level when 'high' then 0 when 'mid' then 1 else 2 end";

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $rows = $this->mine($request)
            ->whereNull('read_at')
            // Eager, because the venue is on every row and the tray is a list.
            ->with('branch')
            ->orderByRaw(self::SEVERITY_FIRST)
            ->orderByDesc('created_at')
            ->paginate($perPage)
            ->withQueryString();

        return NotificationResource::collection($rows);
    }

    /**
     * Mark one read.
     *
     * Idempotent by doing nothing the second time rather than by writing the
     * same value again: `read_at` is when the reader saw it, and a retry after
     * a lost response must not move that stamp forward. The row comes back so a
     * caller that wants to redraw the row has it without a second request.
     */
    public function read(Request $request, string $notification): NotificationResource
    {
        $row = $this->mine($request)
            ->with('branch')
            ->whereKey($notification)
            ->firstOrFail();

        if ($row->read_at === null) {
            $row->forceFill(['read_at' => now()])->save();
        }

        return new NotificationResource($row);
    }

    /**
     * Mark the whole tray read — the design's own control, top right.
     *
     * One statement rather than a loop: the tray shows what is unread, so the
     * set this touches is the set the reader just looked at, and marking them
     * one at a time would leave a half-cleared bell if the connection dropped
     * in the middle of it.
     */
    public function readAll(Request $request): JsonResponse
    {
        $marked = $this->mine($request)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['data' => ['marked' => $marked]]);
    }

    /**
     * The caller's own rows, and only those.
     *
     * `notifiable_type` is checked as well as the id, because the morph pair is
     * what identifies the addressee: a paired till authenticates as a Terminal
     * through the same guard, and a Terminal whose id happens to match a user's
     * must not read that person's bell.
     *
     * @return Builder<ConsoleNotification>
     */
    private function mine(Request $request): Builder
    {
        $caller = $request->user();

        return ConsoleNotification::query()
            ->where('notifiable_type', $caller instanceof Model ? $caller->getMorphClass() : '')
            ->where('notifiable_id', $caller?->getAuthIdentifier());
    }
}
