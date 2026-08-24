<?php

declare(strict_types=1);

namespace Modules\Board\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Events\EventBus;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Board\Events\BoardPublished;
use Modules\Board\Events\BoardPushed;
use Modules\Board\Http\Controllers\Concerns\StandsAtOneVenue;
use Modules\Board\Models\BoardBanner;
use Modules\Board\Models\BoardColumn;
use Modules\Board\Models\BoardScreen;

/**
 * Hand the board over — `POST board/push`.
 *
 * A write plus a broadcast, and it needs both halves.
 *
 * The WRITE is `published_at`, stamped on every row of this venue that has
 * changed since the last push. Until it happens the three tabs are a working
 * copy: a manager reordering columns is mid-edit, and `updated_at >
 * published_at` is how the console says "the wall has not seen this yet". It is
 * the same act the rota performs when a week stops being a draft, for the same
 * reason — and, like the rota, a push that changed nothing writes nothing.
 *
 * The BROADCAST is the half a wall screen cannot do without. There is nobody
 * standing at a menu board: a television that only picked up a new price on its
 * next reload is a television advertising last week's price to the queue, and
 * no one is going to press F5. So the change goes out on
 * `branch.{id}.board` and the screens re-read.
 *
 * The stop list is the exception and already works the other way round: a dish
 * 86'd in the kitchen dims on the wall through `branch.{id}.stoplist`, which
 * the board subscribes to rather than being pushed. That is why nobody dims a
 * dish from this screen, and why a push is not needed when the beef runs out.
 */
final class BoardPushController extends Controller
{
    use StandsAtOneVenue;

    public function __invoke(EventBus $events, TenantContext $tenants): JsonResponse
    {
        $refusal = $this->refuseWithoutABranch();

        if ($refusal !== null) {
            return $refusal;
        }

        $branchId = (int) $this->branchId();
        $pushedAt = Carbon::now();

        /*
         * One transaction over the three tables.
         *
         * A board is one picture. Stamping the columns and then failing on the
         * banners would leave the console saying two tabs are published and one
         * is not, for a wall that was told once — and the manager's next move
         * would be to press push again, which would look like it fixed
         * something.
         */
        $stamped = DB::transaction(static fn (): array => [
            'columns' => BoardColumn::query()->behindTheScreens()
                ->update(['published_at' => $pushedAt]),
            'screens' => BoardScreen::query()->behindTheScreens()
                ->update(['published_at' => $pushedAt]),
            'banners' => BoardBanner::query()->behindTheScreens()
                ->update(['published_at' => $pushedAt]),
        ]);

        $total = array_sum($stamped);

        /*
         * Nothing to say when nothing changed.
         *
         * A manager pressing the button to check would otherwise redraw every
         * screen in the building and write an outbox row telling a subscriber
         * the board had been updated when it had not. `DishStopped` refuses a
         * double tap on the same grounds, and the symptom is the same: a wall
         * that appears to flicker during service.
         */
        if ($total > 0) {
            BoardPushed::dispatch(
                $branchId,
                $stamped['columns'],
                $stamped['screens'],
                $stamped['banners'],
                $pushedAt->toIso8601String(),
            );

            $events->publish(new BoardPublished(
                branchId: $branchId,
                stamped: $stamped,
                pushedAt: $pushedAt->toIso8601String(),
                tenantId: $tenants->id(),
            ));
        }

        return response()->json([
            'data' => [
                'branch_id' => $branchId,
                'pushed' => $total,
                'columns' => $stamped['columns'],
                'screens' => $stamped['screens'],
                'banners' => $stamped['banners'],
                // Null when nothing moved, so a client can tell "already up to
                // date" from "just published" without comparing timestamps.
                'pushed_at' => $total > 0 ? $pushedAt->toIso8601String() : null,
                'screen_count' => (int) config('board.screens', 2),
            ],
        ]);
    }
}
