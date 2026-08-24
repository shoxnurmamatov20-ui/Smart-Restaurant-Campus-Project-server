<?php

declare(strict_types=1);

namespace Modules\Board\Tests\Feature;

use Modules\Board\Models\BoardColumn;
use Modules\Menu\Models\MenuCategory;

/**
 * Which sections the wall draws, and in what order — `/api/v1/board/columns`.
 *
 * Four properties, and a restaurant notices each one differently.
 *
 * The ADDRESS. A board is a wall in one room. Everywhere else on this API a
 * missing `X-Branch` means "all of them", which is how an owner reads the
 * business — but a null `branch_id` on this table reads BACK as every venue, so
 * a column added without one appears on every wall in the chain and the only
 * symptom is a heading in Termiz that nobody in Termiz put there.
 *
 * The ORDER. Reordering is one write for the whole list. A partial list is
 * refused rather than partly applied, because applying the ids it recognises
 * leaves the ones it does not naming positions the named rows were just given —
 * two headings at position 3, in an order nobody chose.
 *
 * The BOUNDARY. A column points at a menu section and validates through
 * `MenuCatalog`, never through `exists:menu.menu_categories`. A section with
 * nothing sellable under it is refused, because an empty heading four metres
 * from a queue reads as a broken board.
 *
 * The WALL BELONGS TO ONE RESTAURANT. Registon's columns are not visible from
 * Osh Markazi's console, and neither is Registon's menu.
 */
final class BoardColumnTest extends BoardScenario
{
    // ============ Reading ============

    public function test_the_columns_come_back_in_the_order_the_wall_draws_them(): void
    {
        $this->columnFor($this->drinks, position: 2);
        $this->columnFor($this->national, position: 0);
        $this->columnFor($this->grill, position: 1);

        $response = $this->atChilonzor()->getJson('/api/v1/board/columns')->assertOk();

        $this->assertSame(
            [$this->national->id, $this->grill->id, $this->drinks->id],
            array_column((array) $response->json('data'), 'menu_category_id'),
            'The list is drawn left to right, so it has to arrive in that order — '
                .'a console that has to sort it is a console that will sort it differently.',
        );
    }

    public function test_a_column_says_whether_the_wall_has_seen_it_yet(): void
    {
        $fresh = $this->columnFor($this->national);
        $pushed = $this->columnFor($this->grill, position: 1);
        $pushed->forceFill(['published_at' => now()])->save();

        $rows = collect((array) $this->atChilonzor()->getJson('/api/v1/board/columns')->json('data'))
            ->keyBy('id');

        // Never pushed counts as behind: a column the wall has never heard of is
        // a stronger form of out of date, not an exception to it.
        $this->assertTrue($rows[$fresh->id]['behind_the_screens']);
        $this->assertFalse($rows[$pushed->id]['behind_the_screens']);
    }

    // ============ Writing ============

    public function test_a_manager_adds_a_column_and_it_lands_at_this_counter(): void
    {
        $response = $this->atChilonzor()->postJson('/api/v1/board/columns', [
            'menu_category_id' => $this->national->id,
            'accent' => '#7FB0FF',
        ])->assertStatus(201);

        $this->assertSame($this->national->id, $response->json('data.menu_category_id'));
        $this->assertSame($this->chilonzor->id, $response->json('data.branch_id'));

        // Nobody has pushed it, so the wall has not seen it — and the console
        // has to be able to say so before somebody wonders why nothing changed.
        $this->assertTrue($response->json('data.behind_the_screens'));
    }

    public function test_a_new_column_goes_on_the_end_rather_than_first(): void
    {
        $this->columnFor($this->national, position: 0);
        $this->columnFor($this->grill, position: 1);

        $response = $this->atChilonzor()->postJson('/api/v1/board/columns', [
            'menu_category_id' => $this->drinks->id,
        ])->assertStatus(201);

        /*
         * Defaulting to 0 would tie the new heading with whatever is already
         * first, and the tie-break is `id` — so it would appear second, and the
         * manager who just added it would go looking for the arrows.
         */
        $this->assertSame(2, $response->json('data.position'));
    }

    public function test_the_same_section_cannot_be_drawn_twice_on_one_wall(): void
    {
        $this->columnFor($this->national);

        $this->atChilonzor()->postJson('/api/v1/board/columns', [
            'menu_category_id' => $this->national->id,
        ])->assertApiValidationErrors('menu_category_id');
    }

