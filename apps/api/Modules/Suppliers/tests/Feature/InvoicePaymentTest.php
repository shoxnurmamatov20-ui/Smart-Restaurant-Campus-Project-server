<?php

declare(strict_types=1);

namespace Modules\Suppliers\Tests\Feature;

use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Suppliers\Models\PurchaseOrder;
use Modules\Suppliers\Models\Supplier;
use Tests\TestCase;

/**
 * Settling a supplier's invoice.
 *
 * The payables tab drew a "To'landi" button that flashed a message and changed
 * nothing, because `purchase_orders` had no `paid_at`, no `paid_amount` and no
 * payment status — its ladder is delivery rather than money. These tests are
 * about the two writes that make the button real, and about the one that had no
 * way to happen at all before: `suppliers.debt` going DOWN.
 */
final class InvoicePaymentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsOwner(): User
    {
        $user = User::factory()->create();
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    private function invoice(int $total = 40_000_000, int $debt = 40_000_000): PurchaseOrder
    {
        $supplier = Supplier::factory()->create(['payment_terms_days' => 14, 'debt' => $debt]);

        return PurchaseOrder::factory()->create([
            'supplier_id' => $supplier->id,
            'status' => 'received',
            'total' => $total,
        ]);
    }

    public function test_paying_an_invoice_settles_it_and_shrinks_the_supplier_debt(): void
    {
        $this->actingAsOwner();
        $order = $this->invoice();

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/pay")
            ->assertOk()
            ->assertJsonPath('data.paid_amount', 40_000_000)
            ->assertJsonPath('data.outstanding', 0);

        $order->refresh();
        $this->assertNotNull($order->paid_at);

        // The half that had no way to happen: `EloquentReceiving::post()` grew
        // this and nothing anywhere could shrink it, so a payables total only
        // ever went up.
        $this->assertSame(0, $order->supplier?->refresh()->debt);
    }

    public function test_a_part_payment_leaves_the_invoice_on_the_payables_list(): void
    {
        $this->actingAsOwner();
        $order = $this->invoice();

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/pay", ['amount' => 15_000_000])
            ->assertOk()
            ->assertJsonPath('data.paid_amount', 15_000_000)
            ->assertJsonPath('data.outstanding', 25_000_000)
            ->assertJsonPath('data.paid_at', null);

        // Still outstanding — a restaurant short of cash pays half on Friday,
        // and a boolean would have had to call that either paid or unpaid.
        $this->assertSame(1, PurchaseOrder::query()->outstanding()->count());
        $this->assertSame(25_000_000, $order->supplier?->refresh()->debt);

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/pay")
            ->assertOk()
            ->assertJsonPath('data.outstanding', 0);

        $this->assertSame(0, PurchaseOrder::query()->outstanding()->count());
    }

    public function test_a_settled_invoice_cannot_be_paid_a_second_time(): void
    {
        $this->actingAsOwner();
        $order = $this->invoice();

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/pay")->assertOk();

        // The second press. Before the columns existed, the row still read
        // unpaid afterwards and the payment was simply booked twice.
        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/pay")
            ->assertApiError('purchase_order.already_paid');

        $this->assertSame(0, $order->supplier?->refresh()->debt);
    }

    public function test_more_than_is_owed_is_refused_rather_than_clamped(): void
    {
        $this->actingAsOwner();
        $order = $this->invoice();

        // A buyer who typed one digit too many has to see that, not have it
        // silently become the right number.
        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/pay", ['amount' => 400_000_000])
            ->assertApiError('purchase_order.overpaid');

        $this->assertSame(0, $order->refresh()->paid_amount);
    }

    public function test_a_cancelled_order_owes_nothing(): void
    {
        $this->actingAsOwner();
        $order = $this->invoice();
        $order->forceFill(['status' => 'cancelled'])->save();

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/pay")
            ->assertApiError('purchase_order.locked');

        $this->assertSame(0, PurchaseOrder::query()->outstanding()->count());
    }

    public function test_the_storekeeper_who_signed_for_the_delivery_may_not_pay_for_it(): void
    {
        $user = User::factory()->create();
        $user->assignRole('storekeeper');
        $this->actingAs($user);

        $order = $this->invoice();

        // `suppliers.manage`, not `suppliers.update`. Receiving is a
        // storekeeper's act — the van is at the door — and paying is a decision
        // about money leaving the business.
        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/pay")->assertStatus(403);
    }

    public function test_a_supplier_paid_at_the_door_never_goes_into_credit(): void
    {
        $this->actingAsOwner();

        // No terms, so `EloquentReceiving::post()` never grew the debt — and
        // subtracting from it anyway would push the balance negative and make
        // the supplier list read as money they owe us.
        $supplier = Supplier::factory()->create(['payment_terms_days' => 0, 'debt' => 0]);
        $order = PurchaseOrder::factory()->create([
            'supplier_id' => $supplier->id, 'status' => 'received', 'total' => 9_000_000,
        ]);

        $this->postJson("/api/v1/suppliers/purchase-orders/{$order->id}/pay")->assertOk();

        $this->assertSame(0, $supplier->refresh()->debt);
    }
}
