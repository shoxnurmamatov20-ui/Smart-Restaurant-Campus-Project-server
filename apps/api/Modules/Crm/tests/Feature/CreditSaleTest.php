<?php

declare(strict_types=1);

namespace Modules\Crm\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Errors\ApiException;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Modules\Crm\Models\AccountEntry;
use Modules\Crm\Models\Customer;
use Modules\Crm\Services\EloquentGuestAccounts;
use Tests\TestCase;

/**
 * P13 — a regular signs for lunch: "balansiga yozildi · pul kelmadi".
 *
 * The sale happened and no money arrived, and everything below is about the
 * distance between those two facts. A tab is the only place in this platform
 * where revenue and cash come apart on purpose, so the tests that matter are
 * the ones that keep them apart in the right direction: the debt is recorded,
 * the drawer is untouched, and nobody can quietly move either.
 *
 * Charging goes through the service rather than over HTTP, because there is no
 * HTTP door onto it and there must not be — a bill lands on a tab inside the
 * transaction that settles it, at a till, through the contract. What IS exposed
 * is reading a tab, taking money against it, and moving the ceiling.
 */
final class CreditSaleTest extends TestCase
{
    use RefreshDatabase;

    /** 500 000 so'm, in tiyin. A month of lunches for one office regular. */
    private const LIMIT = 50_000_000;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function accounts(): EloquentGuestAccounts
    {
        return app(EloquentGuestAccounts::class);
    }

    private function actingAsRole(string $role): User
    {
        $user = User::factory()->create();
        $user->assignRole($role);
        $this->actingAs($user);

        return $user;
    }

    // ============ Who may touch a tab ============

    public function test_a_tab_is_not_readable_without_signing_in(): void
    {
        // `auth:sanctum` answers before route binding does, so no fixture is
        // needed and none should be: what is being proved is that the door is
        // shut, not what is behind it.
        $this->getJson('/api/v1/crm/accounts')->assertStatus(401);
        $this->getJson('/api/v1/crm/customers/1/account')->assertStatus(401);
    }

    public function test_a_cook_has_no_business_reading_who_owes_the_restaurant_money(): void
    {
        $this->actingAsRole('cook');

        $this->getJson('/api/v1/crm/accounts')->assertStatus(403);
    }

    /**
     * The split the phase is built around.
     *
     * A cashier takes money at eight in the evening, which lowers what the
     * restaurant is owed and therefore needs no manager. Raising the ceiling is
     * the opposite direction and is exactly the thing the guest in front of them
     * is asking for — so it is a different permission, and the person being asked
     * cannot grant it to themselves.
     */
    public function test_a_cashier_may_take_money_against_a_tab_but_may_not_raise_the_ceiling(): void
    {
        $this->actingAsRole('cashier');
        $customer = Customer::factory()->withTab(self::LIMIT, 20_000_000)->create();

        $this->postJson("/api/v1/crm/customers/{$customer->id}/account/settlement", [
            'amount' => 5_000_000,
        ])->assertCreated();

        $this->patchJson("/api/v1/crm/customers/{$customer->id}/credit-limit", [
            'credit_limit' => 100_000_000,
        ])->assertStatus(403);

        $this->assertSame(self::LIMIT, $customer->refresh()->credit_limit);
    }

    public function test_a_manager_may_raise_the_ceiling(): void
    {
        $this->actingAsRole('brand-manager');
        $customer = Customer::factory()->withTab(self::LIMIT)->create();

        $this->patchJson("/api/v1/crm/customers/{$customer->id}/credit-limit", [
            'credit_limit' => 100_000_000,
        ])
            ->assertOk()
            ->assertJsonPath('data.credit_limit', 100_000_000)
            ->assertJsonPath('data.available', 100_000_000);

        $this->assertSame(100_000_000, $customer->refresh()->credit_limit);
    }

    public function test_a_negative_ceiling_is_not_a_number_this_endpoint_accepts(): void
    {
        $this->actingAsRole('owner');
        $customer = Customer::factory()->withTab(self::LIMIT)->create();

        $this->patchJson("/api/v1/crm/customers/{$customer->id}/credit-limit", [
            'credit_limit' => -1,
        ])
            ->assertStatus(422)
            ->assertApiValidationErrors('credit_limit');
    }

