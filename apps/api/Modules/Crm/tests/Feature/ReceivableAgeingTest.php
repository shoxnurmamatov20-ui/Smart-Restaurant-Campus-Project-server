<?php

declare(strict_types=1);

namespace Modules\Crm\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Modules\Crm\Models\AccountEntry;
use Modules\Crm\Models\Customer;
use Tests\TestCase;

/**
 * How old the money is — the column the books screen's receivables tab is for.
 *
 * A list of debtors with no age is a list nobody can act on, which is why that
 * half of the tab was hidden on a live console rather than drawn: `GET
 * /crm/accounts` answered a balance, and a balance has no date on it.
 *
 * The interesting case is the regular. Somebody who has signed for lunch every
 * week for two years and settles every month is not two years overdue, and an
 * ageing report built from "the oldest charge" says they are.
 */
final class ReceivableAgeingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-08-20 15:00:00'));

        $this->seed(RolesAndPermissionsSeeder::class);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function actingAsOwner(): User
    {
        $user = User::factory()->create();
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    /**
     * A tab, written as the ledger writes it: signed amounts and the balance
     * each line left behind.
     *
     * @param  list<array{0: string, 1: int, 2: string}>  $lines  kind, signed amount, date
     */
    private function ledger(Customer $customer, array $lines): void
    {
        $balance = 0;

        foreach ($lines as [$kind, $amount, $date]) {
            $balance += $amount;

            AccountEntry::query()->create([
                'customer_id' => $customer->getKey(),
                'kind' => $kind,
                'amount' => $amount,
                'balance_after' => $balance,
                'occurred_at' => Carbon::parse($date),
            ]);
        }

        $customer->forceFill(['account_balance' => $balance])->save();
    }

    public function test_the_age_runs_from_the_last_time_the_tab_was_clear(): void
    {
        $this->actingAsOwner();

        $regular = Customer::factory()->create([
            'name' => 'Sardor Aliyev', 'credit_limit' => 50_000_000,
        ]);

        $this->ledger($regular, [
            // Two years of lunches, every one of them paid off.
            ['charge', 4_000_000, '2024-09-01 13:00:00'],
            ['settlement', -4_000_000, '2024-09-30 18:00:00'],
            ['charge', 6_000_000, '2026-07-14 13:00:00'],
            ['settlement', -6_000_000, '2026-07-31 18:00:00'],
            // And this month's, still open.
            ['charge', 3_000_000, '2026-08-11 13:00:00'],
        ]);

        $row = $this->getJson('/api/v1/crm/accounts')->assertOk()->json('data.0');

        $this->assertSame(3_000_000, $row['balance']);
        // Nine days, not two years.
        $this->assertStringStartsWith('2026-08-11', $row['oldest_unsettled_at']);
    }

    public function test_a_part_payment_leaves_the_oldest_open_charge_as_the_age(): void
    {
        $this->actingAsOwner();

        $guest = Customer::factory()->create(['name' => 'Kompaniya A', 'credit_limit' => 90_000_000]);

        $this->ledger($guest, [
            ['charge', 10_000_000, '2026-05-02 13:00:00'],
            ['charge', 5_000_000, '2026-07-20 13:00:00'],
            // Money in, but the tab never reached zero — so the May charge is
            // still the money that is outstanding.
            ['settlement', -6_000_000, '2026-08-01 12:00:00'],
        ]);

        $row = $this->getJson('/api/v1/crm/accounts')->assertOk()->json('data.0');

        $this->assertSame(9_000_000, $row['balance']);
        $this->assertStringStartsWith('2026-05-02', $row['oldest_unsettled_at']);
    }

    public function test_a_guest_holding_a_deposit_has_no_age_at_all(): void
    {
        $this->actingAsOwner();

        $guest = Customer::factory()->create(['name' => 'Oldindan', 'credit_limit' => 10_000_000]);

        $this->ledger($guest, [
            ['charge', 2_000_000, '2026-08-01 13:00:00'],
            ['settlement', -5_000_000, '2026-08-02 12:00:00'],
        ]);

        $row = $this->getJson('/api/v1/crm/accounts')->assertOk()->json('data.0');

        $this->assertSame(-3_000_000, $row['balance']);
        // Not a debtor, so no bucket and no age — putting them in one is how a
        // collections call is made to somebody the restaurant owes money to.
        $this->assertArrayNotHasKey('oldest_unsettled_at', $row);
    }

    public function test_the_single_guest_read_does_not_pay_for_a_column_it_does_not_draw(): void
    {
        $this->actingAsOwner();

        $guest = Customer::factory()->create(['name' => 'Bitta', 'credit_limit' => 10_000_000]);
        $this->ledger($guest, [['charge', 1_000_000, '2026-08-01 13:00:00']]);

        $row = $this->getJson('/api/v1/crm/customers/'.$guest->getKey().'/account')
            ->assertOk()->json('data');

        // Absent rather than null: "we did not ask" and "nothing is owed" are
        // different facts and a screen must not draw either as an age of zero.
        $this->assertArrayNotHasKey('oldest_unsettled_at', $row);
    }

    public function test_a_role_without_crm_view_cannot_read_the_debtors_book(): void
    {
        // A chef, not a waiter: a waiter DOES hold `crm.view` — they look a
        // regular up at the terminal — and asserting against them would be
        // asserting the seeder rather than the guard.
        $user = User::factory()->create();
        $user->assignRole('chef');
        $this->actingAs($user);

        $this->getJson('/api/v1/crm/accounts')->assertForbidden();
    }

    public function test_one_restaurants_debtors_are_not_anothers(): void
    {
        $mine = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $theirs = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        Customer::factory()->create([
            'tenant_id' => $theirs->id, 'name' => 'Begona', 'credit_limit' => 10_000_000,
            'account_balance' => 8_000_000,
        ]);

        $user = User::factory()->create(['tenant_id' => $mine->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/crm/accounts')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }
}
