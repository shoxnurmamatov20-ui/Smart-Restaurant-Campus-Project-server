<?php

declare(strict_types=1);

namespace Modules\Crm\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Crm\Models\Promotion;
use Tests\TestCase;

/**
 * Basket rules nobody types.
 *
 * The window arithmetic gets most of the attention here, and the reason is that
 * it is the part a till gets wrong silently: an offer that "did not apply" is
 * the hardest thing to debug at a counter with a queue behind it, and the one
 * that crosses midnight is the case a naive `between` gets exactly backwards.
 */
final class PromotionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsMarketer(): User
    {
        $user = User::factory()->create();
        $user->assignRole('marketer');
        $this->actingAs($user);

        return $user;
    }

    // ============ Auth & RBAC ============

    public function test_unauthenticated_user_cannot_read_promotions(): void
    {
        $this->getJson('/api/v1/crm/promotions')->assertStatus(401);
    }

    public function test_a_cook_cannot_read_promotions(): void
    {
        $user = User::factory()->create();
        $user->assignRole('cook');
        $this->actingAs($user);

        $this->getJson('/api/v1/crm/promotions')->assertStatus(403);
    }

    public function test_a_waiter_can_see_an_offer_but_never_pause_one(): void
    {
        $user = User::factory()->create();
        $user->assignRole('waiter');
        $this->actingAs($user);

        $promotion = Promotion::factory()->create();

        // They hold `crm.view` — a waiter has to be able to answer "is the
        // business lunch on" — and nothing more.
        $this->getJson('/api/v1/crm/promotions')->assertOk();
        $this->postJson("/api/v1/crm/promotions/{$promotion->id}/pause")->assertStatus(403);
    }

    // ============ Writing one ============

    public function test_a_marketer_can_write_a_business_lunch(): void
    {
        $this->actingAsMarketer();

        $this->postJson('/api/v1/crm/promotions', [
            'name' => ['uz' => 'Biznes-lanch 12:00–15:00', 'ru' => 'Бизнес-ланч', 'en' => 'Business lunch'],
            'kind' => 'bundle',
            'value' => 48_000_00,
            'days' => [1, 2, 3, 4, 5],
            'starts_minute' => 720,
            'ends_minute' => 900,
            'channels' => ['dine_in'],
        ])
            ->assertCreated()
            ->assertJsonPath('data.kind', 'bundle')
            ->assertJsonPath('data.value', 48_000_00)
            ->assertJsonPath('data.days', [1, 2, 3, 4, 5]);
    }

    public function test_a_percentage_over_a_hundred_is_refused(): void
    {
        $this->actingAsMarketer();

        // Somebody meaning "50 000 so'm off" and choosing the wrong kind would
        // otherwise write a discount of five hundred times the basket.
        $this->postJson('/api/v1/crm/promotions', [
            'name' => ['uz' => 'Xato'],
            'kind' => 'nth_off',
            'value' => 50_000,
        ])->assertStatus(422)->assertApiValidationErrors('value');
    }

    public function test_an_unknown_channel_is_refused(): void
    {
        $this->actingAsMarketer();

        $this->postJson('/api/v1/crm/promotions', [
            'name' => ['uz' => 'Xato'],
            'kind' => 'gift',
            'value' => 0,
            'channels' => ['telepathy'],
        ])->assertStatus(422)->assertApiValidationErrors('channels.0');
    }

    // ============ Pausing ============

    public function test_pause_and_resume_move_only_the_flag(): void
    {
        $this->actingAsMarketer();

        $promotion = Promotion::factory()->weekdayLunch()->create();

        $this->postJson("/api/v1/crm/promotions/{$promotion->id}/pause")
            ->assertOk()
            ->assertJsonPath('data.is_active', false)
            // The rule is untouched: a stale card must not be able to rewrite
            // the hours while switching the offer off.
            ->assertJsonPath('data.starts_minute', 720)
            ->assertJsonPath('data.days', [1, 2, 3, 4, 5]);

        $this->postJson("/api/v1/crm/promotions/{$promotion->id}/resume")
            ->assertOk()
            ->assertJsonPath('data.is_active', true);
    }

    // ============ When an offer runs ============

    public function test_a_lunch_offer_runs_on_a_weekday_at_one_and_not_at_five(): void
    {
        $promotion = Promotion::factory()->weekdayLunch()->make();

        // Saturday 13:00 — right hour, wrong day.
        $this->assertFalse($promotion->runsAt(CarbonImmutable::parse('2026-08-22 13:00')));

        // Monday 13:00 — both right.
        $this->assertTrue($promotion->runsAt(CarbonImmutable::parse('2026-08-24 13:00')));

        // Monday 17:00 — right day, wrong hour.
        $this->assertFalse($promotion->runsAt(CarbonImmutable::parse('2026-08-24 17:00')));

        // Monday 13:00, delivery — right time, wrong channel.
        $this->assertFalse($promotion->runsAt(CarbonImmutable::parse('2026-08-24 13:00'), 'delivery'));
    }

    public function test_a_window_that_crosses_midnight_is_on_at_one_in_the_morning(): void
    {
        $promotion = Promotion::factory()->lateNight()->make();

        // 23:00–01:00. A naive `between` says this is never on.
        $this->assertTrue($promotion->runsAt(CarbonImmutable::parse('2026-08-24 23:30')));
        $this->assertTrue($promotion->runsAt(CarbonImmutable::parse('2026-08-25 00:45')));
        $this->assertFalse($promotion->runsAt(CarbonImmutable::parse('2026-08-25 02:00')));
    }

    public function test_a_paused_offer_never_runs_however_right_the_hour(): void
    {
        $promotion = Promotion::factory()->weekdayLunch()->paused()->make();

        $this->assertFalse($promotion->runsAt(CarbonImmutable::parse('2026-08-24 13:00')));
    }

    // ============ Arithmetic ============

    public function test_a_basket_discount_is_integer_arithmetic_and_never_exceeds_the_basket(): void
    {
        $promotion = Promotion::factory()->make(['kind' => 'basket_off', 'value' => 15]);

        // 15% of 47 333 tiyin is 7 099, not 7 099.95 rounded by chance —
        // the same shape `PromoCode::discountFor()` uses so a bill carrying
        // both never rounds apart.
        $this->assertSame(7_099, $promotion->discountFor(47_333));

        $floored = Promotion::factory()->make([
            'kind' => 'basket_off', 'value' => 15, 'min_tiyin' => 50_000_00,
        ]);

        $this->assertSame(0, $floored->discountFor(40_000_00));
    }

    public function test_margin_is_computed_and_is_null_before_anything_sells(): void
    {
        $this->actingAsMarketer();

        $sold = Promotion::factory()->create();
        $sold->forceFill(['revenue_tiyin' => 100_000_00, 'discount_tiyin' => 22_800_00])->save();

        $this->getJson("/api/v1/crm/promotions/{$sold->id}")
            ->assertOk()
            ->assertJsonPath('data.margin_percent', 77.2);

        // Zero would read as "this offer makes no margin", which is the
        // opposite of "nobody has used it".
        $unsold = Promotion::factory()->create();

        $this->getJson("/api/v1/crm/promotions/{$unsold->id}")
            ->assertOk()
            ->assertJsonPath('data.margin_percent', null);
    }

    // ============ Tenant isolation ============

    public function test_one_restaurant_never_sees_another_restaurants_offers(): void
    {
        $a = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        Promotion::factory()->count(3)->create(['tenant_id' => $a->id]);

        $user = User::factory()->create(['tenant_id' => $a->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/crm/promotions')->assertOk()->assertJsonCount(3, 'data');

        // Asking for another restaurant is refused outright: an empty list
        // would read as "no data" and hide the attempt entirely.
        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/crm/promotions')
            ->assertStatus(403)
            ->assertApiError('tenant.mismatch');
    }
}
