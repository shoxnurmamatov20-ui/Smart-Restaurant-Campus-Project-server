<?php

declare(strict_types=1);

namespace Modules\Board\Services;

use App\Contracts\Menu\Dish;
use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\Section;
use App\Contracts\Menu\StopList;
use Illuminate\Support\Carbon;
use Modules\Board\Models\BoardBanner;
use Modules\Board\Models\BoardColumn;
use Modules\Board\Models\BoardScreen;

/**
 * What the wall actually shows, right now.
 *
 * Three configured lists on one side, the live catalogue on the other, and this
 * is the join. It is a service rather than a controller method because the same
 * answer is wanted twice — by `GET board/preview` for the console, and by the
 * screens themselves when a push tells them to re-read — and a second copy of
 * this arithmetic is a second chance for the console's preview and the wall to
 * disagree, which is precisely the fault the preview exists to catch.
 *
 * ---------------------------------------------------------------------------
 * Never `Modules\Menu`
 *
 * Prices and dish names come through `App\Contracts\Menu\MenuCatalog::board()`
 * and dimming through `App\Contracts\Menu\StopList::stoppedItemIds()`.
 * `ModuleBoundaryTest` refuses the import, and the reason is not tidiness: a
 * board holding its own copy of a price advertises last week's price the day
 * after a rise, and a board holding its own sold-out flag is a board somebody
 * has to remember to edit when the beef runs out.
 *
 * `board()` rather than `sellable()`, and the difference is the whole feature:
 * `sellable()` drops what the kitchen has run out of, and a dish that VANISHES
 * from the wall reads as a menu that never had it, so the customer who came in
 * for the cheeseburger asks at the counter instead. `board()` keeps it and
 * flags it, and the console dims it at 38% opacity.
 */
final class BoardComposer
{
    public function __construct(
        private readonly MenuCatalog $catalogue,
        private readonly StopList $stops,
    ) {}

    /**
     * The whole picture for one venue.
     *
     * @return array<string, mixed>
     */
    public function compose(int $branchId, ?Carbon $at = null): array
    {
        $moment = $at ?? Carbon::now();

        /** @var array<int, BoardColumn> $configured */
        $configured = BoardColumn::query()->visible()->inBoardOrder()->get()->all();

        /*
         * The catalogue, keyed by the id a column points at.
         *
         * One call for the whole menu rather than one per column: `board()`
         * eager-loads every section's dishes in a single query pair, and asking
         * it three times would be three round trips for a screen that redraws
         * on every push.
         *
         * @var array<int, Section> $sections
         */
        $sections = [];

        foreach ($this->catalogue->board() as $section) {
            $sections[$section->id] = $section;
        }

        /*
         * The 86 sheet, as a lookup.
         *
         * `Dish::$isStopped` already carries the same fact — `board()` sets it
         * from this very list — but the count under the preview and the dimming
         * on it must come from ONE read, or the note ("3 dishes are dimmed") can
         * disagree with the pixels above it. A manager who sees a number that
         * does not match what they can count stops trusting both.
         *
         * @var array<int, true> $stopped
         */
        $stopped = array_fill_keys($this->stops->stoppedItemIds(), true);

        $columns = [];
        $dimmed = 0;

        foreach ($configured as $column) {
            $section = $sections[$column->menu_category_id] ?? null;

            /*
             * A column pointing at a section the menu no longer has.
             *
             * There is no foreign key (Menu is another module) so this is a
             * legal row, and it draws as an empty column rather than being
             * dropped: an empty heading on the preview is how a manager finds
             * out somebody archived the section, and a column that silently
             * disappeared would send them looking for a bug in the board.
             */
            $items = [];

            foreach ($section->dishes ?? [] as $dish) {
                $isStopped = isset($stopped[$dish->id]);

                if ($isStopped) {
                    $dimmed++;
                }

                $items[] = $this->dish($dish, $isStopped);
            }

            $columns[] = [
                'id' => $column->id,
                'menu_category_id' => $column->menu_category_id,
                'slug' => $section?->slug,
                'title' => $section?->title,
                'accent' => $column->accent,
                'position' => $column->position,
                'items' => $items,
            ];
        }

        /** @var array<int, BoardScreen> $screens */
        $screens = BoardScreen::query()->active()->inBoardOrder()->get()->all();

        return [
            'branch_id' => $branchId,
            'columns' => $columns,
            'playlist' => array_map(fn (BoardScreen $screen): array => $this->screen($screen), $screens),
            'banners' => $this->banners($moment),
            'rotation_seconds' => $this->rotationSeconds($screens),
            'sold_out_count' => $dimmed,
            /*
             * How many televisions this venue drives.
             *
             * Configuration, not data, and it is honest about being a guess:
             * this platform pairs tills (`pos.terminals`) and printers, and it
             * pairs nothing for signage. Until a screen enrols the way a
             * terminal does there is no row to count, and the number under the
             * green dot is what the operator configured rather than what is
             * plugged in.
             */
            'screen_count' => (int) config('board.screens', 2),
            'pushed_at' => $this->lastPush()?->toIso8601String(),
            'behind_the_screens' => $this->behindTheScreens(),
        ];
    }

