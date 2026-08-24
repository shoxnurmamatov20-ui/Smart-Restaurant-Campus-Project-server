<?php

declare(strict_types=1);

namespace Modules\Marketplace\Tests\Feature;

use App\Models\PushToken;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Marketplace\Models\Consumer;
use Modules\Marketplace\Models\DeliveryZone;
use Modules\Marketplace\Models\MarketOrder;
use Modules\Marketplace\Models\Placement;
use Modules\Marketplace\Models\Promotion;
use Modules\Marketplace\Models\Settlement;
use Modules\Marketplace\Models\Store;
use Modules\Marketplace\Models\StoreItem;
use Modules\Marketplace\Models\Subscription;
use Modules\Marketplace\Support\MarketOrderState;
use Modules\Menu\Models\MenuItem;
use Tests\TestCase;

/**
 * The commercial half of the marketplace: offers, banners, boundaries, payouts
 * and the subscription.
 *
 * `MarketOrderFlowTest` proves an order reaches a kitchen. This one proves the
 * money around it behaves — which is the half a restaurant notices being wrong,
 * because every one of these figures ends up on a statement somebody reconciles
 * against a bank account.
 */
final class MarketplaceCommerceTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Store $store;

    private MenuItem $plov;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $this->actingAsOwner();

        $this->plov = MenuItem::factory()->create(['sku' => 'OSH-1', 'price' => 4_400_000, 'station' => 'hot']);

        $this->store = Store::factory()->create([
            'tenant_id' => $this->tenant->id,
            'slug' => 'osh-xona',
            'delivery_fee_tiyin' => 1_200_000,
            'min_order_tiyin' => 0,
            'commission_percent' => 9,
        ]);

        StoreItem::create(['store_id' => $this->store->id, 'menu_item_id' => $this->plov->id, 'markup_tiyin' => 300_000]);
    }

    // ============ Harness ============

    private function actingAsOwner(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    /**
     * Somebody who may LOOK at the marketplace and change nothing.
     *
     * A waiter with `marketplace.view` bolted on, rather than a named role,
     * because the point of the assertions below is the permission and not which
     * job title happens to hold it this month.
     */
    private function actingAsViewer(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('waiter');
        $user->givePermissionTo('marketplace.view');
        $this->actingAs($user);

        return $user;
    }

    private function actingAsOperator(): User
    {
        // The platform operator belongs to no restaurant — that is the account.
        $user = User::factory()->create(['tenant_id' => null]);
        $user->assignRole('super-admin');
        $this->actingAs($user);

        return $user;
    }

    private function asConsumer(?Consumer $consumer = null): Consumer
    {
        $consumer ??= Consumer::factory()->create();

        // A real marketplace request carries neither a console session nor a
        // tenant; leaving either behind would test the test.
        $this->app['auth']->forgetGuards();
        app(TenantContext::class)->clear();
        app(BranchContext::class)->clear();

        $this->withHeader(
            'Authorization',
            'Bearer '.$consumer->createToken('test', [Consumer::ABILITY])->plainTextToken,
        );

        return $consumer;
    }

    private function promotion(string $state = 'running', int $budget = 20_000_000, int $spent = 0): Promotion
    {
        return Promotion::create([
            'store_id' => $this->store->id,
            'code' => 'OSH'.$state,
            'title' => ['uz' => 'Osh -20%', 'ru' => 'Плов -20%', 'en' => 'Plov -20%'],
            'kind' => 'discount',
            'state' => $state,
            'discount_tiyin' => 500_000,
            'budget_tiyin' => $budget,
            'spent_tiyin' => $spent,
        ]);
    }

    // ============ Offers ============

    public function test_a_running_offer_can_be_paused_and_resumed(): void
    {
        $promotion = $this->promotion('running');

        $this->patchJson("/api/v1/marketplace/promotions/{$promotion->id}", ['state' => 'paused'])
            ->assertOk()
            ->assertJsonPath('data.state', 'paused');

        $this->patchJson("/api/v1/marketplace/promotions/{$promotion->id}", ['state' => 'running'])
            ->assertOk()
            ->assertJsonPath('data.state', 'running');
    }

    public function test_a_scheduled_offer_cannot_be_started_early(): void
    {
        // The whole reason the ladder is in the controller: starting a campaign
        // on a day nobody budgeted for is a merchant losing money quietly.
        $promotion = $this->promotion('scheduled');

        $this->patchJson("/api/v1/marketplace/promotions/{$promotion->id}", ['state' => 'running'])
            ->assertApiError('marketplace.promotion_transition');

        $this->assertSame('scheduled', $promotion->refresh()->state);
    }

    public function test_a_cancelled_offer_never_moves_again(): void
    {
        $promotion = $this->promotion('cancelled');

        $this->patchJson("/api/v1/marketplace/promotions/{$promotion->id}", ['state' => 'running'])
            ->assertApiError('marketplace.promotion_transition');
    }

    public function test_a_budget_may_be_changed_but_never_below_what_is_spent(): void
    {
        $promotion = $this->promotion('scheduled', budget: 20_000_000, spent: 8_000_000);

        $this->patchJson("/api/v1/marketplace/promotions/{$promotion->id}", ['budget_tiyin' => 30_000_000])
            ->assertOk()
            ->assertJsonPath('data.budget_tiyin', 30_000_000)
            ->assertJsonPath('data.remaining_tiyin', 22_000_000);

        $this->patchJson("/api/v1/marketplace/promotions/{$promotion->id}", ['budget_tiyin' => 1_000_000])
            ->assertApiError('marketplace.budget_below_spend');

        $this->assertSame(30_000_000, $promotion->refresh()->budget_tiyin);
    }

    public function test_looking_is_not_changing(): void
    {
        $promotion = $this->promotion('running');

        $this->actingAsViewer();

        $this->patchJson("/api/v1/marketplace/promotions/{$promotion->id}", ['state' => 'paused'])
            ->assertForbidden();
    }

    public function test_another_restaurant_cannot_touch_this_offer(): void
    {
        $promotion = $this->promotion('running');

        $other = Tenant::query()->create([
            'name' => 'Lagmon Uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('owner');
        $this->actingAs($stranger);

        // Not found rather than refused: an id that is not yours simply is not
        // there, and 403 would confirm the row exists.
        $this->patchJson("/api/v1/marketplace/promotions/{$promotion->id}", ['state' => 'paused'])
            ->assertNotFound();
    }

    // ============ Paid placement ============

    public function test_a_banner_is_booked_priced_and_queued(): void
    {
        $starts = now()->addDay()->toDateString();

        $response = $this->postJson('/api/v1/marketplace/placements', [
            'slot' => 'home_top',
            'starts_on' => $starts,
            'days' => 3,
        ])->assertCreated();

        $response->assertJsonPath('data.slot', 'home_top')
            ->assertJsonPath('data.days', 3)
            // Snapshotted from the price list, never sent by the client.
            ->assertJsonPath('data.day_rate_tiyin', Placement::DAY_RATE_TIYIN['home_top'])
            ->assertJsonPath('data.total_tiyin', Placement::DAY_RATE_TIYIN['home_top'] * 3)
            ->assertJsonPath('data.queue_position', 0);

        // The same shop cannot buy the same slot from the same day twice.
        $this->postJson('/api/v1/marketplace/placements', [
            'slot' => 'home_top',
            'starts_on' => $starts,
            'days' => 3,
        ])->assertApiError('marketplace.placement_already_booked');
    }

    public function test_a_banner_someone_else_holds_puts_this_one_in_a_queue(): void
    {
        $starts = now()->addDay();

        $other = Tenant::query()->create([
            'name' => 'Lagmon Uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        // Somebody else's booking, covering the same day.
        Placement::query()->forceCreate([
            'tenant_id' => $other->id,
            'store_id' => Store::factory()->create(['tenant_id' => $other->id, 'slug' => 'lagmon-uyi'])->id,
            'slot' => 'home_top',
            'starts_on' => $starts->toDateString(),
            'ends_on' => $starts->copy()->addDays(4)->toDateString(),
            'days' => 5,
            'day_rate_tiyin' => Placement::DAY_RATE_TIYIN['home_top'],
            'total_tiyin' => Placement::DAY_RATE_TIYIN['home_top'] * 5,
            'state' => 'booked',
        ]);

        $this->actingAsOwner();

        $this->postJson('/api/v1/marketplace/placements', [
            'slot' => 'home_top',
            'starts_on' => $starts->toDateString(),
            'days' => 2,
        ])->assertCreated()
            // Told BEFORE Friday, not after it.
            ->assertJsonPath('data.queue_position', 1);
    }

    public function test_releasing_a_banner_bills_the_days_it_actually_ran(): void
    {
        $placement = Placement::query()->forceCreate([
            'tenant_id' => $this->tenant->id,
            'store_id' => $this->store->id,
            'slot' => 'category_top',
            'starts_on' => now()->subDays(2)->toDateString(),
            'ends_on' => now()->addDays(4)->toDateString(),
            'days' => 7,
            'day_rate_tiyin' => Placement::DAY_RATE_TIYIN['category_top'],
            'total_tiyin' => Placement::DAY_RATE_TIYIN['category_top'] * 7,
            'state' => 'running',
        ]);

        $this->deleteJson("/api/v1/marketplace/placements/{$placement->id}")
            ->assertOk()
            ->assertJsonPath('data.state', 'cancelled')
            // Three days on air — the day it started, yesterday, and today.
            ->assertJsonPath('data.days', 3)
            ->assertJsonPath('data.total_tiyin', Placement::DAY_RATE_TIYIN['category_top'] * 3);
    }

    public function test_a_paid_banner_lifts_a_shop_up_the_directory_but_never_above_an_open_one(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Lagmon Uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        // A better-rated rival, open, with no banner.
        Store::factory()->create([
            'tenant_id' => $other->id, 'slug' => 'lagmon-uyi', 'status' => 'live',
            'is_open' => true, 'rating_tenths' => 50,
        ]);

        $this->store->forceFill(['status' => 'live', 'is_open' => true, 'rating_tenths' => 40])->save();

        Placement::query()->forceCreate([
            'tenant_id' => $this->tenant->id,
            'store_id' => $this->store->id,
            'slot' => 'home_top',
            'starts_on' => now()->subDay()->toDateString(),
            'ends_on' => now()->addDays(3)->toDateString(),
            'days' => 5,
            'day_rate_tiyin' => Placement::DAY_RATE_TIYIN['home_top'],
            'total_tiyin' => Placement::DAY_RATE_TIYIN['home_top'] * 5,
            'state' => 'running',
        ]);

        $this->asStranger();

        /** @var array<int, array{slug: string}> $cards */
        $cards = $this->getJson('/api/v1/mp/stores')->assertOk()->json('data');

        // Money buys the top of the shops that can actually cook.
        $this->assertSame('osh-xona', $cards[0]['slug']);

        // And it does not buy the top of the list when the kitchen is shut.
        $this->store->forceFill(['is_open' => false])->save();

        /** @var array<int, array{slug: string}> $closed */
        $closed = $this->getJson('/api/v1/mp/stores')->assertOk()->json('data');

        $this->assertSame('lagmon-uyi', $closed[0]['slug']);
    }

    // ============ Payout details ============

    public function test_a_payout_account_is_saved_and_goes_back_into_review(): void
    {
        $this->putJson('/api/v1/marketplace/settings/payout', [
            'bank_name' => 'Ipoteka Bank',
            'mfo' => '00873',
            'account' => '2020 8000 9000 0000 0001',
            'inn' => '301234500',
            'holder' => 'Osh Xona MChJ',
        ])->assertOk()
            ->assertJsonPath('data.state', 'pending_review')
            // Spaces stripped on the way in, so the stored value is canonical
            // however it was typed.
            ->assertJsonPath('data.account', '20208000900000000001')
            ->assertJsonPath('data.account_last4', '0001');

        // Verified by the platform…
        $this->actingAsOperator();
        $this->patchJson("/api/v1/platform/marketplace/stores/{$this->store->id}/verify", ['state' => 'verified'])
            ->assertOk()
            ->assertJsonPath('data.payout_state', 'verified')
            // Never the whole account on the operator's screen.
            ->assertJsonPath('data.payout.account_last4', '0001');

        // …and back into the queue the moment the merchant edits it again.
        $this->actingAsOwner();
        $this->putJson('/api/v1/marketplace/settings/payout', [
            'bank_name' => 'Kapital Bank',
            'mfo' => '00901',
            'account' => '20208000900000000002',
            'inn' => '301234500',
            'holder' => 'Osh Xona MChJ',
        ])->assertOk()->assertJsonPath('data.state', 'pending_review');
    }

    public function test_a_bank_account_is_not_a_shift_managers_business(): void
    {
        $this->actingAsViewer();

        // `marketplace.view` opens every other read in this module and
        // deliberately not this one.
        $this->getJson('/api/v1/marketplace/settings/payout')->assertForbidden();
    }

    public function test_a_payout_refuses_a_malformed_account(): void
    {
        $this->putJson('/api/v1/marketplace/settings/payout', [
            'bank_name' => 'Ipoteka Bank',
            'mfo' => '873',
            'account' => '123',
            'inn' => '30123',
            'holder' => 'Osh Xona MChJ',
        ])->assertApiValidationErrors(['mfo', 'account', 'inn']);
    }

    public function test_the_platform_will_not_verify_an_account_that_was_never_entered(): void
    {
        $this->actingAsOperator();

        $this->patchJson("/api/v1/platform/marketplace/stores/{$this->store->id}/verify", ['state' => 'verified'])
            ->assertApiError('marketplace.payout_missing');
    }

    public function test_an_owner_cannot_verify_their_own_bank_account(): void
    {
        // The entire value of the state is that somebody outside the restaurant
        // looked at it.
        $this->patchJson("/api/v1/platform/marketplace/stores/{$this->store->id}/verify", ['state' => 'verified'])
            ->assertForbidden();
    }

    // ============ How far a courier will ride ============

    private function zone(int $radiusM = 3_000): DeliveryZone
    {
        return DeliveryZone::create([
            'store_id' => $this->store->id,
            'label' => 'Markaz',
            'radius_m' => $radiusM,
            'latitude_e6' => 41_311_081,
            'longitude_e6' => 69_240_562,
            'sort_order' => 0,
        ]);
    }

    public function test_a_boundary_is_saved_whole_and_published_to_the_shop_window(): void
    {
        $this->putJson('/api/v1/marketplace/delivery-zones', [
            'zones' => [
                ['label' => 'Markaz', 'radius_km' => 3.5, 'latitude' => 41.311081, 'longitude' => 69.240562, 'fee_tiyin' => 900_000],
                ['label' => 'Chekka', 'radius_km' => 8, 'latitude' => 41.311081, 'longitude' => 69.240562, 'min_order_tiyin' => 5_000_000],
            ],
        ])->assertOk()
            ->assertJsonCount(2, 'data')
            // Kilometres in, metres stored, kilometres back out.
            ->assertJsonPath('data.0.radius_km', 3.5)
            ->assertJsonPath('data.0.fee_tiyin', 900_000)
            // Null means "the shop's own", and is not filled in for the client.
            ->assertJsonPath('data.1.fee_tiyin', null);

        $this->store->forceFill(['status' => 'live'])->save();
        $this->asStranger();

        $this->getJson('/api/v1/mp/stores/osh-xona')
            ->assertOk()
            ->assertJsonCount(2, 'data.delivery.zones')
            // Whole kilometres come back as whole numbers, which is what the
            // client draws — the fractional case above is the one that matters.
            ->assertJsonPath('data.delivery.max_radius_km', 8);
    }

    public function test_an_address_outside_every_zone_is_refused_at_checkout(): void
    {
        $this->zone(radiusM: 3_000);
        $this->store->forceFill(['status' => 'live'])->save();

        $this->asConsumer();

        $this->postJson('/api/v1/mp/orders', [
            'store' => 'osh-xona',
            'lines' => [['menu_item_id' => $this->plov->id, 'quantity' => 1]],
            'address' => 'Yangiyo\'l, 40 km',
            // Half a degree north — about fifty-five kilometres.
            'latitude' => 41.811081,
            'longitude' => 69.240562,
        ])->assertApiError('marketplace.outside_delivery_zone');
    }

    public function test_an_address_with_no_coordinates_is_not_the_same_as_one_outside(): void
    {
        $this->zone(radiusM: 3_000);
        $this->store->forceFill(['status' => 'live'])->save();

        $this->asConsumer();

        // Nobody knows where this is, and refusing it loses an order that would
        // have been fine. Every address saved before the app could ask for a
        // fix is in exactly this state.
        $this->postJson('/api/v1/mp/orders', [
            'store' => 'osh-xona',
            'lines' => [['menu_item_id' => $this->plov->id, 'quantity' => 1]],
            'address' => 'Chilonzor 24, 47-xonadon',
        ])->assertCreated();
    }

    public function test_a_zone_may_charge_its_own_delivery_fee(): void
    {
        DeliveryZone::create([
            'store_id' => $this->store->id,
            'label' => 'Markaz',
            'radius_m' => 5_000,
            'latitude_e6' => 41_311_081,
            'longitude_e6' => 69_240_562,
            'fee_tiyin' => 400_000,
            'sort_order' => 0,
        ]);

        $this->store->forceFill(['status' => 'live'])->save();
        $this->asConsumer();

        $this->postJson('/api/v1/mp/orders', [
            'store' => 'osh-xona',
            'lines' => [['menu_item_id' => $this->plov->id, 'quantity' => 1]],
            'address' => 'Chilonzor 24',
            'latitude' => 41.311081,
            'longitude' => 69.240562,
        ])->assertCreated()
            // The zone's four thousand so'm, not the shop's twelve.
            ->assertJsonPath('data.delivery_fee_tiyin', 400_000);
    }

    public function test_the_tightest_circle_wins_not_the_first_one_typed(): void
    {
        /*
         * Concentric zones are the normal shape: a cheap circle round the door
         * and a dearer ring beyond it, both centred on the venue. Every address
         * is exactly as far from one centre as from the other, so a rule that
         * picked the "nearest" zone would pick whichever row the merchant
         * happened to type first — and charge a guest across the street the
         * outer-ring fee.
         *
         * Typed in the wrong order on purpose.
         */
        DeliveryZone::create([
            'store_id' => $this->store->id, 'label' => 'Chekka', 'radius_m' => 9_000,
            'latitude_e6' => 41_311_081, 'longitude_e6' => 69_240_562,
            'fee_tiyin' => 2_400_000, 'sort_order' => 0,
        ]);
        DeliveryZone::create([
            'store_id' => $this->store->id, 'label' => 'Markaz', 'radius_m' => 3_000,
            'latitude_e6' => 41_311_081, 'longitude_e6' => 69_240_562,
            'fee_tiyin' => 900_000, 'sort_order' => 1,
        ]);

        $this->store->forceFill(['status' => 'live'])->save();
        $this->asConsumer();

        $this->postJson('/api/v1/mp/orders', [
            'store' => 'osh-xona',
            'lines' => [['menu_item_id' => $this->plov->id, 'quantity' => 1]],
            'address' => 'Chilonzor 24',
            'latitude' => 41.315,
            'longitude' => 69.242,
        ])->assertCreated()
            ->assertJsonPath('data.delivery_fee_tiyin', 900_000);
    }

    // ============ The weekly payout ============

    public function test_the_weekly_run_issues_a_statement_and_stamps_the_orders_it_paid_for(): void
    {
        $consumer = Consumer::factory()->create();

        $delivered = MarketOrder::query()->forceCreate([
            'tenant_id' => $this->tenant->id,
            'number' => 'MP-1001',
            'consumer_id' => $consumer->id,
            'store_id' => $this->store->id,
            'state' => MarketOrderState::Delivered->value,
            'business_date' => now()->startOfWeek()->subWeek()->addDay()->toDateString(),
            'subtotal_tiyin' => 10_000_000,
            'total_tiyin' => 11_200_000,
            'commission_tiyin' => 900_000,
            'merchant_due_tiyin' => 9_100_000,
            'address' => 'Chilonzor 24',
            'delivered_at' => now()->subDays(3),
        ]);

        $this->artisan('marketplace:settle')->assertSuccessful();

        $settlement = Settlement::query()->where('store_id', $this->store->id)->firstOrFail();

        $this->assertSame(1, $settlement->orders_count);
        $this->assertSame(10_000_000, $settlement->gross_tiyin);
        $this->assertSame(900_000, $settlement->commission_tiyin);
        $this->assertSame(9_100_000, $settlement->payable_tiyin);
        $this->assertStringStartsWith('MP-INV-', $settlement->invoice_number);

        // Stamped — which is the only definition of "already paid for".
        $this->assertSame($settlement->id, (int) $delivered->refresh()->settlement_id);

        // Run it twice: a scheduler that fires again after a deploy is
        // ordinary, and a merchant paid twice is not.
        $this->artisan('marketplace:settle')->assertSuccessful();
        $this->assertSame(1, Settlement::query()->where('store_id', $this->store->id)->count());
    }

    public function test_a_statement_opens_up_into_the_document_an_accountant_reads(): void
    {
        $this->store->savePayout([
            'bank_name' => 'Ipoteka Bank',
            'mfo' => '00873',
            'account' => '20208000900000000001',
            'inn' => '301234500',
            'holder' => 'Osh Xona MChJ',
        ]);

        $settlement = Settlement::query()->create([
            'store_id' => $this->store->id,
            'invoice_number' => 'MP-INV-2026-0001',
            'period_start' => now()->subDays(7)->toDateString(),
            'period_end' => now()->subDay()->toDateString(),
            'orders_count' => 2,
            'gross_tiyin' => 20_000_000,
            'commission_tiyin' => 1_800_000,
            'adjustments_tiyin' => 500_000,
            'payable_tiyin' => 17_700_000,
            'state' => 'due',
        ]);

        $response = $this->getJson("/api/v1/marketplace/settlements/{$settlement->id}")->assertOk();

        $response->assertJsonPath('data.invoice_number', 'MP-INV-2026-0001')
            ->assertJsonPath('data.statement.payable_tiyin', 17_700_000)
            // The last four digits and never the twenty: a statement is a
            // document that leaves the building.
            ->assertJsonPath('data.statement.payout.account_last4', '0001')
            ->assertJsonCount(4, 'data.statement.lines');

        $this->assertNull($response->json('data.statement.payout.account'));
    }

    // ============ MyPOS Plus ============

    public function test_a_subscription_starts_runs_for_a_month_and_stops_without_taking_the_month_back(): void
    {
        $consumer = $this->asConsumer();

        $started = $this->postJson('/api/v1/mp/plus/subscribe', ['pay_rail' => 'click'])->assertCreated();

        $started->assertJsonPath('data.active', true)
            ->assertJsonPath('data.subscription.state', 'active')
            // The screen has to say this rather than imply a standing order.
            ->assertJsonPath('data.renews_automatically', false);

        $consumer->refresh();
        $this->assertNotNull($consumer->plus_until);
        // The fast answer and the history never disagree.
        $renews = Subscription::query()->where('consumer_id', $consumer->id)->firstOrFail()->renews_at;

        $this->assertSame($consumer->plus_until->toIso8601String(), $renews->toIso8601String());

        // A second press must not open a second month.
        $this->postJson('/api/v1/mp/plus/subscribe', ['pay_rail' => 'click'])
            ->assertApiError('marketplace.plus_already_active');

        $cancelled = $this->postJson('/api/v1/mp/plus/cancel')->assertOk();

        $cancelled->assertJsonPath('data.subscription.state', 'cancelled')
            // The month already paid for is NOT taken away.
            ->assertJsonPath('data.active', true);

        $this->postJson('/api/v1/mp/plus/cancel')->assertApiError('marketplace.plus_not_active');
    }

    public function test_a_subscription_belongs_to_the_person_holding_the_token(): void
    {
        $first = $this->asConsumer();
        $this->postJson('/api/v1/mp/plus/subscribe', ['pay_rail' => 'click'])->assertCreated();

        $second = $this->asConsumer(Consumer::factory()->create(['phone' => '+998900000002']));

        $this->getJson('/api/v1/mp/plus')->assertOk()->assertJsonPath('data.active', false);

        $this->assertSame(1, Subscription::query()->where('consumer_id', $first->id)->count());
        $this->assertSame(0, Subscription::query()->where('consumer_id', $second->id)->count());
    }

    // ============ Which messages, and to which phone ============

    public function test_a_guest_switches_off_one_notice_without_switching_off_the_others(): void
    {
        $consumer = $this->asConsumer();

        $this->patchJson('/api/v1/mp/me', ['notification_prefs' => ['promos' => false]])
            ->assertOk()
            ->assertJsonPath('data.notification_prefs.promos', false)
            // Merged, never replaced: the other three keep their values.
            ->assertJsonPath('data.notification_prefs.orders', true)
            ->assertJsonPath('data.notification_prefs.delivery', true)
            ->assertJsonPath('data.notification_prefs.newsletter', false);

        $this->patchJson('/api/v1/mp/me', ['notification_prefs' => ['newsletter' => true]])
            ->assertOk()
            ->assertJsonPath('data.notification_prefs.promos', false)
            ->assertJsonPath('data.notification_prefs.newsletter', true);

        $this->assertNotNull($consumer->refresh()->notification_prefs);
    }

    public function test_a_shoppers_phone_registers_against_a_row_with_no_restaurant(): void
    {
        $consumer = $this->asConsumer();

        $this->postJson('/api/v1/mp/push/tokens', [
            'token' => 'ExponentPushToken[mpconsumer00001]',
            'platform' => 'android',
            'device_name' => 'Pixel 8',
        ])->assertCreated();

        $row = PushToken::query()->withoutGlobalScopes()
            ->where('token', 'ExponentPushToken[mpconsumer00001]')
            ->firstOrFail();

        $this->assertNull($row->tenant_id);
        $this->assertNull($row->user_id);
        $this->assertSame(PushToken::OF_CONSUMER, $row->notifiable_type);
        $this->assertSame($consumer->id, (int) $row->notifiable_id);
        $this->assertSame('mp', $row->surface);

        $this->deleteJson('/api/v1/mp/push/tokens', ['token' => 'ExponentPushToken[mpconsumer00001]'])
            ->assertNoContent();

        $this->assertSame(0, PushToken::query()->withoutGlobalScopes()
            ->where('token', 'ExponentPushToken[mpconsumer00001]')->count());
    }

    public function test_a_token_that_is_not_expos_is_refused(): void
    {
        $this->asConsumer();

        /*
         * Asserted by hand rather than through `assertApiError`, because
         * `push.token_invalid` is deliberately NOT in the catalogue: the core
         * push controller hand-builds the same envelope, and a code registered
         * in two shapes is the drift the catalogue exists to stop. Both
         * controllers answer identically and this pins that.
         */
        $this->postJson('/api/v1/mp/push/tokens', ['token' => 'not-a-token', 'platform' => 'ios'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'push.token_invalid');
    }

    /** Nobody at all — a stranger with a browser. */
    private function asStranger(): void
    {
        $this->app['auth']->forgetGuards();
        app(TenantContext::class)->clear();
        app(BranchContext::class)->clear();
        $this->withHeader('Authorization', '');
    }
}
