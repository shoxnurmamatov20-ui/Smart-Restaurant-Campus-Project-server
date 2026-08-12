<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Modules\Pos\Models\PosSyncEntry;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Services\PinAuthenticator;
use Tests\TestCase;

/**
 * A shift's worth of selling, over HTTP, the way a till actually does it.
 *
 * The two properties being protected here are the ones a restaurant notices
 * within a day of going live: a bill is never opened twice because the network
 * hiccuped, and the person on the bill is the person who was signed in — not
 * whoever the client claimed.
 */
final class SellFlowTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Terminal $terminal;

    private string $deviceToken;

    private string $sessionToken;

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);

        $this->terminal = Terminal::factory()->create(['code' => 'KASSA-1']);
        $this->deviceToken = $this->terminal->createToken('t', ['pos:terminal'])->plainTextToken;

        $this->cashier = $this->staff('cashier');
        $this->sessionToken = $this->signIn($this->cashier);
    }

    /**
     * Fixtures created after an HTTP call need the tenant put back.
     *
     * `ResolveTenant` clears the context in a `finally` when a request ends —
     * correct in production, where the container dies with the request, and a
     * trap in a feature test, where it does not. Without this a dish is created
     * with a null `tenant_id` and then filtered out of every request that looks
     * for it, which reads as "the menu is empty" rather than as a test bug.
     */
    private function inTenant(): void
    {
        app(TenantContext::class)->set($this->tenant);
    }

    private function staff(string $role, string $pin = '4821'): User
    {
        $this->inTenant();

        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);
        app(PinAuthenticator::class)->setPin($user, $pin);

        return $user;
    }

    private function bearer(string $token): self
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant' => $this->tenant->slug,
        ]);
    }

    private function signIn(User $user, string $pin = '4821'): string
    {
        return $this->bearer($this->deviceToken)
            ->postJson('/api/v1/pos/auth/pin', ['user_id' => $user->id, 'pin' => $pin])
            ->assertCreated()
            ->json('token');
    }

    /** A till request, stamped with a fresh device-side id. */
    private function till(?string $localId = null, ?string $token = null): self
    {
        return $this->bearer($token ?? $this->sessionToken)
            ->withHeaders(['X-Pos-Local-Id' => $localId ?? (string) Str::uuid(), 'X-Pos-Seq' => '1']);
    }

    private function dish(int $price = 4_500_000, string $sku = 'OSH-001'): MenuItem
    {
        $this->inTenant();

        return MenuItem::factory()->create([
            'sku' => $sku, 'price' => $price, 'is_available' => true, 'status' => 'active',
        ]);
    }

    // ============ The happy path ============

    public function test_a_bill_goes_from_open_to_the_kitchen(): void
    {
        $dish = $this->dish();

        $bill = $this->till()->postJson('/api/v1/pos/bills', [
            'channel' => 'dine_in', 'table_id' => 4, 'table_label' => 'A-4', 'guests' => 2,
        ])->assertCreated()->json('data');

        $this->assertSame('draft', $bill['status']);
        // The waiter is the signed-in cashier, taken from the session.
        $this->assertSame($this->cashier->id, $bill['waiter_user_id']);

        $withLine = $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/lines", [
            'menu_item_id' => $dish->id, 'quantity' => 2,
        ])->assertOk()->json('data');

        $this->assertSame(9_000_000, $withLine['total']);
        $this->assertSame('OSH-001', $withLine['lines'][0]['sku']);

        $sent = $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/send")
            ->assertOk()->json('data');

        $this->assertSame('in_kitchen', $sent['status']);
    }

    public function test_the_client_cannot_name_the_waiter(): void
    {
        $other = $this->staff('waiter', '1111');

        $bill = $this->till()->postJson('/api/v1/pos/bills', [
            'channel' => 'dine_in',
            'waiter_user_id' => $other->id,   // ignored on purpose
        ])->assertCreated()->json('data');

        $this->assertSame($this->cashier->id, $bill['waiter_user_id']);
    }

    // ============ Idempotency ============

    public function test_the_same_local_id_opens_only_one_bill(): void
    {
        $localId = (string) Str::uuid();
        $payload = ['channel' => 'dine_in', 'guests' => 2];

        $first = $this->till($localId)->postJson('/api/v1/pos/bills', $payload)->assertCreated();
        $second = $this->till($localId)->postJson('/api/v1/pos/bills', $payload)->assertOk();

        $this->assertFalse($first->json('replayed'));
        $this->assertTrue($second->json('replayed'));
        $this->assertSame($first->json('data.id'), $second->json('data.id'));
        $this->assertSame(1, PosSyncEntry::query()->where('action', 'bill.open')->count());
    }

    public function test_the_replayed_body_is_the_original_body(): void
    {
        $dish = $this->dish();
        $bill = $this->till()->postJson('/api/v1/pos/bills', ['channel' => 'dine_in'])
            ->assertCreated()->json('data');

        $localId = (string) Str::uuid();
        $url = "/api/v1/pos/bills/{$bill['id']}/lines";

        $first = $this->till($localId)->postJson($url, ['menu_item_id' => $dish->id, 'quantity' => 3]);
        $second = $this->till($localId)->postJson($url, ['menu_item_id' => $dish->id, 'quantity' => 3]);

        $this->assertSame($first->json('data'), $second->json('data'));
        // And the guest is charged for three, not six.
        $this->assertSame(13_500_000, $this->till()->getJson("/api/v1/pos/bills/{$bill['id']}")
            ->assertOk()->json('data.total'));
    }

    public function test_two_terminals_may_use_the_same_local_id(): void
    {
        $this->inTenant();
        $second = Terminal::factory()->create(['code' => 'KASSA-2']);
        $secondDevice = $second->createToken('t2', ['pos:terminal'])->plainTextToken;

        $waiter = $this->staff('waiter', '2222');
        $secondSession = $this->bearer($secondDevice)
            ->postJson('/api/v1/pos/auth/pin', ['user_id' => $waiter->id, 'pin' => '2222'])
            ->assertCreated()->json('token');

        $localId = (string) Str::uuid();

        $a = $this->till($localId)->postJson('/api/v1/pos/bills', ['channel' => 'dine_in'])->assertCreated();
        $b = $this->till($localId, $secondSession)->postJson('/api/v1/pos/bills', ['channel' => 'takeaway'])->assertCreated();

        // Uniqueness is per device, because two tills generate uuids
        // independently and a collision must not merge their sales.
        $this->assertNotSame($a->json('data.id'), $b->json('data.id'));
    }

    public function test_a_write_without_a_local_id_is_refused(): void
    {
        $this->bearer($this->sessionToken)
            ->postJson('/api/v1/pos/bills', ['channel' => 'dine_in'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('X-Pos-Local-Id');
    }

    public function test_a_refused_write_leaves_no_claim_behind(): void
    {
        $localId = (string) Str::uuid();

        // No such dish: Orders refuses.
        $bill = $this->till()->postJson('/api/v1/pos/bills', ['channel' => 'dine_in'])
            ->assertCreated()->json('data');

        $this->till($localId)->postJson("/api/v1/pos/bills/{$bill['id']}/lines", [
            'menu_item_id' => 999_999, 'quantity' => 1,
        ])->assertStatus(422);

        $this->assertSame(0, PosSyncEntry::query()->where('local_id', $localId)->count());

        // …so the corrected retry, with the same id, still works.
        $dish = $this->dish();
        $this->till($localId)->postJson("/api/v1/pos/bills/{$bill['id']}/lines", [
            'menu_item_id' => $dish->id, 'quantity' => 1,
        ])->assertOk();
    }

    // ============ Business rules come back as 422, not 500 ============

    public function test_selling_into_a_closed_bill_is_refused_politely(): void
    {
        $dish = $this->dish();
        $bill = $this->till()->postJson('/api/v1/pos/bills', ['channel' => 'dine_in'])
            ->assertCreated()->json('data');
        $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/lines", ['menu_item_id' => $dish->id])->assertOk();

        // Cancelling is `pos.void`, which a cashier does not hold.
        $manager = $this->staff('branch-manager', '9999');
        $managerSession = $this->signIn($manager, '9999');
        $this->till(token: $managerSession)
            ->postJson("/api/v1/pos/bills/{$bill['id']}/cancel", ['reason' => 'Mehmon ketdi'])
            ->assertOk();

        // A closed bill is not a server fault — the till must be told, not made
        // to retry something that will never succeed.
        $this->till(token: $managerSession)
            ->postJson("/api/v1/pos/bills/{$bill['id']}/lines", ['menu_item_id' => $dish->id])
            ->assertStatus(422)
            ->assertJsonPath('code', 'POS_BILL_REFUSED');
    }

    public function test_an_empty_bill_cannot_go_to_the_kitchen(): void
    {
        $bill = $this->till()->postJson('/api/v1/pos/bills', ['channel' => 'dine_in'])
            ->assertCreated()->json('data');

        $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/send")->assertStatus(422);
    }

    public function test_voiding_a_line_requires_a_reason(): void
    {
        $dish = $this->dish();
        $bill = $this->till()->postJson('/api/v1/pos/bills', ['channel' => 'dine_in'])
            ->assertCreated()->json('data');
        $withLine = $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/lines", [
            'menu_item_id' => $dish->id,
        ])->assertOk()->json('data');

        $lineId = $withLine['lines'][0]['id'];

        // No reason at all: rejected before anyone is asked to authorise it.
        $this->till()->deleteJson("/api/v1/pos/bills/{$bill['id']}/lines/{$lineId}")
            ->assertStatus(422)->assertJsonValidationErrors('reason');

        // With a reason, a cashier still cannot void unsupervised — the request
        // goes into the manager's queue instead. TillMoneyTest carries that
        // story through to the signature.
        $this->till()->deleteJson("/api/v1/pos/bills/{$bill['id']}/lines/{$lineId}", [
            'reason' => 'Mehmon fikridan qaytdi',
        ])->assertStatus(403)->assertJsonPath('code', 'POS_APPROVAL_REQUIRED');
    }

    // ============ Splitting and moving ============

    public function test_a_bill_splits_and_the_money_is_conserved(): void
    {
        $osh = $this->dish(4_500_000, 'OSH-001');
        $choy = $this->dish(500_000, 'CHOY-001');

        $bill = $this->till()->postJson('/api/v1/pos/bills', ['channel' => 'dine_in'])
            ->assertCreated()->json('data');
        $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/lines", ['menu_item_id' => $osh->id, 'quantity' => 2])->assertOk();
        $full = $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/lines", ['menu_item_id' => $choy->id, 'quantity' => 4])
            ->assertOk()->json('data');

        $choyLine = collect($full['lines'])->firstWhere('sku', 'CHOY-001');

        $new = $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/split", [
            'line_ids' => [$choyLine['id']],
        ])->assertCreated()->json('data');

        $original = $this->till()->getJson("/api/v1/pos/bills/{$bill['id']}")->assertOk()->json('data');

        $this->assertSame(11_000_000, $new['total'] + $original['total']);
    }

    public function test_a_bill_moves_to_another_table(): void
    {
        $bill = $this->till()->postJson('/api/v1/pos/bills', [
            'channel' => 'dine_in', 'table_id' => 1, 'table_label' => 'A-1',
        ])->assertCreated()->json('data');

        $moved = $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/transfer", [
            'table_id' => 9, 'table_label' => 'C-9',
        ])->assertOk()->json('data');

        $this->assertSame('C-9', $moved['table_label']);
    }

    // ============ Who may sell ============

    public function test_a_chef_cannot_even_sign_in_at_a_till(): void
    {
        // The chef's till power is the stop-list, which lives in Menu. Holding
        // neither `pos.sell` nor `pos.approve`, they are turned away at the PIN
        // screen rather than at the first thing they try to sell.
        $chef = $this->staff('chef', '3333');

        $this->bearer($this->deviceToken)
            ->postJson('/api/v1/pos/auth/pin', ['user_id' => $chef->id, 'pin' => '3333'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('pin');
    }

    public function test_a_waiter_may_sell_but_not_cancel_a_bill(): void
    {
        $waiter = $this->staff('waiter', '4444');
        $waiterSession = $this->signIn($waiter, '4444');

        $bill = $this->till(token: $waiterSession)
            ->postJson('/api/v1/pos/bills', ['channel' => 'dine_in'])
            ->assertCreated()->json('data');

        // Cancelling a bill is `pos.void` — a manager's call, not a waiter's.
        $this->till(token: $waiterSession)
            ->postJson("/api/v1/pos/bills/{$bill['id']}/cancel", ['reason' => 'Mehmon ketdi'])
            ->assertStatus(403);
    }

    public function test_selling_needs_an_open_till_session(): void
    {
        // A device token alone is not a person.
        $this->bearer($this->deviceToken)
            ->withHeader('X-Pos-Local-Id', (string) Str::uuid())
            ->postJson('/api/v1/pos/bills', ['channel' => 'dine_in'])
            ->assertStatus(403)
            ->assertJsonPath('code', 'POS_SESSION_REQUIRED');
    }

    // ============ Tenancy ============

    public function test_a_bill_from_another_restaurant_is_not_readable(): void
    {
        $context = app(TenantContext::class);

        $other = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $context->set($other);
        $theirBill = Order::factory()->create();
        $context->set($this->tenant);

        $this->till()->getJson("/api/v1/pos/bills/{$theirBill->id}")
            ->assertStatus(404)
            ->assertJsonPath('code', 'POS_BILL_NOT_FOUND');
    }
}