    /**
     * One turn of the rotation, in seconds.
     *
     * Scheduled screens take no turn — the breakfast menu replaces the board
     * between eight and eleven rather than getting twelve seconds of it — so
     * counting them here would make the figure a manager sets every other
     * duration against wrong all day. `rotationSeconds()` in `board-data.ts`
     * says the same thing on the other side of the wire.
     *
     * @param  array<int, BoardScreen>  $screens
     */
    private function rotationSeconds(array $screens): int
    {
        $total = 0;

        foreach ($screens as $screen) {
            $total += $screen->seconds ?? 0;
        }

        return $total;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function banners(Carbon $moment): array
    {
        return BoardBanner::query()
            ->orderByDesc('is_live')
            ->orderBy('id')
            ->get()
            ->map(fn (BoardBanner $banner): array => [
                'id' => $banner->id,
                'slug' => $banner->slug,
                'title' => $banner->title,
                'text' => $banner->text,
                'kind' => $banner->kind,
                'starts_at' => $banner->starts_at?->toIso8601String(),
                'ends_at' => $banner->ends_at?->toIso8601String(),
                'is_live' => $banner->is_live,
                /*
                 * On the wall at this moment: switched on AND inside its dates.
                 *
                 * The console needs both facts and they are different. A banner
                 * left live after its campaign ended still reads "live" in the
                 * list, and the only way to see that it is not on the wall is
                 * this — which is exactly the mistake the preview was drawn to
                 * catch: "a banner still running from last month".
                 */
                'is_running' => $banner->is_live
                    && ($banner->starts_at === null || $banner->starts_at->lessThanOrEqualTo($moment))
                    && ($banner->ends_at === null || $banner->ends_at->greaterThanOrEqualTo($moment)),
            ])
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function screen(BoardScreen $screen): array
    {
        return [
            'id' => $screen->id,
            'slug' => $screen->slug,
            'title' => $screen->title,
            'seconds' => $screen->seconds,
            'window_start' => $screen->window_start === null ? null : substr($screen->window_start, 0, 5),
            'window_end' => $screen->window_end === null ? null : substr($screen->window_end, 0, 5),
            'is_scheduled' => $screen->is_scheduled,
            'position' => $screen->position,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function dish(Dish $dish, bool $isStopped): array
    {
        return [
            'id' => $dish->id,
            'title' => $dish->title,
            // Tiyin, like every other price on this platform. The console
            // formats it; nothing between here and the wall does arithmetic on
            // it, and a float would put a rounding error on a printed price.
            'price_tiyin' => $dish->price,
            'sold_out' => $isStopped,
        ];
    }

    /** When the wall last heard from this venue, or null if it never has. */
    private function lastPush(): ?Carbon
    {
        $stamps = [
            BoardColumn::query()->max('published_at'),
            BoardScreen::query()->max('published_at'),
            BoardBanner::query()->max('published_at'),
        ];

        $latest = null;

        foreach ($stamps as $stamp) {
            if ($stamp === null) {
                continue;
            }

            $at = Carbon::parse((string) $stamp);

            if ($latest === null || $at->greaterThan($latest)) {
                $latest = $at;
            }
        }

        return $latest;
    }

    /**
     * Whether anything on this venue's board has changed since the last push.
     *
     * Three `exists()` rather than three `get()`: the console asks this on every
     * render and the answer is a boolean, so loading every banner a venue has
     * ever written to find out whether one of them is newer would be a table
     * scan for one bit.
     */
    private function behindTheScreens(): bool
    {
        return BoardColumn::query()->behindTheScreens()->exists()
            || BoardScreen::query()->behindTheScreens()->exists()
            || BoardBanner::query()->behindTheScreens()->exists();
    }
}