    public function test_the_same_section_may_be_drawn_at_each_counter(): void
    {
        // The mirror of the rule above, and the reason it is scoped rather than
        // global: two venues of one restaurant show the same menu.
        $this->columnFor($this->national);

        $this->atTermiz()->postJson('/api/v1/board/columns', [
            'menu_category_id' => $this->national->id,
        ])->assertStatus(201);
    }

    public function test_a_section_this_menu_does_not_offer_is_refused(): void
    {
        $this->atChilonzor()->postJson('/api/v1/board/columns', [
            'menu_category_id' => 999_999,
        ])->assertApiValidationErrors('menu_category_id');
    }

    public function test_a_section_with_nothing_sellable_under_it_is_refused(): void
    {
        /*
         * An empty section is not a column, it is an empty heading — and four
         * metres from a queue an empty heading reads as a broken board rather
         * than as a category nobody has filled in yet.
         */
        $empty = $this->section('desertlar', 'Desertlar', 'Десерты', 'Desserts', 9);

        $this->atChilonzor()->postJson('/api/v1/board/columns', [
            'menu_category_id' => $empty->id,
        ])->assertApiValidationErrors('menu_category_id');
    }

    public function test_a_colour_that_is_not_a_colour_is_refused(): void
    {
        $this->atChilonzor()->postJson('/api/v1/board/columns', [
            'menu_category_id' => $this->national->id,
            'accent' => 'brand-500',
        ])->assertApiValidationErrors('accent');
    }

    public function test_a_write_with_no_venue_is_refused_rather_than_spread_across_all_of_them(): void
    {
        $this->postJson('/api/v1/board/columns', [
            'menu_category_id' => $this->national->id,
        ])->assertApiError('request.branch_required', 'X-Branch');

        $this->assertSame(0, BoardColumn::query()->withoutGlobalScope('branch')->count());
    }

    public function test_a_column_can_be_recoloured_and_hidden(): void
    {
        $column = $this->columnFor($this->national);

        $this->atChilonzor()->patchJson("/api/v1/board/columns/{$column->id}", [
            'accent' => '#FFC46B',
            'is_visible' => false,
        ])->assertOk()
            ->assertJsonPath('data.accent', '#FFC46B')
            ->assertJsonPath('data.is_visible', false);
    }

    public function test_the_owner_can_take_a_column_off_the_wall(): void
    {
        $column = $this->columnFor($this->national);
        $this->actingAs($this->userWithRole('owner'));

        $this->atChilonzor()->deleteJson("/api/v1/board/columns/{$column->id}")->assertNoContent();

        $this->assertSame(0, BoardColumn::query()->count());
    }

    public function test_a_manager_hides_a_column_rather_than_deleting_it(): void
    {
        /*
         * `board.delete` is not in the branch manager's grant, which is the same
         * shape every module gives them — view, create, update — rather than a
         * rule invented here. It also lands in the right place: hiding is
         * reversible and deleting is not, the design's tab draws no delete
         * button at all, and a heading removed by mistake is a section a venue
         * stops selling until somebody notices.
         */
        $column = $this->columnFor($this->national);

        $this->atChilonzor()->deleteJson("/api/v1/board/columns/{$column->id}")->assertForbidden();

        $this->atChilonzor()->patchJson("/api/v1/board/columns/{$column->id}", ['is_visible' => false])
            ->assertOk()
            ->assertJsonPath('data.is_visible', false);
    }

    // ============ Reordering ============

    public function test_the_arrows_persist_in_one_write(): void
    {
        $first = $this->columnFor($this->national, position: 0);
        $second = $this->columnFor($this->grill, position: 1);
        $third = $this->columnFor($this->drinks, position: 2);

        $response = $this->atChilonzor()->postJson('/api/v1/board/columns/reorder', [
            'ids' => [$third->id, $first->id, $second->id],
        ])->assertOk();

        $this->assertSame(3, $response->json('data.reordered'));
        $this->assertSame(
            [$third->id, $first->id, $second->id],
            array_column((array) $response->json('data.columns'), 'id'),
        );

        $this->assertSame(0, $third->refresh()->position);
        $this->assertSame(1, $first->refresh()->position);
        $this->assertSame(2, $second->refresh()->position);
    }

