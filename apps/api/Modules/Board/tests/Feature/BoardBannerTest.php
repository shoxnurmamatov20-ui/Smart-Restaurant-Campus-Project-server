<?php

declare(strict_types=1);

namespace Modules\Board\Tests\Feature;

use Illuminate\Support\Carbon;
use Modules\Board\Models\BoardBanner;
use Modules\Board\Models\BoardColumn;

/**
 * The promo strip — `/api/v1/board/banners`.
 *
 * Two things this tab has to get right, and both are about a stranger reading a
 * wall.
 *
 * THREE LANGUAGES, always. A dish name reads as itself in any language — a
 * guest who sees "Lag'mon" on a Russian menu has still been told what it is. A
 * banner is a sentence making a promise about a price, and one printed only in
 * Uzbek on a counter where half the queue reads Russian is an offer half the
 * queue cannot claim. So all three are required on create AND on edit: a banner
 * rewritten in one language and left stale in the other two is the same failure
 * arriving later.
 *
 * LIVE AND RUNNING ARE DIFFERENT QUESTIONS. `is_live` is a person's switch;
 * the window is the calendar. A banner left switched on after its campaign
 * ended still reads "live" in the list, and the only way to see it is not on the
 * wall is `is_running` — which is exactly the mistake the preview was drawn to
 * catch: "a banner still running from last month".
 */
final class BoardBannerTest extends BoardScenario
{
    // ============ Reading ============

    public function test_what_is_on_the_wall_is_listed_first(): void
    {
        $this->banner('draft', 'loyalty', live: false);
        $live = $this->banner('lavash', 'offer', live: true);

        $response = $this->atChilonzor()->getJson('/api/v1/board/banners')->assertOk();

        // A manager opening this tab is looking for what is on the wall, and
        // what is on the wall should not be below three drafts written after it.
        $this->assertSame($live->id, $response->json('data.0.id'));
    }

    // ============ Writing ============

    public function test_a_banner_is_written_in_three_languages_and_lands_at_this_counter(): void
    {
        $response = $this->atChilonzor()->postJson('/api/v1/board/banners', [
            'slug' => 'lavash',
            'text' => [
                'uz' => 'Ikkinchi lavash 50% chegirma',
                'ru' => 'Второй лаваш −50%',
                'en' => 'Second lavash 50% off',
            ],
            'kind' => 'offer',
            'is_live' => true,
        ])->assertStatus(201);

        $this->assertSame('offer', $response->json('data.kind'));
        $this->assertTrue($response->json('data.is_live'));
        $this->assertSame($this->chilonzor->id, $response->json('data.branch_id'));
        $this->assertSame('Второй лаваш −50%', $response->json('data.text.ru'));
    }

    public function test_a_banner_in_one_language_only_is_refused(): void
    {
        $this->atChilonzor()->postJson('/api/v1/board/banners', [
            'slug' => 'yarim',
            'text' => ['uz' => 'Faqat o\'zbekcha'],
            'kind' => 'offer',
        ])->assertApiValidationErrors(['text.ru', 'text.en']);
    }

    public function test_rewriting_one_language_and_leaving_the_others_is_refused(): void
    {
        $banner = $this->banner('lavash', 'offer', live: true);

        $this->atChilonzor()->patchJson("/api/v1/board/banners/{$banner->id}", [
            'text' => ['uz' => 'Yangi matn'],
        ])->assertApiValidationErrors(['text.ru', 'text.en']);
    }

    public function test_a_kind_the_console_has_no_chip_for_is_refused(): void
    {
        // Three kinds, three coloured chips. A fourth word would render as an
        // unstyled pill nobody chose the colour of.
        $this->atChilonzor()->postJson('/api/v1/board/banners', [
            'slug' => 'nomalum',
            'text' => ['uz' => 'A', 'ru' => 'A', 'en' => 'A'],
            'kind' => 'shouting',
        ])->assertApiValidationErrors('kind');
    }

    public function test_a_window_that_ends_before_it_starts_is_refused(): void
    {
        $this->atChilonzor()->postJson('/api/v1/board/banners', [
            'slug' => 'teskari',
            'text' => ['uz' => 'A', 'ru' => 'A', 'en' => 'A'],
            'kind' => 'new',
            'starts_at' => '2026-08-31T00:00:00+05:00',
            'ends_at' => '2026-08-17T00:00:00+05:00',
        ])->assertApiValidationErrors('ends_at');
    }

