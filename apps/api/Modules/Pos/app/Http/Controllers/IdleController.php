<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Contracts\Finance\DayBook;
use App\Contracts\Staff\Roster;
use App\Contracts\Tables\FloorBoard;
use App\Http\Controllers\Controller;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Pos\Http\Middleware\RequireTerminalToken;

/**
 * Everything the idle screen shows, in one call.
 *
 * The idle screen is what a till displays all day when nobody is signed in —
 * the design gives it a clock, the venue's name, four live figures and the
 * terminal's own identity line ("POS-3 · Chilonzor"). It renders BEFORE any
 * PIN is typed, so the only credential in the room is the device token from
 * pairing: this endpoint authenticates the DEVICE and nothing else, and is
 * careful to show only what a guest standing in the doorway could see anyway —
 * how full the room looks, plus one number (takings) that the design already
 * ruled on: it is for staff modes and hidden in guest mode, which is the
 * client's toggle, not a reason to build a second endpoint.
 *
 * One call, not four: the tablet polls this every minute all day, and the
 * three figures come from three modules the till must not import — they arrive
 * through App\Contracts, each answering zero when its module is off.
 */
final class IdleController extends Controller
{
    public function __invoke(
        Request $request,
        FloorBoard $floor,
        Roster $roster,
        DayBook $dayBook,
        BusinessDay $businessDay,
    ): JsonResponse {
        // Resolved by the `pos.device` middleware, which refuses a user token
        // before this method runs: the payload is scoped by the TERMINAL's
        // branch, and a person's token names no till.
        $terminal = RequireTerminalToken::of($request);

        // Seeing the idle payload is also proof of life — the same signal the
        // heartbeat records, recorded here too so a till that only ever idles
        // still reads "online" on the manager's terminal-health screen.
        $terminal->forceFill(['last_seen_at' => now()])->save();

        $tally = $floor->tally($terminal->branch_id);
        $branch = $terminal->branch;

        return response()->json([
            'terminal' => [
                'code' => $terminal->code,
                'name' => $terminal->name,
                'mode' => $terminal->mode,
                'app_version' => $terminal->app_version,
            ],
            'restaurant' => [
                'name' => $terminal->tenant?->name,
                'slug' => $terminal->tenant?->slug,
            ],
            'branch' => $branch === null ? null : [
                'name' => $branch->name,
                'city' => $branch->city,
                'address' => $branch->address,
            ],
            'stats' => [
                'occupied_tables' => $tally->occupied,
                'free_tables' => $tally->free,
                'on_shift' => $roster->onShiftCount($terminal->branch_id),
                // Integer tiyin, like every money field on the platform. The
                // client formats it; this side never rounds for display.
                'takings_tiyin' => $dayBook->takingsToday($terminal->branch_id),
            ],
            'business_date' => $businessDay->dateFor(),
            'server_time' => now()->toIso8601String(),
        ]);
    }
}
