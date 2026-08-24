<?php

declare(strict_types=1);

namespace Modules\Finance\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Payment;
use Tests\TestCase;

/**
 * The till's tip sheet — GET /api/v1/finance/shifts/{shift}/tips.
 *
 * The screen drew four invented waiters for a year. The figures behind it are
 * a join across a module boundary: the tip is on the payment, the server is on
 * the order, and Finance may not read Orders — so this exercises the whole
 * path, including the `BillRegistry::servedBy()` call that carries the names.
 */
final class TipSheetTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    private CashShift $shift;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);
        $this->branch = Branch::factory()->named('Chilonzor', 'CHZ')->create(['tenant_id' => $this->tenant->id]);

        $cashier = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->shift = CashShift::factory()->create([
            'tenant_id' => $this->tenant->id,
            'status' => 'open',
            'opened_by_user_id' => $cashier->id,
        ]);
        $this->shift->forceFill(['branch_id' => $this->branch->id])->save();
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function signIn(string $role = 'owner'): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);
        $this->actingAs($user);

        return $user;
    }

    /** A paid bill with a waiter on it, and a tender that carried a tip. */
    private function tippedBill(?User $waiter, int $cashTip, int $cardTip, int $guests = 2): int
    {
        $orderId = DB::table('orders.orders')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'number' => 'T-'.str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT),
            'channel' => 'dine_in',
            'status' => 'paid',
            'guests_count' => $guests,
            'waiter_user_id' => $waiter?->id,
            'business_date' => now()->toDateString(),
            'subtotal' => 100_000_00,
            'total' => 100_000_00,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        foreach ([['cash', $cashTip], ['card', $cardTip]] as [$method, $tip]) {
            if ($tip === 0) {
                continue;
            }

            Payment::query()->create([
                'tenant_id' => $this->tenant->id,
                'cash_shift_id' => $this->shift->id,
                'order_id' => $orderId,
                'order_number' => 'T',
                'method' => $method,
                'amount' => 100_000_00,
                'tip' => $tip,
                'status' => 'captured',
                'paid_at' => now(),
            ]);
        }

        return $orderId;
    }

    public function test_it_splits_the_evening_by_waiter_and_by_rail(): void
    {
        $jasur = User::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Jasur Toshev']);
        $nodira = User::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Nodira Saidova']);

        $this->tippedBill($jasur, 20_000_00, 30_000_00, guests: 4);
        $this->tippedBill($jasur, 10_000_00, 0, guests: 2);
        $this->tippedBill($nodira, 0, 15_000_00, guests: 3);

        $this->signIn();

        $answer = $this->getJson("/api/v1/finance/shifts/{$this->shift->id}/tips", ['X-Tenant' => $this->tenant->slug])
            ->assertOk();

        // Biggest earner first — the sheet is read to hand money over.
        $answer->assertJsonPath('data.0.waiter', 'Jasur Toshev')
            ->assertJsonPath('data.0.cash', 30_000_00)
            ->assertJsonPath('data.0.card', 30_000_00)
            ->assertJsonPath('data.0.covers', 6)
            ->assertJsonPath('data.1.waiter', 'Nodira Saidova')
            ->assertJsonPath('data.1.card', 15_000_00);

        // What the till owes out tonight is the card column, not the total.
        $answer->assertJsonPath('meta.totals.card', 45_000_00)
            ->assertJsonPath('meta.totals.cash', 30_000_00)
            ->assertJsonPath('meta.totals.total', 75_000_00);
    }

    public function test_a_bill_with_no_waiter_is_still_money_somebody_holds(): void
    {
        $this->tippedBill(null, 5_000_00, 0);
        $this->signIn();

        $this->getJson("/api/v1/finance/shifts/{$this->shift->id}/tips", ['X-Tenant' => $this->tenant->slug])
            ->assertOk()
            ->assertJsonPath('data.0.waiter', null)
            ->assertJsonPath('data.0.cash', 5_000_00);
    }

    public function test_a_shift_with_no_tips_answers_nothing_rather_than_the_design(): void
    {
        $this->signIn();

        $this->getJson("/api/v1/finance/shifts/{$this->shift->id}/tips", ['X-Tenant' => $this->tenant->slug])
            ->assertOk()
            ->assertJsonPath('data', [])
            ->assertJsonPath('meta.totals.total', 0);
    }

    public function test_a_waiter_may_not_read_the_venues_tip_sheet(): void
    {
        $this->signIn('waiter');

        $this->getJson("/api/v1/finance/shifts/{$this->shift->id}/tips", ['X-Tenant' => $this->tenant->slug])
            ->assertStatus(403);
    }
}
