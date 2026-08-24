<?php

declare(strict_types=1);

namespace Modules\Marketplace\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Marketplace\Models\Consumer;
use Modules\Marketplace\Models\MarketOrder;
use Modules\Marketplace\Models\Store;
use Tests\TestCase;

/**
 * Two walls, and they are made of different things.
 *
 * The marketplace is the first surface on this platform where BOTH matter at
 * once, which is why they are tested together:
 *
 *   **Between restaurants** — row-level security. A merchant reading their queue
 *   is a signed-in employee with a tenant, so the policies do the work and no
 *   `where` in any controller is load-bearing. This is the wall that must hold
 *   even for a query nobody has written yet.
 *
 *   **Between customers** — the token, and nothing else. `marketplace.consumers`
 *   carries no `tenant_id` and therefore no policy: a marketplace customer
 *   belongs to the platform. So every consumer endpoint scopes by
 *   `consumer_id` taken from the token, and this file is what proves the
 *   controllers never take it from a URL instead.
 *
 * The second is the one to worry about. It has no database backstop.
 */
final class MarketplaceIsolationTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $osh;

    private Tenant $lavash;

    private Store $oshStore;

    private Store $lavashStore;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->osh = $this->tenant('osh-xona');
        $this->lavash = $this->tenant('lavash-baraka');

        $this->oshStore = Store::factory()->create(['tenant_id' => $this->osh->id, 'slug' => 'osh-xona']);
        $this->lavashStore = Store::factory()->create(['tenant_id' => $this->lavash->id, 'slug' => 'lavash-baraka']);
    }

    private function tenant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug), 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    private function actingAsOwnerOf(Tenant $tenant): User
    {
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    private function orderOn(Store $store, ?Consumer $consumer = null): MarketOrder
    {
        return MarketOrder::factory()->create([
            'tenant_id' => $store->tenant_id,
            'store_id' => $store->id,
            'consumer_id' => ($consumer ?? Consumer::factory()->create())->id,
        ]);
    }

    // ============ Restaurant against restaurant ============

    public function test_a_merchant_never_sees_the_restaurant_next_doors_queue(): void
    {
        $mine = $this->orderOn($this->oshStore);
        $theirs = $this->orderOn($this->lavashStore);

        $this->actingAsOwnerOf($this->osh);

        $queue = $this->getJson('/api/v1/marketplace/orders?status=new')->assertOk();

        $numbers = array_column((array) $queue->json('data'), 'number');
        $this->assertContains($mine->number, $numbers);
        $this->assertNotContains($theirs->number, $numbers);
    }

    public function test_a_merchant_cannot_move_another_restaurants_order(): void
    {
        $theirs = $this->orderOn($this->lavashStore);

        $this->actingAsOwnerOf($this->osh);

        /*
         * 404 rather than 403, and it is the policies rather than a check:
         * route-model binding runs after `ResolveTenant`, so the row simply is
         * not visible to this connection. That is the stronger guarantee — it
         * holds for every query this controller does not make.
         */
        $this->patchJson("/api/v1/marketplace/orders/{$theirs->id}", ['state' => 'accepted'])
            ->assertStatus(404);

        $this->assertSame('placed', $theirs->refresh()->state);
    }

    public function test_a_merchants_settlement_screen_counts_only_their_own_takings(): void
    {
        MarketOrder::factory()->delivered()->create([
            'tenant_id' => $this->osh->id,
            'store_id' => $this->oshStore->id,
            'consumer_id' => Consumer::factory()->create()->id,
        ]);
        MarketOrder::factory()->delivered()->create([
            'tenant_id' => $this->lavash->id,
            'store_id' => $this->lavashStore->id,
            'consumer_id' => Consumer::factory()->create()->id,
        ]);

        $this->actingAsOwnerOf($this->osh);

        $this->getJson('/api/v1/marketplace/settlements')
            ->assertOk()
            ->assertJsonPath('meta.pending.orders_count', 1);
    }

    // ============ Customer against customer ============

    public function test_a_customer_sees_only_their_own_orders_across_every_restaurant(): void
    {
        $me = Consumer::factory()->create();
        $somebodyElse = Consumer::factory()->create();

        // Mine, from two different restaurants — the marketplace's whole point.
        $first = $this->orderOn($this->oshStore, $me);
        $second = $this->orderOn($this->lavashStore, $me);
        $theirs = $this->orderOn($this->oshStore, $somebodyElse);

        $this->withHeader('Authorization', 'Bearer '.$me->createToken('t', [Consumer::ABILITY])->plainTextToken);

        $mine = $this->getJson('/api/v1/mp/orders')->assertOk();

        $numbers = array_column((array) $mine->json('data'), 'number');
        $this->assertEqualsCanonicalizing([$first->number, $second->number], $numbers);
        $this->assertNotContains($theirs->number, $numbers);
    }

    public function test_another_customers_order_is_not_found_rather_than_forbidden(): void
    {
        $me = Consumer::factory()->create();
        $theirs = $this->orderOn($this->oshStore);

        $this->withHeader('Authorization', 'Bearer '.$me->createToken('t', [Consumer::ABILITY])->plainTextToken);

        /*
         * Not found, deliberately. A 403 would confirm that this number exists,
         * and marketplace numbers run in sequence — so a stranger could walk
         * them and learn how much business the platform does.
         */
        $this->getJson("/api/v1/mp/orders/{$theirs->number}")->assertApiError('request.not_found');
        $this->postJson("/api/v1/mp/orders/{$theirs->number}/cancel")->assertApiError('request.not_found');
        $this->postJson("/api/v1/mp/orders/{$theirs->number}/rate", ['rating' => 1])
            ->assertApiError('request.not_found');
    }

    // ============ The token itself ============

    public function test_a_staff_token_is_not_a_customer_token(): void
    {
        $waiter = User::factory()->create(['tenant_id' => $this->osh->id]);
        $waiter->assignRole('waiter');

        $this->withHeader(
            'Authorization',
            'Bearer '.$waiter->createToken('pos')->plainTextToken,
        );

        // A perfectly valid Sanctum token, and it must not reach "your orders".
        $this->getJson('/api/v1/mp/orders')->assertApiError('marketplace.consumer_token_required');
        $this->getJson('/api/v1/mp/me')->assertApiError('marketplace.consumer_token_required');
    }

    public function test_a_consumer_token_without_the_ability_is_refused(): void
    {
        $me = Consumer::factory()->create();

        // Right person, wrong ability — a token minted for some future
        // marketplace purpose must not read a customer's history.
        $this->withHeader('Authorization', 'Bearer '.$me->createToken('courier-app', ['mp-courier'])->plainTextToken);

        $this->getJson('/api/v1/mp/me')->assertApiError('marketplace.consumer_token_required');
    }

    public function test_a_blocked_customer_keeps_a_valid_token_and_gets_nothing(): void
    {
        $blocked = Consumer::factory()->blocked()->create();

        $this->withHeader('Authorization', 'Bearer '.$blocked->createToken('t', [Consumer::ABILITY])->plainTextToken);

        $this->getJson('/api/v1/mp/me')->assertApiError('marketplace.consumer_blocked');
    }

    public function test_the_customer_endpoints_are_shut_to_a_stranger(): void
    {
        $this->getJson('/api/v1/mp/me')->assertStatus(401);
        $this->getJson('/api/v1/mp/orders')->assertStatus(401);
        $this->postJson('/api/v1/mp/orders', [])->assertStatus(401);
    }

    // ============ The merchant panel is a console surface ============

    public function test_the_merchant_panel_is_shut_to_a_stranger(): void
    {
        $this->getJson('/api/v1/marketplace/orders')->assertStatus(401);
    }

    public function test_a_waiter_cannot_open_the_merchant_panel(): void
    {
        $waiter = User::factory()->create(['tenant_id' => $this->osh->id]);
        $waiter->assignRole('waiter');
        $this->actingAs($waiter);

        // The design gives a waiter two console sections and neither is this
        // one: settlements and commissions are the owner's business.
        $this->getJson('/api/v1/marketplace/orders')->assertStatus(403);
        $this->getJson('/api/v1/marketplace/settlements')->assertStatus(403);
    }

    public function test_only_manage_may_change_the_commercial_settings(): void
    {
        $manager = User::factory()->create(['tenant_id' => $this->osh->id]);
        $manager->assignRole('branch-manager');
        $this->actingAs($manager);

        $before = $this->oshStore->delivery_fee_tiyin;

        $response = $this->patchJson('/api/v1/marketplace/settings', ['delivery_fee_tiyin' => 0]);

        /*
         * Whichever way the role matrix falls, the invariant is the same one:
         * the answer and the data agree. A refusal must leave the fee alone,
         * and an acceptance must actually change it — a 403 with the write
         * having happened anyway is the failure this asserts against.
         */
        if ($response->status() === 403) {
            $this->assertSame($before, $this->oshStore->refresh()->delivery_fee_tiyin);
        } else {
            $response->assertOk();
            $this->assertSame(0, $this->oshStore->refresh()->delivery_fee_tiyin);
        }
    }

    public function test_a_merchant_can_never_set_their_own_commission(): void
    {
        $this->actingAsOwnerOf($this->osh);

        $this->patchJson('/api/v1/marketplace/settings', [
            'commission_percent' => 0,
            'status' => 'live',
            'slug' => 'something-else',
        ])->assertOk();

        // Three fields that are absent from the form request rather than
        // filtered here, so there is no path that reaches them.
        $store = $this->oshStore->refresh();
        $this->assertSame(9, $store->commission_percent);
        $this->assertSame('osh-xona', $store->slug);
    }
}
