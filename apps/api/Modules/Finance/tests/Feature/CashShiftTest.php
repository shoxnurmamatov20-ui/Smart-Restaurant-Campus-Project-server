<?php

declare(strict_types=1);

namespace Modules\Finance\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;
use Tests\TestCase;

/**
 * The till. The Z-report is the one number a restaurant owner checks every
 * night, so the expected-vs-counted arithmetic is asserted exactly.
 */
final class CashShiftTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsCashier(): User
    {
        $user = User::factory()->create();
        $user->assignRole('cashier');
        $this->actingAs($user);

        return $user;
    }

    // ============ Auth & RBAC ============

    public function test_unauthenticated_user_cannot_open_the_till(): void
    {
        $this->postJson('/api/v1/finance/shifts/open')->assertStatus(401);
    }

    public function test_waiter_cannot_touch_the_till(): void
    {
        $user = User::factory()->create();
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->getJson('/api/v1/finance/payments')->assertStatus(403);
    }

    public function test_accountant_can_read_but_not_delete_expenses(): void
    {
        $user = User::factory()->create();
        $user->assignRole('accountant');
        $this->actingAs($user);
        $expense = Expense::factory()->create();

        $this->getJson('/api/v1/finance/expenses')->assertOk();
        $this->deleteJson("/api/v1/finance/expenses/{$expense->id}")->assertStatus(403);
    }

    // ============ Opening ============

    public function test_cashier_can_open_a_shift_with_a_float(): void
    {
        $this->actingAsCashier();

        $this->postJson('/api/v1/finance/shifts/open', ['opening_cash' => 50000000])
            ->assertCreated()
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.opening_cash', 50000000)
            ->assertJsonPath('data.is_open', true);
    }

    public function test_only_one_shift_may_be_open_at_a_time(): void
    {
        $this->actingAsCashier();

        $this->postJson('/api/v1/finance/shifts/open')->assertCreated();
        $this->postJson('/api/v1/finance/shifts/open')->assertStatus(422);

        $this->assertSame(1, CashShift::open()->count());
    }

    // ============ Payments ============

    public function test_a_payment_must_be_positive(): void
    {
        $this->actingAsCashier();

        $this->postJson('/api/v1/finance/payments', ['method' => 'cash', 'amount' => 0])
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount');
    }

    public function test_an_unknown_payment_method_is_rejected(): void
    {
        $this->actingAsCashier();

        $this->postJson('/api/v1/finance/payments', ['method' => 'bitcoin', 'amount' => 1000])
            ->assertStatus(422)
            ->assertJsonValidationErrors('method');
    }

    public function test_a_refund_keeps_the_row_visible(): void
    {
        $this->actingAsCashier();
        $payment = Payment::factory()->create(['amount' => 8000000]);

        $this->postJson("/api/v1/finance/payments/{$payment->id}/refund", ['reason' => 'Taom sovuq edi'])
            ->assertOk()
            ->assertJsonPath('data.status', 'refunded')
            ->assertJsonPath('data.refund_reason', 'Taom sovuq edi');

        // Never deleted: a refund is an event, not a way to erase a sale.
        $this->assertDatabaseHas('payments', ['id' => $payment->id, 'amount' => 8000000]);
    }

    public function test_a_payment_cannot_be_refunded_twice(): void
    {
        $this->actingAsCashier();
        $payment = Payment::factory()->refunded()->create();

        $this->postJson("/api/v1/finance/payments/{$payment->id}/refund", ['reason' => 'Yana'])
            ->assertStatus(422);
    }

    public function test_a_refund_needs_a_reason(): void
    {
        $this->actingAsCashier();
        $payment = Payment::factory()->create();

        $this->postJson("/api/v1/finance/payments/{$payment->id}/refund", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reason');
    }

    // ============ Z-report ============

    public function test_closing_computes_expected_cash_from_the_drawer_history(): void
    {
        $this->actingAsCashier();

        $shift = CashShift::factory()->create(['opening_cash' => 50000000]);
        Payment::factory()->cash()->create(['cash_shift_id' => $shift->id, 'amount' => 30000000]);
        Payment::factory()->cash()->create(['cash_shift_id' => $shift->id, 'amount' => 20000000]);
        // Card money never enters the drawer.
        Payment::factory()->create(['cash_shift_id' => $shift->id, 'method' => 'card', 'amount' => 90000000]);
        // A cash payout does.
        Expense::factory()->create(['cash_shift_id' => $shift->id, 'amount' => 10000000, 'paid_in_cash' => true]);

        // 500 000 + 300 000 + 200 000 − 100 000 = 900 000 so'm
        $this->postJson("/api/v1/finance/shifts/{$shift->id}/close", ['counted_cash' => 90000000])
            ->assertOk()
            ->assertJsonPath('data.expected_cash', 90000000)
            ->assertJsonPath('data.counted_cash', 90000000)
            ->assertJsonPath('data.difference', 0)
            ->assertJsonPath('data.status', 'closed');
    }

    public function test_a_short_drawer_reports_a_negative_difference(): void
    {
        $this->actingAsCashier();
        $shift = CashShift::factory()->create(['opening_cash' => 10000000]);
        Payment::factory()->cash()->create(['cash_shift_id' => $shift->id, 'amount' => 20000000]);

        // Expected 300 000, counted 295 000 — 5 000 so'm short.
        $this->postJson("/api/v1/finance/shifts/{$shift->id}/close", ['counted_cash' => 29500000])
            ->assertOk()
            ->assertJsonPath('data.expected_cash', 30000000)
            ->assertJsonPath('data.difference', -500000);
    }

    public function test_a_shift_cannot_be_closed_twice(): void
    {
        $this->actingAsCashier();
        $shift = CashShift::factory()->closed()->create();

        $this->postJson("/api/v1/finance/shifts/{$shift->id}/close", ['counted_cash' => 1000])
            ->assertStatus(422);
    }

    // ============ Module info ============

    public function test_module_info_reports_the_day(): void
    {
        $this->actingAsCashier();
        $shift = CashShift::factory()->create(['number' => 'Z-0001']);
        Payment::factory()->create(['cash_shift_id' => $shift->id, 'amount' => 15000000]);
        Expense::factory()->create(['cash_shift_id' => $shift->id, 'amount' => 4000000]);

        $this->getJson('/api/v1/finance/')
            ->assertOk()
            ->assertJsonPath('module', 'Finance')
            ->assertJsonPath('counts.open_shift', 'Z-0001')
            ->assertJsonPath('counts.today_takings_tiyin', 15000000)
            ->assertJsonPath('counts.today_expenses_tiyin', 4000000);
    }

    // ============ Tenant isolation ============

    public function test_one_restaurant_never_sees_another_restaurants_till(): void
    {
        $a = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        Payment::factory()->count(3)->create(['tenant_id' => $a->id]);

        $user = User::factory()->create(['tenant_id' => $a->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/finance/payments')->assertOk()->assertJsonCount(3, 'data');

        // Asking for another restaurant is refused outright: an empty list
        // would read as "no data" and hide the attempt entirely.
        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/finance/payments')
            ->assertStatus(403)
            ->assertJsonPath('code', 'TENANT_MISMATCH');
    }
}