    /**
     * Lowering the ceiling under a guest who already owes more is allowed.
     *
     * The alternative is worse than it sounds: a restaurant that cannot stop
     * extending credit to somebody until they have first paid. The debt stays,
     * the headroom goes to zero, and the till simply stops offering the button.
     */
    public function test_the_ceiling_can_be_lowered_below_what_is_already_owed(): void
    {
        $this->actingAsRole('owner');
        $customer = Customer::factory()->withTab(self::LIMIT, 40_000_000)->create();

        $this->patchJson("/api/v1/crm/customers/{$customer->id}/credit-limit", [
            'credit_limit' => 10_000_000,
        ])
            ->assertOk()
            ->assertJsonPath('data.balance', 40_000_000)
            ->assertJsonPath('data.available', 0)
            ->assertJsonPath('data.can_charge', true);
    }

    // ============ Putting a bill on the tab ============

    public function test_a_charge_raises_the_balance_and_leaves_a_line_behind(): void
    {
        $user = $this->actingAsRole('cashier');
        $customer = Customer::factory()->withTab(self::LIMIT)->create();

        $entryId = $this->accounts()->charge(
            customerId: (int) $customer->getKey(),
            amount: 12_000_000,
            orderId: 4001,
            orderNumber: 'A-0041',
            userId: $user->id,
        );

        $this->assertSame(12_000_000, $customer->refresh()->account_balance);
        $this->assertSame(self::LIMIT - 12_000_000, $customer->credit_available);

        $entry = AccountEntry::query()->findOrFail($entryId);
        $this->assertSame('charge', $entry->kind);
        $this->assertSame(12_000_000, $entry->amount);
        // The running total is the column a guest disputing a tab reads, so it
        // has to follow from the line before it rather than be recomputed later.
        $this->assertSame(12_000_000, $entry->balance_after);
    }

    public function test_a_charge_past_the_limit_is_refused_and_says_by_how_much(): void
    {
        $this->actingAsRole('cashier');
        $customer = Customer::factory()->withTab(self::LIMIT, 45_000_000)->create();

        try {
            $this->accounts()->charge(
                customerId: (int) $customer->getKey(),
                amount: 9_000_000,
                orderId: 4002,
            );
            $this->fail('A charge 4 000 000 tiyin past the limit was accepted.');
        } catch (ApiException $e) {
            $this->assertSame('crm.credit_limit_exceeded', $e->error->code);
            // The figures the till needs to raise an approval for the right
            // amount, and to read the refusal out loud to the guest.
            $this->assertSame(5_000_000, $e->meta['available']);
            $this->assertSame(4_000_000, $e->meta['shortfall']);
        }

        $this->assertSame(45_000_000, $customer->refresh()->account_balance);
        $this->assertSame(0, AccountEntry::query()->where('order_id', 4002)->count());
    }

    /**
     * A manager's signature lets it through and is written down.
     *
     * CRM cannot verify the approval — `pos.approvals` is another module — so
     * what this proves is the part CRM is actually responsible for: an
     * over-limit charge never happens silently. The id is on the line, and an
     * auditor can go and ask who gave it.
     */
    public function test_a_signature_lets_an_over_limit_charge_through_and_is_recorded_on_the_line(): void
    {
        $this->actingAsRole('cashier');
        $customer = Customer::factory()->withTab(self::LIMIT, 45_000_000)->create();

        $entryId = $this->accounts()->charge(
            customerId: (int) $customer->getKey(),
            amount: 9_000_000,
            orderId: 4003,
            approvalId: 7,
        );

        $this->assertSame(54_000_000, $customer->refresh()->account_balance);
        $this->assertSame(7, AccountEntry::query()->findOrFail($entryId)->approval_id);
        // Past the ceiling, so there is nothing left to sign for.
        $this->assertSame(0, $customer->credit_available);
    }

