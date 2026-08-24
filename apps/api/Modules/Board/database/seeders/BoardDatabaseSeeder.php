<?php

declare(strict_types=1);

namespace Modules\Board\Database\Seeders;

use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\Section;
use Illuminate\Database\Seeder;
use Modules\Board\Models\BoardBanner;
use Modules\Board\Models\BoardColumn;
use Modules\Board\Models\BoardScreen;

/**
 * A wall that is already showing something.
 *
 * Runs inside DatabaseSeeder, which has established the tenant and the head
 * office, so `BelongsToTenant` and `BelongsToBranch` stamp every row without
 * this seeder passing either.
 *
 * ---------------------------------------------------------------------------
 * It reads the menu through the contract, and it has to
 *
 * A column points at a `menu.menu_categories.id`, and Board never imports Menu
 * — `ModuleBoundaryTest` refuses it and the module would stop being separable
 * the moment it did. `MenuCatalog::board()` answers with the sections this
 * restaurant actually has, in the order the menu sorts them, which is also the
 * order a board should draw them in: the sections a kitchen puts first are the
 * ones it sells most of.
 *
 * That makes this a seeder that READS, so it runs after `MenuDatabaseSeeder`
 * for the same reason `KitchenTicketSeeder` runs after Orders.
 *
 * ---------------------------------------------------------------------------
 * Deterministic, and published
 *
 * `updateOrCreate` keyed on what makes a row unique, so `db:seed` twice is one
 * board rather than two. No randomness: the same seed gives the same wall, and
 * a demo whose columns swap places between installs is a demo nobody can write
 * a screenshot test against.
 *
 * Every row is stamped as published. A seeded restaurant is a running
 * restaurant and its wall is showing its board; leaving them unpublished would
 * open the console on a red "the screens are behind" the moment anybody looked,
 * which is a false alarm about data nobody entered.
 */
final class BoardDatabaseSeeder extends Seeder
{
    /** The board's own palette — see BoardColumn on why these are not tokens. */
    private const ACCENTS = ['#7FB0FF', '#5EE9B5', '#FFC46B'];

    /**
     * How many headings a wall fits before the queue cannot read it.
     *
     * Three, and it is a physical limit rather than a preference: the design
     * draws three columns at the size a person four metres away can read. A
     * restaurant with eleven menu sections does not get eleven columns, it gets
     * the first three and a playlist.
     */
    private const COLUMNS = 3;

    public function run(MenuCatalog $catalogue): void
    {
        $this->columns($catalogue);
        $this->playlist();
        $this->banners();
    }

    private function columns(MenuCatalog $catalogue): void
    {
        $sections = array_slice($catalogue->board(), 0, self::COLUMNS);

        foreach ($sections as $position => $section) {
            /** @var Section $section */
            BoardColumn::query()->updateOrCreate(
                ['menu_category_id' => $section->id],
                [
                    'accent' => self::ACCENTS[$position % count(self::ACCENTS)],
                    'position' => $position,
                    'is_visible' => true,
                    'published_at' => now(),
                ],
            );
        }
    }

    /**
     * Three rotating screens and one that owns the morning.
     *
     * The breakfast row is the one worth having in demo data: it is the only
     * shape that proves the tab means something. A playlist of three durations
     * looks like a list of durations; a fourth row with an hour window and no
     * duration is what makes "a scheduled screen takes no turn" visible — the
     * rotation adds up to forty seconds, not fifty-two.
     */
    private function playlist(): void
    {
        $screens = [
            ['main', 'Asosiy menyu', 'Основное меню', 'Main menu', 20, null, null],
            ['today', 'Kunlik taklif', 'Предложение дня', "Today's offer", 8, null, null],
            ['combo', 'Kombo takliflar', 'Комбо-предложения', 'Combo deals', 12, null, null],
            ['breakfast', 'Nonushta menyusi', 'Меню завтрака', 'Breakfast menu', null, '08:00', '11:00'],
        ];

        foreach ($screens as $position => [$slug, $uz, $ru, $en, $seconds, $from, $to]) {
            BoardScreen::query()->updateOrCreate(
                ['slug' => $slug],
                [
                    'name' => ['uz' => $uz, 'ru' => $ru, 'en' => $en],
                    'seconds' => $seconds,
                    'window_start' => $from,
                    'window_end' => $to,
                    'is_active' => true,
                    'position' => $position,
                    'published_at' => now(),
                ],
            );
        }
    }

    /**
     * One of each kind, and one of them switched off.
     *
     * The dark one matters as much as the two live ones: the tab has to show
     * what a draft looks like, and a demo where every banner is on the wall
     * teaches a manager that the toggle does nothing.
     */
    private function banners(): void
    {
        $banners = [
            [
                'lavash', 'offer', true,
                'Ikkinchi lavash 50% chegirma',
                'Второй лаваш −50%',
                'Second lavash 50% off',
            ],
            [
                'qaynatma', 'new', true,
                "Yangi: Qaynatma mol go'sht",
                'Новинка: кайнатма из говядины',
                'New: beef qaynatma',
            ],
            [
                'birthday', 'loyalty', false,
                "Tug'ilgan kunga 10% chegirma",
                '10% скидка в день рождения',
                '10% off on your birthday',
            ],
        ];

        foreach ($banners as [$slug, $kind, $live, $uz, $ru, $en]) {
            BoardBanner::query()->updateOrCreate(
                ['slug' => $slug],
                [
                    'text' => ['uz' => $uz, 'ru' => $ru, 'en' => $en],
                    'kind' => $kind,
                    /*
                     * No dates on any of them, deliberately.
                     *
                     * A seeded window is a window that expires: the demo would
                     * look right the week it was installed and show three
                     * finished campaigns a month later, which is exactly the
                     * mistake the preview exists to catch — reported, every
                     * time, as a bug in the board.
                     */
                    'starts_at' => null,
                    'ends_at' => null,
                    'is_live' => $live,
                    'published_at' => now(),
                ],
            );
        }
    }
}