    public function test_reordering_puts_the_wall_behind_again(): void
    {
        $first = $this->columnFor($this->national, position: 0);
        $second = $this->columnFor($this->grill, position: 1);

        BoardColumn::query()->update(['published_at' => now()->subMinute()]);

        $this->atChilonzor()->postJson('/api/v1/board/columns/reorder', [
            'ids' => [$second->id, $first->id],
        ])->assertOk();

        /*
         * A mass `update()` bypasses Eloquent's timestamps, so without an
         * explicit `updated_at` the rows would still look published — and the
         * console would tell a manager the wall was up to date at the exact
         * moment it had stopped being.
         */
        $this->assertTrue($first->refresh()->isBehindTheScreens());
    }

    public function test_a_partial_list_is_refused_rather_than_partly_applied(): void
    {
        $first = $this->columnFor($this->national, position: 0);
        $second = $this->columnFor($this->grill, position: 1);
        $this->columnFor($this->drinks, position: 2);

        $this->atChilonzor()->postJson('/api/v1/board/columns/reorder', [
            'ids' => [$second->id, $first->id],
        ])->assertApiValidationErrors('ids');

        // Nothing moved. A half-applied reorder is a board in an order nobody
        // chose, and it looks exactly like the one that was asked for.
        $this->assertSame(0, $first->refresh()->position);
        $this->assertSame(1, $second->refresh()->position);
    }

    public function test_the_same_id_twice_is_refused(): void
    {
        $first = $this->columnFor($this->national, position: 0);
        $this->columnFor($this->grill, position: 1);

        $this->atChilonzor()->postJson('/api/v1/board/columns/reorder', [
            'ids' => [$first->id, $first->id],
        ])->assertApiValidationErrors('ids.0');
    }

    public function test_another_counters_column_cannot_be_dragged_into_this_list(): void
    {
        $here = $this->columnFor($this->national, position: 0);

        $there = $this->asRestaurant($this->tenant, $this->termiz, fn (): BoardColumn => BoardColumn::create([
            'menu_category_id' => $this->national->id,
            'position' => 0,
        ]));

        $this->atChilonzor()->postJson('/api/v1/board/columns/reorder', [
            'ids' => [$there->id, $here->id],
        ])->assertApiValidationErrors('ids');
    }

    // ============ Who may ============

    public function test_a_waiter_cannot_read_or_change_the_board(): void
    {
        /*
         * The waiter's sidebar has two sections and neither is this one. They
         * carry the menu on a tablet all shift, which is exactly why the board
         * must not be theirs to edit: a price on a wall is read by everybody in
         * the room at once and corrected by nobody.
         */
        $this->actingAs($this->userWithRole('waiter'));

        $this->atChilonzor()->getJson('/api/v1/board/columns')->assertForbidden();
        $this->atChilonzor()->postJson('/api/v1/board/columns', [
            'menu_category_id' => $this->national->id,
        ])->assertForbidden();
    }

    public function test_signing_out_closes_the_door(): void
    {
        $this->app['auth']->forgetGuards();

        $this->getJson('/api/v1/board/columns')->assertUnauthorized();
    }

    // ============ One restaurant, one board ============

    public function test_another_restaurants_board_is_invisible(): void
    {
        [$rival, $rivalBranch] = $this->rival();

        $this->asRestaurant($rival, $rivalBranch, function () use ($rival, $rivalBranch): void {
            BoardColumn::create([
                'tenant_id' => $rival->id,
                'branch_id' => $rivalBranch->id,
                'menu_category_id' => 4242,
                'position' => 0,
            ]);
        });

        $this->columnFor($this->national);

        $response = $this->atChilonzor()->getJson('/api/v1/board/columns')->assertOk();

        $this->assertCount(1, (array) $response->json('data'));
        $this->assertSame(
            $this->national->id,
            $response->json('data.0.menu_category_id'),
            "Registon's wall must not be readable from Osh Markazi's console.",
        );
    }

    // ============ Helpers ============

    private function columnFor(MenuCategory $section, int $position = 0): BoardColumn
    {
        return BoardColumn::create([
            'menu_category_id' => $section->id,
            'position' => $position,
            'accent' => '#7FB0FF',
        ]);
    }
}