    public function test_a_guest_with_no_tab_cannot_sign_for_lunch(): void
    {
        $this->actingAsRole('cashier');
        // The factory default, and the column default: nobody runs a tab until
        // somebody decides they may.
        $customer = Customer::factory()->create();

        try {
            $this->accounts()->charge((int) $customer->getKey(), 1_000_000, orderId: 4004);
            $this->fail('A guest with no credit limit was allowed to sign for a bill.');
        } catch (ApiException $e) {
            $this->assertSame('crm.no_credit_account', $e->error->code);
        }

        $this->assertSame(0, $customer->refresh()->account_balance);
    }

    public function test_an_inactive_guest_cannot_sign_for_lunch(): void
    {
        $this->actingAsRole('cashier');
        $customer = Customer::factory()->withTab(self::LIMIT)->create(['is_active' => false]);

        try {
            $this->accounts()->charge((int) $customer->getKey(), 1_000_000, orderId: 4005);
            $this->fail('An inactive guest was allowed to sign for a bill.');
        } catch (ApiException $e) {
            $this->assertSame('crm.customer_inactive', $e->error->code);
        }
    }

    // ============ The same bill, twice ============

    /**
     * The failure this index exists for is invisible without it.
     *
     * A tablet retries a settlement, the offline queue replays a batch, and the
     * guest silently owes double — with nothing in the ledger looking wrong,
     * because both lines are individually correct.
     */
    public function test_one_bill_cannot_be_charged_to_a_tab_twice(): void
    {
        $this->actingAsRole('cashier');
        $customer = Customer::factory()->withTab(self::LIMIT)->create();

        $first = $this->accounts()->charge((int) $customer->getKey(), 12_000_000, orderId: 4006);
        $second = $this->accounts()->charge((int) $customer->getKey(), 12_000_000, orderId: 4006);

        // A replay is answered with the line that is already there, not refused:
        // the till retrying cannot tell the difference between "lost the reply"
        // and "never sent it", and either way the tab must end up the same.
        $this->assertSame($first, $second);
        $this->assertSame(12_000_000, $customer->refresh()->account_balance);
        $this->assertSame(1, AccountEntry::query()->ofKind('charge')->where('order_id', 4006)->count());
    }

    public function test_the_same_bill_charged_for_a_different_figure_is_refused_rather_than_reconciled(): void
    {
        $this->actingAsRole('cashier');
        $customer = Customer::factory()->withTab(self::LIMIT)->create();

        $this->accounts()->charge((int) $customer->getKey(), 12_000_000, orderId: 4007);

        try {
            $this->accounts()->charge((int) $customer->getKey(), 15_000_000, orderId: 4007);
            $this->fail('The same bill was charged twice for two different amounts.');
        } catch (ApiException $e) {
            $this->assertSame('crm.charge_conflict', $e->error->code);
            $this->assertSame(12_000_000, $e->meta['charged']);
            $this->assertSame(15_000_000, $e->meta['requested']);
        }

        $this->assertSame(12_000_000, $customer->refresh()->account_balance);
    }

    /**
     * And the index is what makes the application's check true.
     *
     * The service looks before it writes; two workers racing both look at the
     * same moment and both find nothing. Postgres is the half that cannot be
     * raced, so it is worth proving it is actually on the table rather than
     * trusting the migration ran.
     */
    public function test_postgres_itself_refuses_a_second_charge_for_the_same_bill(): void
    {
        $this->actingAsRole('cashier');
        $customer = Customer::factory()->withTab(self::LIMIT)->create();

        $line = [
            'customer_id' => $customer->getKey(),
            'kind' => 'charge',
            'amount' => 5_000_000,
            'balance_after' => 5_000_000,
            'order_id' => 4008,
            'occurred_at' => now(),
        ];

        AccountEntry::query()->create($line);

        // Inside its own transaction so the failed statement aborts a savepoint
        // rather than the whole test's transaction — otherwise nothing after it
        // can be asserted, and "did anything land" is the question that matters.
        try {
            DB::transaction(fn () => AccountEntry::query()->create($line));
            $this->fail('Postgres accepted a second charge for the same bill.');
        } catch (QueryException $refusal) {
            $this->assertStringContainsString('account_entries_one_charge_per_bill', $refusal->getMessage());
        }

        $this->assertSame(1, AccountEntry::query()->where('order_id', 4008)->count());
    }

