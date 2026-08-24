<?php

declare(strict_types=1);

namespace Modules\Board\Tests\Feature;

use Modules\Board\Database\Seeders\BoardDatabaseSeeder;
use Modules\Board\Models\BoardBanner;
use Modules\Board\Models\BoardColumn;
use Modules\Board\Models\BoardScreen;

/**
 * The demo wall.
 *
 * A seeder is code that runs once on a machine nobody is watching, so it fails
 * quietly: the console opens on an empty board and reads as a screen that has
 * not been built rather than as data that did not arrive.
 *
 * Two properties, and the second is the one that bites. It has to be
 * DETERMINISTIC — `db:seed` twice is one board, not two — and it has to READ
 * the menu rather than invent ids, because a column pointing at a section this
 * restaurant does not have draws an empty heading and there is nothing on the
 * screen to say why.
 */
final class BoardSeederTest extends BoardScenario
{
    public function test_the_seeded_board_draws_the_menu_this_restaurant_actually_has(): void
    {
        $this->seed(BoardDatabaseSeeder::class);

        $columns = BoardColumn::query()->inBoardOrder()->get();

        // Three headings, because a wall fits three at a size somebody four
        // metres away can read — not one per menu section.
        $this->assertCount(3, $columns);
        $this->assertSame(
            [$this->national->id, $this->grill->id, $this->drinks->id],
            $columns->pluck('menu_category_id')->map(static fn ($id): int => (int) $id)->all(),
            'The columns point at real sections, read through MenuCatalog rather than guessed.',
        );
        $this->assertSame([0, 1, 2], $columns->pluck('position')->all());
    }

    public function test_the_seeded_rotation_has_one_screen_that_takes_no_turn(): void
    {
        $this->seed(BoardDatabaseSeeder::class);

        $screens = BoardScreen::query()->inBoardOrder()->get();

        $this->assertSame(['main', 'today', 'combo', 'breakfast'], $screens->pluck('slug')->all());

        /*
         * The breakfast row is why this fixture is worth having. Three durations
         * look like a list of durations; a fourth row with an hour window and no
         * duration is what makes "a scheduled screen takes no turn" visible on
         * the screen — the rotation adds up to forty, not fifty-two.
         */
        $breakfast = $screens->firstWhere('slug', 'breakfast');
        $this->assertNotNull($breakfast);
        $this->assertNull($breakfast->seconds);
        $this->assertTrue($breakfast->is_scheduled);
    }

    public function test_the_seeded_strip_shows_one_of_each_kind_and_one_switched_off(): void
    {
        $this->seed(BoardDatabaseSeeder::class);

        $banners = BoardBanner::query()->orderBy('id')->get();

        $this->assertSame(['offer', 'new', 'loyalty'], $banners->pluck('kind')->all());

        // The dark one matters as much as the two live ones: a demo where every
        // banner is on the wall teaches a manager that the toggle does nothing.
        $this->assertSame([true, true, false], $banners->pluck('is_live')->all());

        // No dates on any of them. A seeded window expires, and a month later
        // the demo shows three finished campaigns — which is exactly the mistake
        // the preview exists to catch, reported every time as a bug.
        $this->assertTrue($banners->every(static fn (BoardBanner $b): bool => $b->starts_at === null));
    }

    public function test_the_seeded_board_arrives_already_on_the_wall(): void
    {
        // A seeded restaurant is a running restaurant. Leaving the rows
        // unpublished would open the console on "the screens are behind" the
        // moment anybody looked, about data nobody entered.
        $this->seed(BoardDatabaseSeeder::class);

        $this->assertFalse(BoardColumn::query()->behindTheScreens()->exists());
        $this->assertFalse(BoardScreen::query()->behindTheScreens()->exists());
        $this->assertFalse(BoardBanner::query()->behindTheScreens()->exists());
    }

    public function test_seeding_twice_is_one_board(): void
    {
        $this->seed(BoardDatabaseSeeder::class);
        $this->seed(BoardDatabaseSeeder::class);

        $this->assertSame(3, BoardColumn::query()->count());
        $this->assertSame(4, BoardScreen::query()->count());
        $this->assertSame(3, BoardBanner::query()->count());
    }
}
