<?php

declare(strict_types=1);

namespace Modules\Orders\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Modules\Pos\Models\PosApproval;
use Tests\TestCase;

/**
 * Discounting and moving a bill from the back office.
 *
 * The console's order drawer drew four buttons and two of them flashed a toast,
 * because `/pos/bills/*` sits behind a PIN session that refuses a console token
 * on purpose. The answer was an Orders-side endpoint rather than a proxy — and
 * the thing that makes it safe is that P9's rule follows it across: **the person
 * who asks is never the person who agrees**, whichever screen they are on.
 *
 * So the two tests that matter here are the operator ones. An order operator
 * holds `orders.manage` and not `pos.approve`, which is exactly the shape of
 * caller a back door would otherwise hand a discount button to.
 */
final class ConsoleBillActionTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = $this->restaurant('osh-xona');
        app(TenantContext::class)->set($this->tenant);

        $this->branch = Branch::factory()->create(['tenant_id' => $this->tenant->id]);
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function restaurant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug), 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    private function signIn(string $role, ?Tenant $of = null): User
    {
        $user = User::factory()->create(['tenant_id' => ($of ?? $this->tenant)->id]);
        $user->assignRole($role);
        $this->actingAs($user);

        return $user;
    }

    /** An open bill with one 100 000 so'm dish on it. */
    private function bill(): Order
    {
        $order = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'channel' => 'takeaway',
            'status' => 'placed',
        ]);

        $dish = MenuItem::factory()->create([
            'tenant_id' => $this->tenant->id,
            'sku' => 'OSH-001', 'price' => 100_000_00, 'is_available' => true, 'status' => 'active',
        ]);

        $order->items()->create([
            'tenant_id' => $this->tenant->id,
            'menu_item_id' => $dish->id,
            'sku' => $dish->sku,
            'title' => 'Osh',
            'station' => 'hot',
            'quantity' => 1,
            'unit_price' => 100_000_00,
            'total_price' => 100_000_00,
        ]);

        return $order->recalculateTotals()->refresh();
    }

    // ============ Discount ============

    public function test_a_manager_can_take_money_off_a_bill_from_the_back_office(): void
    {
        $order = $this->bill();
        $this->signIn('branch-manager');

        $answer = $this->postJson("/api/v1/orders/orders/{$order->getKey()}/discount", [
            'amount' => 10_000_00,
            'reason' => 'Kechikkani uchun uzr',
        ])->assertOk();

        $this->assertSame(10_000_00, $answer->json('data.discount_total'));
        $this->assertSame(90_000_00, $answer->json('data.total'));
    }

    public function test_a_percentage_becomes_the_same_money_the_till_would_have_worked_out(): void
    {
        $order = $this->bill();
        $this->signIn('branch-manager');

        $answer = $this->postJson("/api/v1/orders/orders/{$order->getKey()}/discount", [
            'percent' => 10,
            'reason' => 'Doimiy mijoz',
        ])->assertOk();

        // 10% of the SUBTOTAL, floored — `BillTotals::discountForPercent()`,
        // which is the one rule both the till and this endpoint read.
        $this->assertSame(10_000_00, $answer->json('data.discount_total'));
    }

    public function test_a_discount_with_no_reason_is_refused(): void
    {
        $order = $this->bill();
        $this->signIn('branch-manager');

        $this->postJson("/api/v1/orders/orders/{$order->getKey()}/discount", [
            'amount' => 5_000_00,
        ])->assertStatus(422);
    }

    public function test_an_operator_is_sent_to_a_manager_rather_than_given_the_button(): void
    {
        $order = $this->bill();
        $operator = $this->signIn('order-operator');

        $refusal = $this->postJson("/api/v1/orders/orders/{$order->getKey()}/discount", [
            'amount' => 20_000_00,
            'reason' => 'Mijoz norozi',
        ])->assertStatus(403);

        $this->assertSame('order.approval_required', $refusal->json('error.code'));

        // The id matters as much as the refusal: without it the console knows
        // only that somebody must sign something.
        $approvalId = $refusal->json('error.approval_id');
        $this->assertIsInt($approvalId);

        $raised = PosApproval::query()->findOrFail($approvalId);
        $this->assertSame('discount', $raised->action);
        $this->assertSame(20_000_00, (int) $raised->amount);
        $this->assertSame($operator->getKey(), (int) $raised->requested_by_user_id);
        // Nobody was at a till, and the row says so rather than inventing one.
        $this->assertNull($raised->terminal_id);

        // And nothing moved.
        $this->assertSame(0, (int) $order->refresh()->discount_total);
    }

    public function test_a_signed_request_goes_through_and_the_signature_is_spent(): void
    {
        $order = $this->bill();
        $operator = $this->signIn('order-operator');

        $refusal = $this->postJson("/api/v1/orders/orders/{$order->getKey()}/discount", [
            'amount' => 20_000_00,
            'reason' => 'Mijoz norozi',
        ])->assertStatus(403);

        $approvalId = (int) $refusal->json('error.approval_id');

        // A manager answers from wherever they are — the queue is reachable with
        // an ordinary user token and no terminal, which is P9's whole point.
        $this->signIn('branch-manager');
        $this->postJson("/api/v1/pos/approvals/{$approvalId}/decide", ['approved' => true])->assertOk();

        // Back as the operator, sending the same request with the signature.
        $this->actingAs($operator);

        $this->postJson("/api/v1/orders/orders/{$order->getKey()}/discount", [
            'amount' => 20_000_00,
            'reason' => 'Mijoz norozi',
            'approval_id' => $approvalId,
        ])->assertOk();

        $this->assertSame(20_000_00, (int) $order->refresh()->discount_total);
        $this->assertSame('used', PosApproval::query()->findOrFail($approvalId)->status);
    }

    // ============ Transfer ============

    public function test_a_manager_can_move_a_bill_to_another_table(): void
    {
        $order = $this->bill();
        $waiter = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->signIn('branch-manager');

        $answer = $this->postJson("/api/v1/orders/orders/{$order->getKey()}/transfer", [
            'table_id' => 12,
            'table_label' => 'B-12',
            'waiter_user_id' => $waiter->getKey(),
        ])->assertOk();

        $this->assertSame(12, $answer->json('data.table.id'));
        $this->assertSame('B-12', $answer->json('data.table.label'));
        $this->assertSame($waiter->getKey(), $answer->json('data.waiter_user_id'));
    }

    public function test_a_transfer_that_moves_nothing_is_refused(): void
    {
        $order = $this->bill();
        $this->signIn('branch-manager');

        // A write with no content: answering it 200 would tell the console
        // something happened.
        $this->postJson("/api/v1/orders/orders/{$order->getKey()}/transfer", [])->assertStatus(422);
    }

    public function test_a_closed_bill_refuses_both(): void
    {
        $order = $this->bill();
        $order->forceFill(['status' => 'paid', 'closed_at' => now()])->save();

        $this->signIn('branch-manager');

        $this->postJson("/api/v1/orders/orders/{$order->getKey()}/discount", [
            'amount' => 1000, 'reason' => 'Kech',
        ])->assertApiError('order.refused');
    }

    // ============ Who may reach it ============

    public function test_a_waiter_cannot_reach_the_back_office_door_at_all(): void
    {
        $order = $this->bill();
        $this->signIn('waiter');

        // A waiter discounts at the till, where their PIN and their terminal
        // are on the row. `orders.manage` is what says so.
        $this->postJson("/api/v1/orders/orders/{$order->getKey()}/discount", [
            'amount' => 1000, 'reason' => 'Kech',
        ])->assertForbidden();

        $this->postJson("/api/v1/orders/orders/{$order->getKey()}/transfer", [
            'table_id' => 3,
        ])->assertForbidden();
    }

    public function test_another_restaurants_bill_is_simply_not_found(): void
    {
        $other = $this->restaurant('lagmon-uyi');
        $theirs = Order::factory()->create(['tenant_id' => $other->id, 'status' => 'placed']);

        app(TenantContext::class)->set($this->tenant);
        $this->signIn('branch-manager');

        $this->postJson("/api/v1/orders/orders/{$theirs->getKey()}/discount", [
            'amount' => 1000, 'reason' => 'Kech',
        ])->assertNotFound();
    }
}