    /**
     * A charge typed in by hand has no bill to deduplicate against.
     *
     * The index is partial for this reason: constraining `(tenant_id, order_id)`
     * across every charge would have refused the restaurant's SECOND manual
     * opening balance ever, for any guest.
     */
    public function test_two_charges_with_no_bill_behind_them_are_both_allowed(): void
    {
        $this->actingAsRole('owner');
        $customer = Customer::factory()->withTab(self::LIMIT)->create();

        // No `order_id`: a manager typing what the notebook by the till said.
        // There is no key to deduplicate these against, and a unique index over
        // every charge would have refused the restaurant's second one ever.
        $this->accounts()->charge((int) $customer->getKey(), 3_000_000, note: 'Daftardan ko\'chirildi');
        $this->accounts()->charge((int) $customer->getKey(), 2_000_000, note: 'Daftardan ko\'chirildi');

        $this->assertSame(5_000_000, $customer->refresh()->account_balance);
        $this->assertSame(2, AccountEntry::query()->ofKind('charge')->whereNull('order_id')->count());
    }

    // ============ Taking money against it ============

    public function test_a_settlement_lowers_the_balance_and_returns_the_line(): void
    {
        $this->actingAsRole('cashier');
        $customer = Customer::factory()->withTab(self::LIMIT, 34_000_000)->create();

        $this->postJson("/api/v1/crm/customers/{$customer->id}/account/settlement", [
            'amount' => 20_000_000,
            'payment_id' => 991,
            'note' => 'Naqd, kassada',
        ])
            ->assertCreated()
            ->assertJsonPath('entry.kind', 'settlement')
            // Stored signed, and negative is what "took money off the tab" means.
            ->assertJsonPath('entry.amount', -20_000_000)
            ->assertJsonPath('entry.balance_after', 14_000_000)
            ->assertJsonPath('entry.payment_id', 991)
            ->assertJsonPath('account.balance', 14_000_000)
            ->assertJsonPath('account.available', self::LIMIT - 14_000_000);

        $this->assertSame(14_000_000, $customer->refresh()->account_balance);
    }

    /**
     * The typo that turns 500 000 into 5 000 000 does not look like anything.
     *
     * The tab goes to zero, the guest walks out, and the restaurant now owes
     * them four and a half million with nothing saying it meant to.
     */
    public function test_a_settlement_cannot_take_the_balance_below_zero(): void
    {
        $this->actingAsRole('cashier');
        $customer = Customer::factory()->withTab(self::LIMIT, 34_000_000)->create();

        $this->postJson("/api/v1/crm/customers/{$customer->id}/account/settlement", [
            'amount' => 50_000_000,
        ])->assertApiError('crm.settlement_exceeds_balance', 'amount');

        $this->assertSame(34_000_000, $customer->refresh()->account_balance);
        $this->assertSame(0, AccountEntry::query()->ofKind('settlement')->count());
    }

    public function test_money_cannot_be_taken_against_a_tab_that_owes_nothing(): void
    {
        $this->actingAsRole('cashier');
        $customer = Customer::factory()->withTab(self::LIMIT)->create();

        $this->postJson("/api/v1/crm/customers/{$customer->id}/account/settlement", [
            'amount' => 1_000_000,
        ])->assertApiError('crm.settlement_exceeds_balance', 'amount');

        $this->assertSame(0, $customer->refresh()->account_balance);
    }

    public function test_a_settlement_of_nothing_is_not_a_settlement(): void
    {
        $this->actingAsRole('cashier');
        $customer = Customer::factory()->withTab(self::LIMIT, 10_000_000)->create();

        $this->postJson("/api/v1/crm/customers/{$customer->id}/account/settlement", ['amount' => 0])
            ->assertStatus(422)
            ->assertApiValidationErrors('amount');
    }

