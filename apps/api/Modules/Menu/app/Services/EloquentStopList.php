<?php

declare(strict_types=1);

namespace Modules\Menu\Services;

use App\Contracts\Menu\StopList;
use App\Contracts\Menu\StoppedDish;
use App\Support\Auth\ActingPerson;
use App\Support\Settings\Policies;
use App\Support\Tenancy\BranchContext;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Menu\Events\DishResumed;
use Modules\Menu\Events\DishStopped;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Models\MenuStopEntry;

/**
 * The 86 sheet, one kitchen at a time.
 *
 * Every method here is branch-scoped by the request's `BranchContext`, and a
 * request with no branch is refused rather than guessed at: "stop this
 * everywhere" is a different act with a different audit trail, and a chef
 * tapping a wall screen in Chilonzor never means it.
 *
 * The writes announce themselves and the reads do not. That asymmetry is the
 * point of the feature — the plan's own test is a chef marking Manti on the wall
 * and two waiters mid-shift watching the tile go dashed without touching
 * anything — and it is why `stop()` and `clear()` return whether they changed
 * something. A broadcast for a no-op would redraw every tablet in the building
 * because somebody double-tapped.
 */
final class EloquentStopList implements StopList
{
    public function __construct(
        private readonly BranchContext $branches,
        private readonly MenuCache $cache,
    ) {}

    /**
     * @return array<int, int>
     */
    public function stoppedItemIds(): array
    {
        if (! $this->branches->hasBranch()) {
            return [];
        }

        return MenuStopEntry::query()
            ->open()
            ->pluck('menu_item_id')
            ->map(static fn ($id): int => (int) $id)
            ->all();
    }

    /**
     * @return array<int, StoppedDish>
     */
    public function current(): array
    {
        if (! $this->branches->hasBranch()) {
            return [];
        }

        return MenuStopEntry::query()
            ->open()
            ->with(['item'])
            // Named through the users table rather than a relation, because the
            // person who stopped it is not part of this module's domain and a
            // `belongsTo(User::class)` here would be Menu holding an opinion
            // about identity. One left join, one name.
            ->leftJoin('public.users as who', 'who.id', '=', 'menu.menu_stop_list.stopped_by')
            ->select(['menu.menu_stop_list.*', 'who.name as stopped_by_name'])
            ->orderByDesc('menu.menu_stop_list.created_at')
            ->get()
            // A row whose dish was deleted outright. The stop is history and the
            // sheet has nothing to draw for it.
            ->filter(static fn (MenuStopEntry $row): bool => $row->item !== null)
            ->map(function (MenuStopEntry $row): StoppedDish {
                $dish = $row->item;

                return new StoppedDish(
                    dishId: (int) $row->menu_item_id,
                    title: $dish->title ?? '',
                    station: $dish->station,
                    stoppedBy: $row->getAttribute('stopped_by_name'),
                    reason: $row->reason,
                    until: $row->stopped_until,
                    since: $row->created_at ?? now(),
                );
            })
            ->values()
            ->all();
    }

    public function stop(int $dishId, ?string $reason = null, ?Carbon $until = null): bool
    {
        $branchId = $this->branches->id();

        if ($branchId === null || ! $this->sells($dishId)) {
            return false;
        }

        $until ??= $this->housesOwnReturn();

        $changed = DB::transaction(function () use ($dishId, $branchId, $reason, $until): bool {
            /*
             * Locked, because two cooks on two screens is the normal case.
             *
             * The partial unique index would refuse the second insert anyway —
             * but it would refuse it with a constraint violation, and a 500 on a
             * wall screen because a colleague tapped the same dish is not an
             * answer. Taking the row first turns the race into an update.
             */
            $open = MenuStopEntry::query()
                ->where('menu_item_id', $dishId)
                ->whereNull('cleared_at')
                ->lockForUpdate()
                ->first();

            if ($open !== null && $open->isActive()) {
                // Already off. Re-stating the reason or extending the expiry is a
                // real change; saying exactly the same thing again is not, and the
                // difference is what keeps a double-tap off every tablet's wire.
                $sameUntil = $open->stopped_until === null
                    ? $until === null
                    : ($until !== null && $open->stopped_until->equalTo($until));

                if ($open->reason === $reason && $sameUntil) {
                    return false;
                }

                $open->update(['reason' => $reason, 'stopped_until' => $until]);

                return true;
            }

            if ($open !== null) {
                // An expired row nobody cleared. Closed now, so the partial index
                // has room for the new one and the history keeps both.
                $open->update(['cleared_at' => now()]);
            }

            MenuStopEntry::query()->create([
                'branch_id' => $branchId,
                'menu_item_id' => $dishId,
                'stopped_by' => ActingPerson::id(),
                'reason' => $reason,
                'stopped_until' => $until,
            ]);

            return true;
        });

        if ($changed) {
            $this->announce($dishId, $branchId, stopped: true, reason: $reason, until: $until);
        }

        return $changed;
    }

    /**
     * When a dish comes back on its own, if the restaurant has said.
     *
     * `policies.stoplist_auto_unstop_hours`, and zero — the default — means
     * never: it stays off until somebody puts it back, which is how this
     * platform behaved before the setting existed.
     *
     * The failure it answers is the 86 sheet's oldest one. A cook stops the
     * lamb at nine on a Friday because the last portion went; the person who
     * stopped it goes home; on Tuesday the lamb is still off, nobody remembers
     * why, and the till has been refusing it for three days. An expiry a
     * restaurant sets once — four hours, or "the rest of the shift" — turns
     * that into a dish that has to be stopped again if it is really out.
     *
     * Only applied when the caller named no time of their own. A chef who says
     * "off until Monday" means Monday, and a house rule quietly overwriting
     * that would be the setting deciding something the person in the kitchen
     * already decided better.
     */
    private function housesOwnReturn(): ?Carbon
    {
        $hours = app(Policies::class)->number('stoplist_auto_unstop_hours');

        return $hours === 0 ? null : Carbon::now()->addHours($hours);
    }

    public function clear(int $dishId): bool
    {
        $branchId = $this->branches->id();

        if ($branchId === null) {
            return false;
        }

        $cleared = MenuStopEntry::query()
            ->where('menu_item_id', $dishId)
            ->whereNull('cleared_at')
            ->update(['cleared_at' => now(), 'cleared_by' => ActingPerson::id()]);

        if ($cleared === 0) {
            return false;
        }

        $this->announce($dishId, $branchId, stopped: false);

        return true;
    }

    /** Whether this restaurant has such a dish at all. */
    private function sells(int $dishId): bool
    {
        return MenuItem::query()->whereKey($dishId)->exists();
    }

    /**
     * Tell every screen in the room, and orphan the cached menu.
     *
     * Both, in that order, and neither is enough alone. The broadcast is what
     * makes the tile go dashed within a second on a tablet that is already open;
     * the cache bump is what makes the next tablet to ask — one that was asleep,
     * one that just paired — get an answer that agrees with it.
     */
    private function announce(
        int $dishId,
        int $branchId,
        bool $stopped,
        ?string $reason = null,
        ?Carbon $until = null,
    ): void {
        $this->cache->flush();

        $dish = MenuItem::query()->find($dishId);
        $title = $dish === null ? '' : ($dish->title ?? '');

        if ($stopped) {
            DishStopped::dispatch($branchId, $dishId, $title, $reason, $until?->toIso8601String());

            return;
        }

        DishResumed::dispatch($branchId, $dishId, $title);
    }
}
