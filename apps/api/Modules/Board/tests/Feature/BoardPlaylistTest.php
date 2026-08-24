<?php

declare(strict_types=1);

namespace Modules\Board\Tests\Feature;

use Illuminate\Database\QueryException;
use Modules\Board\Models\BoardScreen;

/**
 * The rotation — `/api/v1/board/playlist`.
 *
 * One invariant carries this whole tab: a screen either takes a turn for so
 * many seconds, or it replaces the board between two hours and takes no turn at
 * all. Never both, never neither.
 *
 * It matters because of a number. The console shows "one full turn · 40
 * seconds", and a manager sets every duration against it — if the breakfast
 * menu counted for twelve seconds it never actually spends, the figure is wrong
 * all day and every duration chosen from it is wrong with it. The rule is held
 * in three places on purpose: the request, so a person gets a sentence; the
 * check constraint, so a seeder or an importer cannot walk round the request;
 * and the composer's arithmetic, which is what the number is read from.
 */
final class BoardPlaylistTest extends BoardScenario
{
    // ============ Reading ============

    public function test_the_rotation_comes_back_in_running_order(): void
    {
        $this->rotating('combo', 12, position: 2);
        $this->rotating('main', 20, position: 0);
        $this->rotating('today', 8, position: 1);

        $response = $this->atChilonzor()->getJson('/api/v1/board/playlist')->assertOk();

        $this->assertSame(
            ['main', 'today', 'combo'],
            array_column((array) $response->json('data'), 'slug'),
        );
    }

    public function test_a_scheduled_screen_says_so_and_carries_its_hours(): void
    {
        $this->scheduled('breakfast', '08:00', '11:00');

        $row = (array) $this->atChilonzor()->getJson('/api/v1/board/playlist')->json('data.0');

        $this->assertTrue($row['is_scheduled']);
        $this->assertNull($row['seconds']);
        // `HH:MM`, not PostgreSQL's `HH:MM:SS`. A board window is set to the
        // minute, and seconds would travel to a console that strips them —
        // in one more place that can forget to.
        $this->assertSame('08:00', $row['window_start']);
        $this->assertSame('11:00', $row['window_end']);
    }

    // ============ Writing ============

    public function test_a_rotating_screen_is_created_with_a_duration(): void
    {
        $response = $this->atChilonzor()->postJson('/api/v1/board/playlist', [
            'slug' => 'combo',
            'name' => ['uz' => 'Kombo takliflar', 'ru' => 'Комбо', 'en' => 'Combo deals'],
            'seconds' => 12,
        ])->assertStatus(201);

        $this->assertSame(12, $response->json('data.seconds'));
        $this->assertFalse($response->json('data.is_scheduled'));
        $this->assertSame($this->chilonzor->id, $response->json('data.branch_id'));
    }

    public function test_a_scheduled_screen_is_created_with_an_hour_window(): void
    {
        $response = $this->atChilonzor()->postJson('/api/v1/board/playlist', [
            'slug' => 'breakfast',
            'name' => ['uz' => 'Nonushta menyusi', 'ru' => 'Меню завтрака', 'en' => 'Breakfast menu'],
            'window_start' => '08:00',
            'window_end' => '11:00',
        ])->assertStatus(201);

        $this->assertNull($response->json('data.seconds'));
        $this->assertTrue($response->json('data.is_scheduled'));
    }

    public function test_a_screen_that_is_both_is_refused(): void
    {
        $this->atChilonzor()->postJson('/api/v1/board/playlist', [
            'slug' => 'confused',
            'name' => ['uz' => 'Ikkalasi', 'ru' => 'Оба', 'en' => 'Both'],
            'seconds' => 12,
            'window_start' => '08:00',
            'window_end' => '11:00',
        ])->assertApiValidationErrors('seconds');
    }

    public function test_a_screen_that_is_neither_is_refused(): void
    {
        $this->atChilonzor()->postJson('/api/v1/board/playlist', [
            'slug' => 'nothing',
            'name' => ['uz' => 'Hech nima', 'ru' => 'Ничего', 'en' => 'Nothing'],
        ])->assertApiValidationErrors('seconds');
    }

    public function test_half_a_window_is_refused(): void
    {
        // A screen that comes on at eight and never goes off is not what
        // anybody drew, and it is what one end of a window means.
        $this->atChilonzor()->postJson('/api/v1/board/playlist', [
            'slug' => 'halfopen',
            'name' => ['uz' => 'Yarim', 'ru' => 'Половина', 'en' => 'Half'],
            'window_start' => '08:00',
        ])->assertApiValidationErrors('window_end');
    }

    public function test_a_screen_nobody_can_read_in_time_is_refused(): void
    {
        $this->atChilonzor()->postJson('/api/v1/board/playlist', [
            'slug' => 'blink',
            'name' => ['uz' => 'Lip', 'ru' => 'Миг', 'en' => 'Blink'],
            'seconds' => 1,
        ])->assertApiValidationErrors('seconds');
    }

    public function test_the_database_refuses_a_row_the_request_never_saw(): void
    {
        /*
         * The constraint, not the FormRequest. A seeder, a console command or a
         * future importer does not go through validation, and this invariant is
         * the one the whole tab rests on — so it is written where nothing can
         * walk round it.
         */
        $this->expectException(QueryException::class);

        BoardScreen::create([
            'slug' => 'smuggled',
            'name' => ['uz' => 'Yashirin', 'ru' => 'Тайком', 'en' => 'Smuggled'],
            'seconds' => 12,
            'window_start' => '08:00',
            'window_end' => '11:00',
        ]);
    }