    /**
     * A deposit is still expressible, and only by saying so.
     *
     * The negative balance is real money the restaurant is holding for a guest,
     * and clamping it at zero would make it disappear from the one page that
     * records it. What the HTTP door refuses is creating one by accident.
     */
    public function test_a_deposit_is_allowed_when_the_caller_says_it_is_one(): void
    {
        $this->actingAsRole('owner');
        $customer = Customer::factory()->withTab(self::LIMIT, 34_000_000)->create();

        $this->accounts()->settle(
            customerId: (int) $customer->getKey(),
            amount: 50_000_000,
            note: 'Oldindan to\'lov',
            acceptDeposit: true,
        );

        $this->assertSame(-16_000_000, $customer->refresh()->account_balance);
        // Holding their money does not mean they may sign for less: the headroom
        // is the limit plus what we owe them.
        $this->assertSame(self::LIMIT + 16_000_000, $customer->credit_available);
    }

    // ============ "balansiga yozildi · pul kelmadi" ============

    /**
     * The rule the whole phase exists for.
     *
     * A credit sale is revenue and is NOT a drawer movement. Nothing in this
     * module writes a payment, so a tab charge cannot reach the expected-cash
     * figure — `CashShift::expectedCashTerms()` counts only `method = 'cash'`,
     * and there is no payment row here at all to be counted by anything.
     *
     * Asserted against the payments table rather than against a shift, because
     * this is a CRM test and the point is that CRM never touches Finance: if
     * this module ever grew a line that captured a payment, this count would
     * stop being zero long before anyone noticed a drawer that would not close.
     */
    public function test_a_credit_sale_moves_no_cash_at_all(): void
    {
        $this->actingAsRole('cashier');
        $customer = Customer::factory()->withTab(self::LIMIT)->create();

        $this->accounts()->charge(
            customerId: (int) $customer->getKey(),
            amount: 12_000_000,
            orderId: 4009,
            orderNumber: 'A-0049',
        );

        $this->assertSame(12_000_000, $customer->refresh()->account_balance);
        $this->assertDatabaseCount('finance.payments', 0);
        $this->assertDatabaseCount('finance.cash_movements', 0);
        $this->assertDatabaseCount('finance.expenses', 0);
    }

    // ============ Reading a tab ============

    public function test_a_tab_reports_the_two_numbers_and_the_working_behind_them(): void
    {
        $this->actingAsRole('owner');
        $customer = Customer::factory()->withTab(self::LIMIT)->create();

        $this->accounts()->charge((int) $customer->getKey(), 12_000_000, orderId: 4010, orderNumber: 'A-0050');
        $this->accounts()->charge((int) $customer->getKey(), 8_000_000, orderId: 4011, orderNumber: 'A-0051');
        $this->accounts()->settle((int) $customer->getKey(), 5_000_000);

        $this->getJson("/api/v1/crm/customers/{$customer->id}/account")
            ->assertOk()
            ->assertJsonPath('data.balance', 15_000_000)
            ->assertJsonPath('data.credit_limit', self::LIMIT)
            ->assertJsonPath('data.available', 35_000_000)
            ->assertJsonPath('data.runs_a_tab', true)
            ->assertJsonCount(3, 'data.entries')
            // Newest first: a statement is read from the top, and the top is the
            // line the guest is arguing about.
            ->assertJsonPath('data.entries.0.kind', 'settlement')
            ->assertJsonPath('data.entries.0.balance_after', 15_000_000)
            ->assertJsonPath('data.entries.2.order_number', 'A-0050');
    }

    public function test_a_statement_can_be_asked_for_fewer_lines(): void
    {
        $this->actingAsRole('owner');
        $customer = Customer::factory()->withTab(self::LIMIT)->create();

        foreach ([4012, 4013, 4014] as $orderId) {
            $this->accounts()->charge((int) $customer->getKey(), 1_000_000, orderId: $orderId);
        }

        $this->getJson("/api/v1/crm/customers/{$customer->id}/account?entries=2")
            ->assertOk()
            ->assertJsonCount(2, 'data.entries')
            ->assertJsonPath('data.balance', 3_000_000);
    }