    public function test_two_banners_cannot_share_a_key_at_one_counter(): void
    {
        $this->banner('lavash', 'offer', live: true);

        $this->atChilonzor()->postJson('/api/v1/board/banners', [
            'slug' => 'lavash',
            'text' => ['uz' => 'A', 'ru' => 'A', 'en' => 'A'],
            'kind' => 'offer',
        ])->assertApiValidationErrors('slug');
    }

    public function test_a_write_with_no_venue_is_refused(): void
    {
        $this->postJson('/api/v1/board/banners', [
            'slug' => 'lavash',
            'text' => ['uz' => 'A', 'ru' => 'A', 'en' => 'A'],
            'kind' => 'offer',
        ])->assertApiError('request.branch_required', 'X-Branch');
    }

    public function test_a_banner_can_be_taken_off_the_wall_without_deleting_it(): void
    {
        // The switch, not the dates. Un-publishing by editing the end date would
        // make "we stopped running it" indistinguishable from "the campaign
        // ended", and only one of those is worth asking somebody about.
        $banner = $this->banner('lavash', 'offer', live: true);

        $this->atChilonzor()->patchJson("/api/v1/board/banners/{$banner->id}", ['is_live' => false])
            ->assertOk()
            ->assertJsonPath('data.is_live', false);
    }

    // ============ Live is not running ============

    public function test_a_banner_left_live_after_its_dates_is_not_on_the_wall(): void
    {
        Carbon::setTestNow('2026-09-15 12:00:00');

        $this->banner('avgust', 'new', live: true, from: '2026-08-17 00:00:00', to: '2026-08-31 23:59:59');
        $this->columnForNational();

        $preview = $this->atChilonzor()->getJson('/api/v1/board/preview')->assertOk();

        $banner = (array) $preview->json('data.banners.0');

        // Still switched on — nobody turned it off — and no longer on the wall.
        // The list has to show both facts or the mistake is invisible.
        $this->assertTrue($banner['is_live']);
        $this->assertFalse($banner['is_running']);

        Carbon::setTestNow();
    }

    public function test_a_banner_with_no_dates_runs_until_somebody_turns_it_off(): void
    {
        $this->banner('doimiy', 'loyalty', live: true);
        $this->columnForNational();

        $banner = (array) $this->atChilonzor()->getJson('/api/v1/board/preview')->json('data.banners.0');

        $this->assertTrue($banner['is_running']);
    }

    // ============ Who may ============

    public function test_a_cashier_cannot_write_the_promo_strip(): void
    {
        /*
         * A cashier stands under this board all shift and may listen to its
         * channel — the screen is driven from the counter. Writing what it
         * promises is a different power: a discount printed on a wall is a
         * discount every guest in the room has been offered.
         */
        $this->actingAs($this->userWithRole('cashier'));

        $this->atChilonzor()->postJson('/api/v1/board/banners', [
            'slug' => 'lavash',
            'text' => ['uz' => 'A', 'ru' => 'A', 'en' => 'A'],
            'kind' => 'offer',
        ])->assertForbidden();
    }

    // ============ One restaurant, one strip ============

    public function test_another_restaurants_banners_are_invisible(): void
    {
        [$rival, $rivalBranch] = $this->rival();

        $this->asRestaurant($rival, $rivalBranch, function () use ($rival, $rivalBranch): void {
            BoardBanner::create([
                'tenant_id' => $rival->id,
                'branch_id' => $rivalBranch->id,
                'slug' => 'registon-offer',
                'text' => ['uz' => 'A', 'ru' => 'A', 'en' => 'A'],
                'kind' => 'offer',
                'is_live' => true,
            ]);
        });

        $this->banner('lavash', 'offer', live: true);

        $response = $this->atChilonzor()->getJson('/api/v1/board/banners')->assertOk();

        $this->assertCount(1, (array) $response->json('data'));
        $this->assertSame('lavash', $response->json('data.0.slug'));
    }

    // ============ Helpers ============

    private function banner(
        string $slug,
        string $kind,
        bool $live,
        ?string $from = null,
        ?string $to = null,
    ): BoardBanner {
        return BoardBanner::create([
            'slug' => $slug,
            'text' => ['uz' => $slug, 'ru' => $slug, 'en' => $slug],
            'kind' => $kind,
            'is_live' => $live,
            'starts_at' => $from,
            'ends_at' => $to,
        ]);
    }

    /** The preview needs at least one column, or there is nothing to draw around. */
    private function columnForNational(): void
    {
        BoardColumn::create([
            'menu_category_id' => $this->national->id,
            'position' => 0,
        ]);
    }
}
