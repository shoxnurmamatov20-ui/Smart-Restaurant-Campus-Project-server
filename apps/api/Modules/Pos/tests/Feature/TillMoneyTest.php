<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Modules\Finance\Models\Expense;
use Modules\Menu\Models\MenuItem;
use Modules\Pos\Models\DrawerMovement;
use Modules\Pos\Models\PosApproval;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Services\PinAuthenticator;
use Tests\TestCase;

/**
 * The money half of a shift: tender, approve, count, close.
 *
 * Three things are being pinned here, and each of them is a real restaurant
 * losing real money when it is wrong:
 *
 *   1. A cashier can ask for a void; only a manager can grant one, and a
 *      signature is spent once, on the thing it was signed for.
 *   2. Change comes out of cash, never out of a card, and lands on a note that
 *      exists.
 *   3. A collection mid-shift does not turn into a shortfall at closing time.
 */
final class TillMoneyTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Terminal $terminal;

    private string $deviceToken;

    private User $cashier;

    private string $cashierSession;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $this->inTenant();

        $this->terminal = Terminal::factory()->create(['code' => 'KASSA-1']);
        $this->deviceToken = $this->terminal->createToken('t', ['pos:terminal'])->plainTextToken;

        $this->cashier = $this->staff('cashier');
        $this->cashierSession = $this->signIn($this->cashier);
    }

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
            ->assertCreated()->json('token');
    }

    private function till(?string $token = null, ?string $localId = null): self
    {
        return $this->bearer($token ?? $this->cashierSession)
            ->withHeaders(['X-Pos-Local-Id' => $localId ?? (string) Str::uuid(), 'X-Pos-Seq' => '1']);
    }

    private function dish(int $price = 4_500_000): MenuItem
    {
        $this->inTenant();

        return MenuItem::factory()->create([
            'sku' => 'OSH-'.Str::upper(Str::random(4)),
            'price' => $price, 'is_available' => true, 'status' => 'active',
        ]);
    }

    /** Open a shift and a bill with one dish on it. Returns [billId, total]. */
    private function billWorth(int $price): array
    {
        $this->till()->postJson('/api/v1/pos/shifts/open', ['opening_cash' => 10_000_000])->assertCreated();

        $dish = $this->dish($price);
        $bill = $this->till()->postJson('/api/v1/pos/bills', ['channel' => 'dine_in'])
            ->assertCreated()->json('data');
        $withLine = $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/lines", [
            'menu_item_id' => $dish->id, 'quantity' => 1,
        ])->assertOk()->json('data');

        return [$withLine['id'], $withLine['total']];
    }

    // ============ Shifts ============

    public function test_opening_a_shift_records_the_float_as_a_drawer_movement(): void
    {
        $this->till()->postJson('/api/v1/pos/shifts/open', ['opening_cash' => 50_000_000])
            ->assertCreated()
            ->assertJsonPath('data.opening_cash', 50_000_000)
            ->assertJsonPath('data.status', 'open');

        $this->assertSame(1, DrawerMovement::query()->where('kind', 'opening_float')->count());
    }

    public function test_selling_without_an_open_shift_is_refused(): void
    {
        [$billId] = [null];
        $dish = $this->dish();

        $bill = $this->till()->postJson('/api/v1/pos/bills', ['channel' => 'dine_in'])
            ->assertCreated()->json('data');
        $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/lines", ['menu_item_id' => $dish->id])->assertOk();

        $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => 4_500_000]],
        ])->assertStatus(422)->assertJsonPath('code', 'POS_NO_OPEN_SHIFT');
    }

    // ============ Tendering ============

    public function test_a_bill_settles_in_cash_and_closes(): void
    {
        [$billId, $total] = $this->billWorth(4_500_000);

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => $total]],
        ])->assertOk()
            ->assertJsonPath('data.settled', true)
            ->assertJsonPath('data.change', 0)
            ->assertJsonPath('data.bill.status', 'paid');
    }

    public function test_cash_and_card_together_settle_one_bill(): void
    {
        [$billId, $total] = $this->billWorth(10_000_000);

        $response = $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [
                ['method' => 'cash', 'amount' => 4_000_000],
                ['method' => 'card', 'amount' => 6_000_000],
            ],
        ])->assertOk();

        $this->assertTrue($response->json('data.settled'));
        $this->assertCount(2, $response->json('data.payment_ids'));
        $this->assertSame($total, $response->json('data.offered'));
    }

    public function test_overpaying_in_cash_returns_change_rounded_to_a_real_note(): void
    {
        [$billId] = $this->billWorth(4_500_050);

        // 50 tiyin of the change cannot be paid — no coin that small exists.
        $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => 5_000_000]],
        ])->assertOk()->assertJsonPath('data.change', 499_900);
    }

    public function test_overpaying_by_card_alone_is_refused(): void
    {
        [$billId] = $this->billWorth(4_500_000);

        // A card terminal is not a cash machine.
        $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'card', 'amount' => 5_000_000]],
        ])->assertStatus(422)->assertJsonPath('code', 'POS_TENDER_REFUSED');
    }

    public function test_underpaying_leaves_the_bill_open(): void
    {
        [$billId] = $this->billWorth(10_000_000);

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => 4_000_000]],
        ])->assertOk()
            ->assertJsonPath('data.settled', false)
            ->assertJsonPath('data.bill.status', 'draft');
    }

    public function test_a_bill_cannot_be_settled_twice(): void
    {
        [$billId, $total] = $this->billWorth(4_500_000);
        $localId = (string) Str::uuid();
        $payload = ['tenders' => [['method' => 'cash', 'amount' => $total]]];

        $first = $this->till(localId: $localId)->postJson("/api/v1/pos/bills/{$billId}/tenders", $payload)->assertOk();
        $second = $this->till(localId: $localId)->postJson("/api/v1/pos/bills/{$billId}/tenders", $payload)->assertOk();

        // The double tap is the same payment, not a second one.
        $this->assertTrue($second->json('replayed'));
        $this->assertSame($first->json('data.payment_ids'), $second->json('data.payment_ids'));
    }

    // ============ Approvals ============

    public function test_a_cashier_cannot_void_a_line_without_a_managers_signature(): void
    {
        [$billId] = $this->billWorth(4_500_000);
        $bill = $this->till()->getJson("/api/v1/pos/bills/{$billId}")->assertOk()->json('data');
        $lineId = $bill['lines'][0]['id'];

        $refusal = $this->till()->deleteJson("/api/v1/pos/bills/{$billId}/lines/{$lineId}", [
            'reason' => 'Mehmon fikridan qaytdi',
        ])->assertStatus(403)->assertJsonPath('code', 'POS_APPROVAL_REQUIRED');

        // The bill is untouched — a refused void must change nothing.
        $this->assertSame(4_500_000, $this->till()->getJson("/api/v1/pos/bills/{$billId}")
            ->assertOk()->json('data.total'));

        $this->assertNotNull($refusal->json('approval_id'));
        $this->assertSame('pending', PosApproval::query()->findOrFail($refusal->json('approval_id'))->status);
    }

    public function test_an_approved_request_lets_the_void_through_once(): void
    {
        [$billId] = $this->billWorth(4_500_000);
        $bill = $this->till()->getJson("/api/v1/pos/bills/{$billId}")->assertOk()->json('data');
        $lineId = $bill['lines'][0]['id'];

        $approvalId = $this->till()->deleteJson("/api/v1/pos/bills/{$billId}/lines/{$lineId}", [
            'reason' => 'Mehmon fikridan qaytdi',
        ])->assertStatus(403)->json('approval_id');

        // The manager walks over and signs it.
        $manager = $this->staff('branch-manager', '9999');
        $managerSession = $this->signIn($manager, '9999');
        $this->till(token: $managerSession)
            ->postJson("/api/v1/pos/approvals/{$approvalId}/decide", ['approved' => true])
            ->assertOk()->assertJsonPath('data.status', 'approved');

        $this->cashierSession = $this->signIn($this->cashier);

        $this->till()->deleteJson("/api/v1/pos/bills/{$billId}/lines/{$lineId}", [
            'reason' => 'Mehmon fikridan qaytdi', 'approval_id' => $approvalId,
        ])->assertOk()->assertJsonPath('data.total', 0);

        // One signature, one act.
        $this->assertSame('used', PosApproval::query()->findOrFail($approvalId)->status);
    }

    public function test_a_signature_cannot_be_spent_twice(): void
    {
        [$billId] = $this->billWorth(4_500_000);
        $bill = $this->till()->getJson("/api/v1/pos/bills/{$billId}")->assertOk()->json('data');
        $lineId = $bill['lines'][0]['id'];

        $approvalId = $this->till()->deleteJson("/api/v1/pos/bills/{$billId}/lines/{$lineId}", [
            'reason' => 'sabab', 'reason2' => null,
        ] + ['reason' => 'Mehmon fikridan qaytdi'])->assertStatus(403)->json('approval_id');

        $manager = $this->staff('branch-manager', '9999');
        $managerSession = $this->signIn($manager, '9999');
        $this->till(token: $managerSession)
            ->postJson("/api/v1/pos/approvals/{$approvalId}/decide", ['approved' => true])->assertOk();

        $this->cashierSession = $this->signIn($this->cashier);
        $this->till()->deleteJson("/api/v1/pos/bills/{$billId}/lines/{$lineId}", [
            'reason' => 'Mehmon fikridan qaytdi', 'approval_id' => $approvalId,
        ])->assertOk();

        $this->till()->deleteJson("/api/v1/pos/bills/{$billId}/lines/{$lineId}", [
            'reason' => 'Yana bir marta', 'approval_id' => $approvalId,
        ])->assertStatus(403)->assertJsonPath('code', 'POS_APPROVAL_INVALID');
    }

    public function test_nobody_signs_off_their_own_request(): void
    {
        $manager = $this->staff('branch-manager', '9999');
        $managerSession = $this->signIn($manager, '9999');

        $approval = $this->till(token: $managerSession)->postJson('/api/v1/pos/approvals', [
            'action' => 'comp', 'reason' => 'Ish beruvchining mehmoni',
        ])->assertCreated()->json('data');

        $this->till(token: $managerSession)
            ->postJson("/api/v1/pos/approvals/{$approval['id']}/decide", ['approved' => true])
            ->assertStatus(403)
            ->assertJsonPath('code', 'POS_APPROVAL_SELF');
    }

    public function test_a_cashier_cannot_decide_anything(): void
    {
        $waiter = $this->staff('waiter', '1111');
        $waiterSession = $this->signIn($waiter, '1111');

        $approval = $this->till(token: $waiterSession)->postJson('/api/v1/pos/approvals', [
            'action' => 'discount', 'reason' => 'Doimiy mijoz', 'amount' => 1_000_000,
        ])->assertCreated()->json('data');

        $this->cashierSession = $this->signIn($this->cashier);
        $this->till()->postJson("/api/v1/pos/approvals/{$approval['id']}/decide", ['approved' => true])
            ->assertStatus(403);
    }

    public function test_a_manager_needs_no_signature_of_their_own(): void
    {
        $manager = $this->staff('branch-manager', '9999');
        $managerSession = $this->signIn($manager, '9999');

        $this->till(token: $managerSession)->postJson('/api/v1/pos/shifts/open', ['opening_cash' => 0])->assertCreated();
        $dish = $this->dish();
        $bill = $this->till(token: $managerSession)->postJson('/api/v1/pos/bills', ['channel' => 'dine_in'])
            ->assertCreated()->json('data');
        $withLine = $this->till(token: $managerSession)
            ->postJson("/api/v1/pos/bills/{$bill['id']}/lines", ['menu_item_id' => $dish->id])
            ->assertOk()->json('data');

        $this->till(token: $managerSession)
            ->deleteJson("/api/v1/pos/bills/{$bill['id']}/lines/{$withLine['lines'][0]['id']}", [
                'reason' => 'Oshxona xatosi',
            ])->assertOk();
    }

    // ============ The drawer and the Z-report ============

    public function test_a_collection_reaches_finance_as_cash_paid_out(): void
    {
        $this->till()->postJson('/api/v1/pos/shifts/open', ['opening_cash' => 10_000_000])->assertCreated();

        $movement = $this->till()->postJson('/api/v1/pos/drawer/movements', [
            'kind' => 'collection', 'amount' => 5_000_000, 'reason' => 'Inkassatsiya #1',
        ])->assertCreated()->json('data');

        $this->assertSame('out', $movement['direction']);
        $this->assertNotNull($movement['finance_expense_id']);
        $this->assertTrue(Expense::query()->findOrFail($movement['finance_expense_id'])->paid_in_cash);
    }

    public function test_a_cash_movement_without_a_reason_is_refused(): void
    {
        $this->till()->postJson('/api/v1/pos/shifts/open')->assertCreated();

        $this->till()->postJson('/api/v1/pos/drawer/movements', [
            'kind' => 'collection', 'amount' => 5_000_000,
        ])->assertStatus(422)->assertJsonValidationErrors('reason');
    }

    public function test_a_waiter_cannot_touch_the_drawer(): void
    {
        $waiter = $this->staff('waiter', '1111');
        $waiterSession = $this->signIn($waiter, '1111');
        $this->till(token: $waiterSession)->postJson('/api/v1/pos/shifts/open')->assertCreated();

        $this->till(token: $waiterSession)->postJson('/api/v1/pos/drawer/movements', [
            'kind' => 'cash_in', 'amount' => 1_000_000, 'reason' => 'Maydalash',
        ])->assertStatus(403);
    }

    public function test_the_z_report_does_not_read_a_collection_as_a_shortfall(): void
    {
        [$billId, $total] = $this->billWorth(100_000_000);

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => $total]],
        ])->assertOk();

        // Float 10 + takings 100 − collection 80 = 30 in the drawer.
        $this->till()->postJson('/api/v1/pos/drawer/movements', [
            'kind' => 'collection', 'amount' => 80_000_000, 'reason' => 'Inkassatsiya',
        ])->assertCreated();

        $this->till()->postJson('/api/v1/pos/shifts/close', ['counted_cash' => 30_000_000])
            ->assertOk()
            ->assertJsonPath('data.expected_cash', 30_000_000)
            ->assertJsonPath('data.difference', 0);
    }

    public function test_the_x_report_shows_the_shift_without_ending_it(): void
    {
        [$billId, $total] = $this->billWorth(20_000_000);
        $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => $total]],
        ])->assertOk();

        $this->till()->getJson('/api/v1/pos/shifts/current')
            ->assertOk()
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.expected_cash', 30_000_000)
            ->assertJsonPath('data.counted_cash', null);
    }

    public function test_the_client_cannot_send_the_expected_cash(): void
    {
        [$billId, $total] = $this->billWorth(20_000_000);
        $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => $total]],
        ])->assertOk();

        // The extra field is simply not read; the server keeps its own answer.
        $this->till()->postJson('/api/v1/pos/shifts/close', [
            'counted_cash' => 1_000_000,
            'expected_cash' => 1_000_000,
        ])->assertOk()
            ->assertJsonPath('data.expected_cash', 30_000_000)
            ->assertJsonPath('data.difference', -29_000_000);
    }

    public function test_closing_the_shift_ends_the_session(): void
    {
        $this->till()->postJson('/api/v1/pos/shifts/open', ['opening_cash' => 0])->assertCreated();
        $this->till()->postJson('/api/v1/pos/shifts/close', ['counted_cash' => 0])->assertOk();

        // 401, not 403: closing the session deletes the token that carried it,
        // so the till is not merely locked out of the shift — it is signed out.
        // Leaving somebody signed in over a counted drawer is how the next sale
        // lands in a closed one.
        $this->till()->getJson('/api/v1/pos/auth/session')->assertStatus(401);
    }
}