    /**
     * The accountant's screen, and the reason the parallel spreadsheet stops.
     *
     * Guests with neither a tab nor a balance are not on it: a restaurant with
     * forty thousand customers and three credit accounts opens this page and
     * sees three rows.
     */
    public function test_the_debtors_list_shows_who_owes_what_and_totals_the_book(): void
    {
        $this->actingAsRole('owner');

        Customer::factory()->withTab(self::LIMIT, 34_000_000)->create(['name' => 'Anvar']);
        Customer::factory()->withTab(self::LIMIT, 12_000_000)->create(['name' => 'Dilnoza']);
        Customer::factory()->withTab(self::LIMIT, 0)->create(['name' => 'Sardor']);
        Customer::factory()->count(4)->create();

        $this->getJson('/api/v1/crm/accounts')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            // Biggest debt first — the row somebody is going to act on.
            ->assertJsonPath('data.0.name', 'Anvar')
            ->assertJsonPath('data.0.balance', 34_000_000)
            ->assertJsonPath('meta.outstanding_total', 46_000_000);
    }

    public function test_the_debtors_list_can_be_narrowed_to_people_who_actually_owe(): void
    {
        $this->actingAsRole('owner');

        Customer::factory()->withTab(self::LIMIT, 34_000_000)->create();
        Customer::factory()->withTab(self::LIMIT, 0)->create();
        // Holding a guest's deposit is not a debt, and calling it one is how a
        // collections call gets made to somebody the restaurant owes.
        Customer::factory()->withTab(self::LIMIT, -5_000_000)->create();

        $this->getJson('/api/v1/crm/accounts?filter[in_debt]=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.outstanding_total', 34_000_000);
    }

    public function test_the_debtors_list_can_be_narrowed_to_people_past_their_ceiling(): void
    {
        $this->actingAsRole('owner');

        $over = Customer::factory()->withTab(10_000_000, 14_000_000)->create();
        Customer::factory()->withTab(self::LIMIT, 14_000_000)->create();

        $this->getJson('/api/v1/crm/accounts?filter[over_limit]=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.customer_id', $over->id)
            ->assertJsonPath('data.0.available', 0);
    }

    public function test_the_module_card_carries_what_the_restaurant_is_owed(): void
    {
        $this->actingAsRole('owner');

        Customer::factory()->withTab(self::LIMIT, 34_000_000)->create();
        Customer::factory()->withTab(self::LIMIT, 12_000_000)->create();

        $this->getJson('/api/v1/crm/')
            ->assertOk()
            ->assertJsonPath('counts.accounts_in_debt', 2)
            ->assertJsonPath('outstanding_total', 46_000_000);
    }

    // ============ One restaurant's debts are its own ============

    public function test_one_restaurant_never_sees_another_restaurants_tabs(): void
    {
        $a = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $b = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        Customer::factory()->withTab(self::LIMIT, 34_000_000)->create(['tenant_id' => $a->id]);
        $theirs = Customer::factory()->withTab(self::LIMIT, 90_000_000)->create(['tenant_id' => $b->id]);

        $user = User::factory()->create(['tenant_id' => $a->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        // Our own book: one debtor, and a total that is ours alone. The other
        // restaurant's 900 000 so'm must not be in it — an owner reading a
        // combined figure would think the platform had lost track of their money.
        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/crm/accounts')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.outstanding_total', 34_000_000);

        // And their guest is not merely absent from a list — the tab itself is
        // unreachable by id.
        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson("/api/v1/crm/customers/{$theirs->id}/account")
            ->assertStatus(404);
    }

    public function test_money_cannot_be_taken_against_another_restaurants_tab(): void
    {
        $a = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $b = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $theirs = Customer::factory()->withTab(self::LIMIT, 34_000_000)->create(['tenant_id' => $b->id]);

        $user = User::factory()->create(['tenant_id' => $a->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->postJson("/api/v1/crm/customers/{$theirs->id}/account/settlement", ['amount' => 1_000_000])
            ->assertStatus(404);

        $this->assertSame(34_000_000, $theirs->refresh()->account_balance);
    }
}