    public function test_a_rotating_screen_becomes_a_scheduled_one_in_one_patch(): void
    {
        $screen = $this->rotating('main', 20);

        $this->atChilonzor()->patchJson("/api/v1/board/playlist/{$screen->id}", [
            'seconds' => null,
            'window_start' => '08:00',
            'window_end' => '11:00',
        ])->assertOk()->assertJsonPath('data.is_scheduled', true);
    }

    public function test_adding_a_window_without_clearing_the_duration_is_refused(): void
    {
        /*
         * The merge is the point: a PATCH is a partial body, so the invariant
         * cannot be read off the input alone. Without merging the current row
         * this would reach PostgreSQL and come back a 500, where the manager
         * deserves a sentence and a highlighted field.
         */
        $screen = $this->rotating('main', 20);

        $this->atChilonzor()->patchJson("/api/v1/board/playlist/{$screen->id}", [
            'window_start' => '08:00',
            'window_end' => '11:00',
        ])->assertApiValidationErrors('seconds');
    }

    public function test_two_screens_cannot_share_a_key_at_one_counter(): void
    {
        $this->rotating('main', 20);

        $this->atChilonzor()->postJson('/api/v1/board/playlist', [
            'slug' => 'main',
            'name' => ['uz' => 'Yana asosiy', 'ru' => 'Ещё раз', 'en' => 'Main again'],
            'seconds' => 15,
        ])->assertApiValidationErrors('slug');
    }

    public function test_a_write_with_no_venue_is_refused(): void
    {
        $this->postJson('/api/v1/board/playlist', [
            'slug' => 'main',
            'name' => ['uz' => 'Asosiy', 'ru' => 'Основное', 'en' => 'Main'],
            'seconds' => 20,
        ])->assertApiError('request.branch_required', 'X-Branch');
    }

    // ============ Reordering ============

    public function test_the_rotation_can_be_reordered_in_one_write(): void
    {
        $main = $this->rotating('main', 20, position: 0);
        $today = $this->rotating('today', 8, position: 1);
        $combo = $this->rotating('combo', 12, position: 2);

        $response = $this->atChilonzor()->postJson('/api/v1/board/playlist/reorder', [
            'ids' => [$combo->id, $main->id, $today->id],
        ])->assertOk();

        $this->assertSame(
            ['combo', 'main', 'today'],
            array_column((array) $response->json('data.playlist'), 'slug'),
        );
    }

    public function test_a_partial_rotation_is_refused(): void
    {
        $main = $this->rotating('main', 20, position: 0);
        $this->rotating('today', 8, position: 1);

        $this->atChilonzor()->postJson('/api/v1/board/playlist/reorder', [
            'ids' => [$main->id],
        ])->assertApiValidationErrors('ids');

        $this->assertSame(0, $main->refresh()->position);
    }

    // ============ Who may ============

    public function test_a_chef_cannot_change_the_rotation(): void
    {
        /*
         * A chef owns the 86 sheet, and the 86 sheet is the ONE thing that
         * changes this board without anybody touching it. What the wall shows
         * and for how long is not theirs — the sidebar draws them one section
         * and it is the KDS.
         */
        $this->actingAs($this->userWithRole('chef'));

        $this->atChilonzor()->getJson('/api/v1/board/playlist')->assertForbidden();
        $this->atChilonzor()->postJson('/api/v1/board/playlist', [
            'slug' => 'main',
            'name' => ['uz' => 'Asosiy', 'ru' => 'Основное', 'en' => 'Main'],
            'seconds' => 20,
        ])->assertForbidden();
    }

    // ============ One restaurant, one rotation ============

    public function test_another_restaurants_rotation_is_invisible(): void
    {
        [$rival, $rivalBranch] = $this->rival();

        $this->asRestaurant($rival, $rivalBranch, function () use ($rival, $rivalBranch): void {
            BoardScreen::create([
                'tenant_id' => $rival->id,
                'branch_id' => $rivalBranch->id,
                'slug' => 'registon-main',
                'name' => ['uz' => 'Registon', 'ru' => 'Регистан', 'en' => 'Registon'],
                'seconds' => 30,
            ]);
        });

        $this->rotating('main', 20);

        $response = $this->atChilonzor()->getJson('/api/v1/board/playlist')->assertOk();

        $this->assertCount(1, (array) $response->json('data'));
        $this->assertSame('main', $response->json('data.0.slug'));
    }

    // ============ Helpers ============

    private function rotating(string $slug, int $seconds, int $position = 0): BoardScreen
    {
        return BoardScreen::create([
            'slug' => $slug,
            'name' => ['uz' => $slug, 'ru' => $slug, 'en' => $slug],
            'seconds' => $seconds,
            'position' => $position,
        ]);
    }

    private function scheduled(string $slug, string $from, string $to, int $position = 0): BoardScreen
    {
        return BoardScreen::create([
            'slug' => $slug,
            'name' => ['uz' => $slug, 'ru' => $slug, 'en' => $slug],
            'seconds' => null,
            'window_start' => $from,
            'window_end' => $to,
            'position' => $position,
        ]);
    }
}
