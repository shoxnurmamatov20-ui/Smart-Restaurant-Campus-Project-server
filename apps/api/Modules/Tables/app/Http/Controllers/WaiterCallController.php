<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Tables\Models\WaiterCall;

/**
 * Which tables have their hand up.
 *
 * `tables.waiter_calls` has been written to since the QR screen's two buttons
 * became real — "ofitsiantni chaqirish" and "hisobni so'rash" — and nothing
 * could read it back. A raised hand that no screen lists is a raised hand
 * nobody answers, which is worse than the button doing nothing: the guest has
 * been told somebody is coming.
 *
 * Two readers, one endpoint. The console's floor screen draws the whole room;
 * a waiter's handset draws the same list narrowed to the venue it is signed in
 * at. Neither wants a different sort — oldest first, always, because the table
 * that has been waiting longest is the one that matters and any other order
 * teaches a waiter to serve whoever asked most recently.
 */
final class WaiterCallController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $calls = WaiterCall::query()
            ->with('restaurantTable')
            /*
             * Open by default, because that is the question.
             *
             * `?open=0` answers the whole history, which is what a manager asking
             * "how long did tables wait last night" needs; the default is the
             * floor screen's own list. A default of "everything" would have the
             * busiest room in the building drawing a month of answered calls.
             */
            ->when(
                ! $request->has('open') || filter_var($request->input('open'), FILTER_VALIDATE_BOOLEAN),
                fn ($query) => $query->whereIn('status', WaiterCall::LIVE_STATUSES),
            )
            ->when($request->filled('kind'), fn ($query) => $query->where('kind', $request->string('kind')))
            ->when(
                $request->filled('table_id'),
                fn ($query) => $query->where('restaurant_table_id', $request->integer('table_id')),
            )
            ->orderBy('id')
            ->limit(min($request->integer('limit', 100), 200))
            ->get();

        $now = now();

        return response()->json([
            'data' => $calls->map(fn (WaiterCall $call): array => [
                'id' => (int) $call->getKey(),
                'kind' => $call->kind,
                'status' => $call->status,
                'table' => [
                    'id' => (int) $call->restaurant_table_id,
                    'label' => $call->restaurantTable?->label,
                ],
                'order_id' => $call->order_id === null ? null : (int) $call->order_id,
                'seat_no' => $call->seat_no,
                'note' => $call->note,
                'created_at' => $call->created_at?->toIso8601String(),
                'acknowledged_at' => $call->acknowledged_at?->toIso8601String(),
                /*
                 * The number the screen actually renders, computed once here
                 * rather than on every client.
                 *
                 * A handset, a console and a KDS would each parse the timestamp
                 * and subtract, against three clocks — and a tablet whose clock
                 * is four minutes fast would show a table waiting four minutes
                 * less than it is. The server owns "how long", because the server
                 * owns the moment it started.
                 */
                'waiting_minutes' => $call->created_at === null
                    ? 0
                    : max(0, (int) $call->created_at->diffInMinutes($now)),
            ])->all(),
        ]);
    }

    /**
     * "Coming" — and then "done".
     *
     * Two words rather than one button, because they are two different promises.
     * `acknowledged` tells the guest's screen somebody is on their way and takes
     * the table off the "may I ask again" list; `done` closes the call and is
     * what the waiting-time report measures against.
     *
     * Idempotent in the useful direction: acknowledging an acknowledged call is
     * a no-op rather than an error, because two waiters both tapping it is a
     * busy room rather than a bug.
     */
    public function resolve(Request $request, WaiterCall $call): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'in:acknowledged,done'],
        ]);

        if (! in_array($call->status, WaiterCall::LIVE_STATUSES, true)) {
            throw ApiException::of('tables.call_closed', field: 'status');
        }

        /** @var User $person */
        $person = $request->user();

        $call->forceFill(array_filter([
            'status' => (string) $validated['status'],
            'acknowledged_by_user_id' => $call->acknowledged_by_user_id ?? $person->getKey(),
            // Stamped once. A call that was acknowledged at 19:02 and closed at
            // 19:06 has two facts on it, and overwriting the first would lose the
            // only measure of how fast somebody answered.
            'acknowledged_at' => $call->acknowledged_at ?? now(),
            'closed_at' => $validated['status'] === 'done' ? now() : null,
        ], static fn (mixed $value): bool => $value !== null))->save();

        return response()->json([
            'data' => [
                'id' => (int) $call->getKey(),
                'status' => $call->status,
                'acknowledged_at' => $call->acknowledged_at?->toIso8601String(),
                'closed_at' => $call->closed_at?->toIso8601String(),
            ],
        ]);
    }
}
