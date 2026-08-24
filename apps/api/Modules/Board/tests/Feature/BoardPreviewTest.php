<?php

declare(strict_types=1);

namespace Modules\Board\Tests\Feature;

use App\Contracts\Menu\StopList;
use Modules\Board\Models\BoardBanner;
use Modules\Board\Models\BoardColumn;
use Modules\Board\Models\BoardScreen;

/**
 * What a customer standing at the counter is looking at — `GET board/preview`.
 *
 * The console draws half its board screen from this, and that half is the
 * reason the screen is worth having: the wall hangs in a different room from
 * whoever configures it, so without a picture of what it currently says a
 * mistake lives until somebody walks past the counter and happens to look up.
 *
 * Everything below is one claim in three parts.
 *
 * The PRICES ARE MENU'S. Nothing here stores what a dish costs. A board with
 * its own copy advertises last week's price the day after a rise, and the
 * person who finds out is a guest at the till being charged something else.
 *
 * The DIMMING IS THE KITCHEN'S. A dish 86'd on the wall screen in the kitchen
 * dims here by itself. Nobody edits the board when the beef runs out — a board
 * that has to be edited separately is a board that sells what the kitchen
 * cannot cook.
 *
 * A DIMMED DISH IS STILL DRAWN. `MenuCatalog::board()`, never `sellable()`. A
 * dish that VANISHES reads as a menu that never had it, so the customer who
 * came in for the cheeseburger asks at the counter instead of reading the
 * answer off the wall.
 */
final class BoardPreviewTest extends BoardScenario
{
    public function test_the_preview_draws_the_configured_columns_in_order_with_live_prices(): void
    {
        $this->column($this->grill->id, position: 1, accent: '#5EE9B5');
        $this->column($this->national->id, position: 0, accent: '#7FB0FF');

        $data = (array) $this->atChilonzor()->getJson('/api/v1/board/preview')->assertOk()->json('data');

        $this->assertSame(
            ['Milliy taomlar', 'Shashliklar'],
            array_column($data['columns'], 'title'),
        );
        $this->assertSame('#7FB0FF', $data['columns'][0]['accent']);

        // Tiyin, straight off `menu_items.price`. This module has no column for
        // it and must never grow one.
        $this->assertSame(48_000_00, $data['columns'][0]['items'][0]['price_tiyin']);
        $this->assertSame('Osh', $data['columns'][0]['items'][0]['title']);
    }

    public function test_a_section_the_board_does_not_draw_is_left_off_it(): void
    {
        // The menu has three sections and the wall shows one. A preview that
        // drew everything would be a preview of the menu, not of the board.
        $this->column($this->national->id);

        $data = (array) $this->atChilonzor()->getJson('/api/v1/board/preview')->json('data');

        $this->assertCount(1, $data['columns']);
    }

    public function test_a_hidden_column_is_not_on_the_wall(): void
    {
        $this->column($this->national->id);
        $this->column($this->grill->id, position: 1)->update(['is_visible' => false]);

        $data = (array) $this->atChilonzor()->getJson('/api/v1/board/preview')->json('data');

        $this->assertSame(['Milliy taomlar'], array_column($data['columns'], 'title'));
    }

    // ============ The 86 sheet ============

    public function test_a_dish_the_kitchen_ran_out_of_dims_without_anybody_editing_the_board(): void
    {
        $this->column($this->national->id);
        $this->column($this->grill->id, position: 1);

        // The chef's tap on the wall screen in the kitchen. Nothing in this
        // module was touched.
        app(StopList::class)->stop($this->lamb->id, "Go'sht tugadi");

        $data = (array) $this->atChilonzor()->getJson('/api/v1/board/preview')->json('data');

        $grill = $data['columns'][1];

        $this->assertSame("Qo'y shashlik", $grill['items'][0]['title']);
        $this->assertTrue($grill['items'][0]['sold_out']);

        // Still drawn, at 38% opacity in the console. A dish that disappeared
        // reads as a menu that never had it.
        $this->assertCount(1, $grill['items']);

        // Everything else is untouched — a stop is one dish, not a mood.
        $this->assertFalse($data['columns'][0]['items'][0]['sold_out']);
    }

    public function test_the_dimmed_count_matches_what_is_actually_dimmed(): void
    {
        /*
         * The note under the preview says "3 dishes are dimmed". It and the
         * pixels above it must come from one read: a manager who sees a number
         * that does not match what they can count stops trusting both, and the
         * one they stop trusting is the board.
         */
        $this->column($this->national->id);
        $this->column($this->grill->id, position: 1);

        app(StopList::class)->stop($this->lamb->id);

        $data = (array) $this->atChilonzor()->getJson('/api/v1/board/preview')->json('data');

        $dimmed = 0;

        foreach ($data['columns'] as $column) {
            foreach ($column['items'] as $item) {
                $dimmed += $item['sold_out'] ? 1 : 0;
            }
        }

        $this->assertSame(1, $dimmed);
        $this->assertSame($dimmed, $data['sold_out_count']);
    }

