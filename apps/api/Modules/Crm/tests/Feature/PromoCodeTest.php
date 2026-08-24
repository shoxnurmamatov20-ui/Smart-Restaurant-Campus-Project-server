<?php

declare(strict_types=1);

namespace Modules\Crm\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Crm\Database\Seeders\CrmPromoSeeder;
use Modules\Crm\Models\Coupon;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\PromoCode;
use Modules\Crm\Models\PromoRedemption;
use Tests\TestCase;

/**
 * Checking a promo code against a basket.
 *
 * The customer app has been answering this in the browser from a three-entry
 * map, with its own docblock explaining why that is a fixture: "a client that
 * decides its own discount decides its own price". So the tests below are one
 * per refusal — a client cannot be trusted to know which of six reasons applies
 * and there is no point moving the decision to the server if only the happy
 * path comes with it.
 */
final class PromoCodeTest extends TestCase
{
    use RefreshDatabase;

    /** 50 000 so'm, the floor the customer app's `PROMO_MINIMUM` names. */
    private const FLOOR = 50_000_00;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = $this->restaurant('osh-xona');
        app(TenantContext::class)->set($this->tenant);
    }

    private function restaurant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug), 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    /** @param array<string, mixed> $body */
    private function check(array $body, ?string $token = null, ?Tenant $at = null): TestResponse
    {
        $headers = [
            'X-Tenant' => ($at ?? $this->tenant)->slug,
            'Accept' => 'application/json',
        ];

        if ($token !== null) {
            $headers['Authorization'] = 'Bearer '.$token;
        }

        return $this->withHeaders($headers)->postJson('/api/v1/public/promo-codes/check', [
            'subtotal_tiyin' => 100_000_00,
            ...$body,
        ]);
    }

    // ============ The seeded campaigns are the fixture's campaigns ============

    public function test_the_seeder_matches_the_customer_apps_fixture(): void
    {
        $this->seed(CrmPromoSeeder::class);

        /*
         * `PROMO_CODES = { OSH15: 15, YANGI10: 10, PLOV20: 20 }` and
         * `PROMO_MINIMUM = 50 000 so'm`, from
         * packages/surfaces/src/customer/data.ts. A screen that behaves one way
         * against the fixture and another against a seeded database is a screen
         * nobody can develop against.
         */
        foreach (['OSH15' => 15, 'YANGI10' => 10, 'PLOV20' => 20] as $code => $percent) {
            $promo = PromoCode::query()->where('code', $code)->firstOrFail();

            $this->assertSame('percent', $promo->kind);
            $this->assertSame($percent, $promo->value);
            $this->assertSame(self::FLOOR, $promo->min_tiyin);
        }

        // And the three coupons the loyalty screen draws, in its order.
        $this->assertSame(
            ['pickup-5', 'free-delivery', 'second-lavash'],
            Coupon::query()->orderBy('sort_order')->pluck('key')->all(),
        );
    }

    // ============ Accepting ============

    public function test_a_good_code_answers_with_tiyin(): void
    {
        PromoCode::factory()->percent(15)->create(['code' => 'OSH15']);

        $this->check(['code' => 'OSH15', 'subtotal_tiyin' => 100_000_00])
            ->assertOk()
            ->assertJsonPath('data.code', 'OSH15')
            // 15% of 100 000 so'm, in tiyin, computed with integers throughout.
            ->assertJsonPath('data.discount_tiyin', 15_000_00);
    }

    public function test_the_word_is_matched_however_it_was_typed(): void
    {
        PromoCode::factory()->percent(15)->create(['code' => 'OSH15']);

        $this->check(['code' => ' osh15 '])->assertOk()->assertJsonPath('data.code', 'OSH15');
    }

    public function test_a_fixed_code_is_capped_at_the_basket(): void
    {
        PromoCode::factory()->fixed(80_000_00)->create(['code' => 'SOVGA']);

        // A discount larger than the basket would make the bill negative — a
        // refund the restaurant never agreed to.
        $this->check(['code' => 'SOVGA', 'subtotal_tiyin' => 30_000_00])
            ->assertOk()
            ->assertJsonPath('data.discount_tiyin', 30_000_00);
    }

    public function test_a_percentage_is_capped_where_the_campaign_says(): void
    {
        PromoCode::factory()->percent(20)->create([
            'code' => 'PLOV20',
            'max_discount_tiyin' => 100_000_00,
        ]);

        // 20% of a four-million-so'm corporate order is not what anybody meant
        // by a lunch promotion.
        $this->check(['code' => 'PLOV20', 'subtotal_tiyin' => 4_000_000_00])
            ->assertOk()
            ->assertJsonPath('data.discount_tiyin', 100_000_00);
    }

    public function test_nothing_is_written_by_a_check(): void
    {
        $promo = PromoCode::factory()->percent(15)->create(['code' => 'OSH15']);

        $this->check(['code' => 'OSH15'])->assertOk();

        // A cart asks this whenever somebody presses apply. An endpoint that
        // consumed the campaign's budget per press would empty it before
        // anybody ordered.
        $this->assertSame(0, $promo->refresh()->used_count);
        $this->assertSame(0, PromoRedemption::query()->count());
    }

    // ============ Every refusal, one at a time ============

    public function test_an_unknown_code(): void
    {
        $this->check(['code' => 'NOSUCH'])->assertApiError('promo.not_found', field: 'code');
    }

    public function test_a_switched_off_campaign(): void
    {
        PromoCode::factory()->create(['code' => 'OFF', 'is_active' => false]);

        $this->check(['code' => 'OFF'])->assertApiError('promo.inactive', field: 'code');
    }

    public function test_a_campaign_that_has_not_started(): void
    {
        PromoCode::factory()->create(['code' => 'SOON', 'starts_at' => now()->addWeek()]);

        $this->check(['code' => 'SOON'])->assertApiError('promo.not_started', field: 'code');
    }

    public function test_a_campaign_that_ended(): void
    {
        PromoCode::factory()->expired()->create(['code' => 'GONE']);

        $this->check(['code' => 'GONE'])->assertApiError('promo.expired', field: 'code');
    }

    public function test_a_campaign_that_has_been_used_up(): void
    {
        PromoCode::factory()->create(['code' => 'FULL', 'max_uses' => 5, 'used_count' => 5]);

        $this->check(['code' => 'FULL'])->assertApiError('promo.exhausted', field: 'code');
    }

    public function test_a_guest_who_has_already_used_it(): void
    {
        $promo = PromoCode::factory()->create(['code' => 'ONCE', 'per_customer_limit' => 1]);
        $guest = Customer::factory()->create(['phone' => '+998901234567']);
        PromoRedemption::factory()->create([
            'promo_code_id' => $promo->id,
            'customer_id' => $guest->id,
        ]);

        $token = $guest->createToken('test', ['customer'])->plainTextToken;

        $this->check(['code' => 'ONCE'], token: $token)->assertApiError('promo.used', field: 'code');
    }

    public function test_the_per_customer_limit_needs_a_customer_to_count_against(): void
    {
        $promo = PromoCode::factory()->create(['code' => 'ONCE', 'per_customer_limit' => 1]);
        $guest = Customer::factory()->create(['phone' => '+998901234567']);
        PromoRedemption::factory()->create([
            'promo_code_id' => $promo->id,
            'customer_id' => $guest->id,
        ]);

        // Anonymously the answer is "yes, that code works" — refusing every
        // anonymous cart because somebody, somewhere, has used the code would
        // make a per-customer limit into a per-campaign one.
        $this->check(['code' => 'ONCE'])->assertOk();
    }

    public function test_a_basket_below_the_floor_is_told_how_far_below(): void
    {
        PromoCode::factory()->percent(15)->withFloor(self::FLOOR)->create(['code' => 'OSH15']);

        $refused = $this->check(['code' => 'OSH15', 'subtotal_tiyin' => 38_000_00])
            ->assertApiError('promo.min_not_met', field: 'code');

        $this->assertSame(self::FLOOR, $refused->json('error.min_tiyin'));
        // "You need 12 000 so'm more" is a different sentence from "you need
        // 50 000 so'm", and the screen picks whichever fits.
        $this->assertSame(12_000_00, $refused->json('error.short_by_tiyin'));
    }

    public function test_the_floor_is_checked_last_because_it_is_the_only_one_a_guest_can_fix(): void
    {
        PromoCode::factory()->expired()->withFloor(self::FLOOR)->create(['code' => 'GONE']);

        // Both wrong; the guest is told about the one they cannot fix, because
        // "add a drink and try again" on a dead campaign is worse advice than
        // none.
        $this->check(['code' => 'GONE', 'subtotal_tiyin' => 1000])
            ->assertApiError('promo.expired');
    }

    public function test_money_arriving_as_a_float_is_refused(): void
    {
        PromoCode::factory()->percent(15)->create(['code' => 'OSH15']);

        // A cart sending 52000.5 is a cart whose so'm/tiyin arithmetic has
        // already gone wrong two screens earlier.
        $this->check(['code' => 'OSH15', 'subtotal_tiyin' => 52000.5])->assertStatus(422);
    }

    // ============ One restaurant's campaign is not another's ============

    public function test_another_restaurants_code_does_not_exist_here(): void
    {
        $other = $this->restaurant('lagmon-uyi');
        app(TenantContext::class)->set($other);
        PromoCode::factory()->percent(50)->create(['code' => 'THEIRS']);
        app(TenantContext::class)->set($this->tenant);

        $this->check(['code' => 'THEIRS'])->assertApiError('promo.not_found', field: 'code');
    }

    public function test_two_restaurants_may_run_the_same_word(): void
    {
        $other = $this->restaurant('lagmon-uyi');
        app(TenantContext::class)->set($other);
        PromoCode::factory()->percent(50)->create(['code' => 'OSH15']);
        app(TenantContext::class)->set($this->tenant);
        PromoCode::factory()->percent(15)->create(['code' => 'OSH15']);

        // Each gets its own answer; neither can redeem the other's.
        $this->check(['code' => 'OSH15'])->assertOk()->assertJsonPath('data.discount_tiyin', 15_000_00);
        $this->check(['code' => 'OSH15'], at: $other)->assertOk()->assertJsonPath('data.discount_tiyin', 50_000_00);
    }

    // ============ A loyalty coupon typed into the same box ============

    public function test_a_reserved_coupon_is_accepted_in_the_promo_field(): void
    {
        $guest = Customer::factory()->create(['phone' => '+998901234567', 'points' => 2480]);
        $coupon = Coupon::factory()->costing(500)->create(['kind' => 'percent', 'value' => 5]);
        $token = $guest->createToken('test', ['customer'])->plainTextToken;

        $code = $this->withHeaders([
            'X-Tenant' => $this->tenant->slug,
            'Authorization' => 'Bearer '.$token,
            'Accept' => 'application/json',
        ])->postJson("/api/v1/public/coupons/{$coupon->id}/reserve")
            ->assertCreated()
            ->json('data.code');

        // A guest cannot tell a campaign code from a loyalty coupon and should
        // not have to: one field, one endpoint.
        $this->check(['code' => $code, 'subtotal_tiyin' => 100_000_00], token: $token)
            ->assertOk()
            ->assertJsonPath('data.discount_tiyin', 5_000_00);
    }

    public function test_somebody_elses_coupon_code_is_not_a_promo_code(): void
    {
        $owner = Customer::factory()->create(['phone' => '+998901111111', 'points' => 2480]);
        $thief = Customer::factory()->create(['phone' => '+998902222222', 'points' => 2480]);
        $coupon = Coupon::factory()->costing(500)->create();

        $ownerToken = $owner->createToken('test', ['customer'])->plainTextToken;
        $code = $this->withHeaders([
            'X-Tenant' => $this->tenant->slug,
            'Authorization' => 'Bearer '.$ownerToken,
            'Accept' => 'application/json',
        ])->postJson("/api/v1/public/coupons/{$coupon->id}/reserve")->json('data.code');

        // Read over a shoulder, typed by somebody else: a reservation is
        // personal, so it falls through to the campaign table and finds nothing.
        $this->check(
            ['code' => $code],
            token: $thief->createToken('test', ['customer'])->plainTextToken,
        )->assertApiError('promo.not_found');
    }

    // ============ The console side ============

    public function test_a_marketer_manages_campaigns_and_a_waiter_does_not(): void
    {
        $marketer = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $marketer->assignRole('marketer');
        $this->actingAs($marketer);

        $this->postJson('/api/v1/crm/promo-codes', [
            'code' => 'yangi10',
            'kind' => 'percent',
            'value' => 10,
            'min_tiyin' => self::FLOOR,
        ])
            ->assertCreated()
            // Stored upper case, so the unique index and the lookup agree.
            ->assertJsonPath('data.code', 'YANGI10')
            ->assertJsonPath('data.used_count', 0);

        $this->getJson('/api/v1/crm/promo-codes')->assertOk()->assertJsonCount(1, 'data');

        $waiter = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $waiter->assignRole('waiter');
        $this->actingAs($waiter);

        $this->postJson('/api/v1/crm/promo-codes', ['code' => 'X', 'kind' => 'percent', 'value' => 5])
            ->assertStatus(403);
    }

    public function test_a_percentage_over_a_hundred_is_refused_where_somebody_can_still_fix_it(): void
    {
        $marketer = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $marketer->assignRole('marketer');
        $this->actingAs($marketer);

        // Somebody meaning 15 000 so'm and choosing the wrong kind.
        $this->postJson('/api/v1/crm/promo-codes', [
            'code' => 'OOPS', 'kind' => 'percent', 'value' => 15000,
        ])->assertStatus(422);
    }

    public function test_the_same_word_cannot_run_twice_at_one_restaurant(): void
    {
        $marketer = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $marketer->assignRole('marketer');
        $this->actingAs($marketer);
        PromoCode::factory()->create(['code' => 'OSH15']);

        $this->postJson('/api/v1/crm/promo-codes', ['code' => 'osh15', 'kind' => 'percent', 'value' => 5])
            ->assertApiError('promo.code_taken', field: 'code');
    }
}