    public function test_another_kitchens_stop_list_does_not_dim_this_wall(): void
    {
        // A stop is one kitchen's news. Termiz running out of lamb must not grey
        // it out in Chilonzor, or a waiter there sells nothing they cannot see
        // and the loss is silent revenue rather than a visible fault.
        $this->column($this->grill->id);

        $this->asRestaurant($this->tenant, $this->termiz, function (): void {
            app(StopList::class)->stop($this->lamb->id);
        });

        $data = (array) $this->atChilonzor()->getJson('/api/v1/board/preview')->json('data');

        $this->assertFalse($data['columns'][0]['items'][0]['sold_out']);
    }

    // ============ The rotation ============

    public function test_a_scheduled_screen_takes_no_turn_in_the_rotation(): void
    {
        $this->column($this->national->id);

        BoardScreen::create(['slug' => 'main', 'name' => ['uz' => 'A'], 'seconds' => 20, 'position' => 0]);
        BoardScreen::create(['slug' => 'today', 'name' => ['uz' => 'B'], 'seconds' => 8, 'position' => 1]);
        BoardScreen::create(['slug' => 'combo', 'name' => ['uz' => 'C'], 'seconds' => 12, 'position' => 2]);
        BoardScreen::create([
            'slug' => 'breakfast', 'name' => ['uz' => 'D'],
            'seconds' => null, 'window_start' => '08:00', 'window_end' => '11:00', 'position' => 3,
        ]);

        $data = (array) $this->atChilonzor()->getJson('/api/v1/board/preview')->json('data');

        /*
         * Forty, not fifty-two. The breakfast menu does not get twelve seconds
         * every rotation between eight and eleven — it IS the board for those
         * three hours and then stops existing. A manager sets every other
         * duration against this figure, so counting a screen that never comes
         * round makes all of them wrong.
         */
        $this->assertSame(40, $data['rotation_seconds']);
        $this->assertCount(4, $data['playlist']);
    }

    // ============ Where the wall is ============

    public function test_a_preview_with_no_venue_is_refused_rather_than_averaged(): void
    {
        /*
         * `StopList::stoppedItemIds()` answers an empty list without a branch,
         * so a preview that shrugged would quietly show nothing dimmed — and
         * mix two counters' columns into one picture while it was at it.
         */
        $this->column($this->national->id);

        $this->getJson('/api/v1/board/preview')
            ->assertApiError('request.branch_required', 'X-Branch');
    }

    public function test_each_counter_previews_its_own_wall(): void
    {
        $this->column($this->national->id);

        $this->asRestaurant($this->tenant, $this->termiz, function (): void {
            BoardColumn::create(['menu_category_id' => $this->drinks->id, 'position' => 0]);
        });

        $chilonzor = (array) $this->atChilonzor()->getJson('/api/v1/board/preview')->json('data');
        $termiz = (array) $this->atTermiz()->getJson('/api/v1/board/preview')->json('data');

        $this->assertSame(['Milliy taomlar'], array_column($chilonzor['columns'], 'title'));
        $this->assertSame(['Ichimliklar'], array_column($termiz['columns'], 'title'));
    }

    // ============ Honest about what it does not know ============

    public function test_a_column_pointing_at_a_section_the_menu_lost_draws_empty_rather_than_vanishing(): void
    {
        /*
         * There is no foreign key on `menu_category_id` — Menu is another module
         * and a constraint across schemas is a boundary written in DDL — so this
         * is a legal row. An empty heading on the preview is how a manager finds
         * out somebody archived the section; a column that silently disappeared
         * would send them looking for a bug in the board.
         */
        $this->column(999_999);

        $data = (array) $this->atChilonzor()->getJson('/api/v1/board/preview')->json('data');

        $this->assertCount(1, $data['columns']);
        $this->assertNull($data['columns'][0]['title']);
        $this->assertSame([], $data['columns'][0]['items']);
    }

    public function test_the_screen_count_is_configuration_and_says_so(): void
    {
        // There is no device registry for signage on this platform — a wall
        // screen opens a URL and starts drawing — so this number is what the
        // operator configured rather than what is plugged in.
        config()->set('board.screens', 3);
        $this->column($this->national->id);

        $data = (array) $this->atChilonzor()->getJson('/api/v1/board/preview')->json('data');

        $this->assertSame(3, $data['screen_count']);
    }

    // ============ Who may ============

    public function test_a_waiter_cannot_read_the_preview(): void
    {
        $this->actingAs($this->userWithRole('waiter'));

        $this->atChilonzor()->getJson('/api/v1/board/preview')->assertForbidden();
    }

    public function test_another_restaurants_preview_shows_none_of_this_menu(): void
    {
        [$rival, $rivalBranch] = $this->rival();

        $this->column($this->national->id);

        $this->asRestaurant($rival, $rivalBranch, function () use ($rival, $rivalBranch): void {
            BoardBanner::create([
                'tenant_id' => $rival->id,
                'branch_id' => $rivalBranch->id,
                'slug' => 'registon',
                'text' => ['uz' => 'A', 'ru' => 'A', 'en' => 'A'],
                'kind' => 'offer',
                'is_live' => true,
            ]);
        });

        $data = (array) $this->atChilonzor()->getJson('/api/v1/board/preview')->json('data');

        $this->assertSame([], $data['banners'], "Registon's strip must not appear on Osh Markazi's wall.");
    }
}
