<?php

declare(strict_types=1);

namespace Modules\Finance\Tests\Feature;

use App\Contracts\Finance\Tender;
use App\Contracts\Finance\TillLedger;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Modules\Finance\Models\ExpenseCategory;
use Modules\Finance\Models\Payment;
use Modules\Finance\Models\PaymentMethod;
use Tests\TestCase;

/**
 * The two configuration screens that had nothing behind them.
 *
 * Both had inert controls for the same reason — no table — and both are fixed
 * the same way: the platform's own defaults are synthesised into the list, and
 * the first write materialises a row. The tests below are mostly about that
 * seam, because it is where a subtle version of the bug survives: a screen that
 * shows a default and then cannot edit it is no better than an empty list.
 */
final class LedgerConfigurationTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The clock, pinned.
     *
     * Every figure in this file is about a MONTH — which month is closed, which
     * is still running, which day falls inside one — and "now" decides all of
     * them. Left to the wall clock, this suite passes all day and fails between
     * midnight and 06:00, because the venue's trading day has not turned over
     * yet and `Carbon::now()->subMonth()` and `BusinessDay::dateFor()` stop
     * agreeing about which month it is. A test that only fails at four in the
     * morning is a test nobody trusts.
     *
     * Mid-month and mid-afternoon, so neither the month boundary nor the
     * trading-day boundary is anywhere near it.
     */
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
     * One row out of a decoded `data` array, by a field it carries.
     *
     * A loop rather than `collect(...)->firstWhere(...)`, because `json()` hands
     * back `mixed` and the collection helper cannot be told what is in it. It
     * also fails loudly: a missing row would otherwise reach an assertion as
     * `null` and report a type error instead of "there is no cash row".
     *
     * @return array<string, mixed>
     */
    private function rowFor(mixed $rows, string $field, string $value): array
    {
        foreach (is_array($rows) ? $rows : [] as $row) {
            if (is_array($row) && ($row[$field] ?? null) === $value) {
                return $row;
            }
        }

        self::fail("No row with {$field} = {$value}");
    }

    // ============ Payment methods ============

    public function test_a_restaurant_with_no_rows_still_sees_every_tender(): void
    {
        $this->actingAsOwner();

        $rows = $this->getJson('/api/v1/finance/payment-methods')->assertOk()->json('data');

        // Eleven tenders, every one of them unconfigured — which is what stops a
        // manager adding `cash` a second time because the panel looked empty.
        $this->assertCount(11, $rows);
        $this->assertNull($rows[0]['id']);
        $this->assertSame('cash', $rows[0]['method']);

        // The platform default reaches the screen rather than a dash: 1.2% on
        // Uzcard is being charged whether or not anybody configured it.
        $uzcard = $this->rowFor($rows, 'method', 'uzcard');
        $this->assertNull($uzcard['fee_bps']);
        $this->assertSame(120, $uzcard['effective_fee_bps']);
    }

    public function test_editing_an_unconfigured_tender_creates_its_row(): void
    {
        $this->actingAsOwner();

        $this->patchJson('/api/v1/finance/payment-methods/uzcard', ['fee_bps' => 95])
            ->assertOk()
            ->assertJsonPath('data.fee_bps', 95)
            ->assertJsonPath('data.effective_fee_bps', 95);

        $this->assertSame(1, PaymentMethod::query()->where('method', 'uzcard')->count());

        // And a second edit updates that row rather than making another.
        $this->patchJson('/api/v1/finance/payment-methods/uzcard', ['is_enabled' => false])->assertOk();
        $this->assertSame(1, PaymentMethod::query()->where('method', 'uzcard')->count());
    }

    public function test_a_tender_the_till_cannot_take_money_through_is_refused(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/v1/finance/payment-methods', [
            'method' => 'bitcoin',
            'name' => ['uz' => 'Bitcoin'],
            'kind' => 'online',
        ])->assertApiValidationErrors('method');

        $this->patchJson('/api/v1/finance/payment-methods/bitcoin', ['fee_bps' => 10])
            ->assertStatus(422)
            ->assertApiError('finance.unknown_payment_method');
    }

    public function test_a_configured_rate_beats_the_platform_default_in_the_ledger(): void
    {
        $user = $this->actingAsOwner();

        $this->patchJson('/api/v1/finance/payment-methods/visa', ['fee_bps' => 300])->assertOk();

        /*
         * Asserted through the contract the till actually uses, not through the
         * settings screen that set it. A rate a panel shows and a payment row
         * does not carry is exactly the drift this table exists to end — and the
         * snapshot lands on the row, so a rate renegotiated in March does not
         * restate February.
         */
        $ledger = app(TillLedger::class);
        $shift = $ledger->openShift($user->id, 0);

        $paymentId = $ledger->capture($shift, 1, 'T-1', new Tender('visa', 10_000_000));
        $payment = Payment::query()->findOrFail($paymentId);

        $this->assertSame(300, $payment->fee_bps);
        // 3% of 100 000 so'm, not the platform's 2.4%.
        $this->assertSame(300_000, $payment->fee_amount);
    }

    public function test_a_disabled_tender_leaves_the_tills_list_and_is_still_settled(): void
    {
        $user = $this->actingAsOwner();

        $this->patchJson('/api/v1/finance/payment-methods/cash', ['is_enabled' => true])->assertOk();
        $this->patchJson('/api/v1/finance/payment-methods/uzcard', ['is_enabled' => false])->assertOk();

        $ledger = app(TillLedger::class);

        // Only what was configured and enabled — `uzcard` is gone from the sheet.
        $this->assertSame(['cash'], $ledger->methods());

        /*
         * And an offline sale taken through it on Friday still lands on Monday.
         * Refusing it would lose money that has already left a guest's card in
         * order to enforce a preference about which buttons are drawn.
         */
        $shift = $ledger->openShift($user->id, 0);
        $paymentId = $ledger->capture($shift, 2, 'T-2', new Tender('uzcard', 5_000_000));

        $this->assertSame('uzcard', Payment::query()->findOrFail($paymentId)->method);
    }

    public function test_a_cashier_may_read_the_tenders_and_never_change_one(): void
    {
        $user = User::factory()->create();
        $user->assignRole('cashier');
        $this->actingAs($user);

        $this->getJson('/api/v1/finance/payment-methods')->assertOk();
        $this->patchJson('/api/v1/finance/payment-methods/cash', ['fee_bps' => 0])->assertStatus(403);
    }

    // ============ Expense categories ============

    public function test_the_eight_built_in_headings_are_listed_without_rows(): void
    {
        $this->actingAsOwner();

        $rows = $this->getJson('/api/v1/finance/expense-categories')->assertOk()->json('data');

        $this->assertCount(8, $rows);
        $this->assertSame('rent', $rows[0]['code']);
        $this->assertTrue($rows[0]['is_system']);
        $this->assertNull($rows[0]['id']);
    }

    public function test_a_ninth_heading_can_be_added_and_used(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/v1/finance/expense-categories', [
            'code' => 'licence',
            'name' => ['uz' => 'Litsenziya', 'ru' => 'Лицензия', 'en' => 'Licence'],
        ])->assertCreated()->assertJsonPath('data.is_system', false);

        // The whole point: an expense may now be filed under it. Before the
        // table, `Rule::in(Expense::CATEGORIES)` made this a 422.
        $this->postJson('/api/v1/finance/expenses', [
            'category' => 'licence',
            'description' => 'Musiqa litsenziyasi',
            'amount' => 1_200_000,
        ])->assertCreated();
    }

    public function test_an_archived_heading_takes_no_new_entries(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/v1/finance/expense-categories', [
            'code' => 'transport',
            'name' => ['uz' => 'Transport'],
        ])->assertCreated();

        $this->patchJson('/api/v1/finance/expense-categories/transport', ['is_archived' => true])->assertOk();

        $this->postJson('/api/v1/finance/expenses', [
            'category' => 'transport',
            'description' => 'Yoqilg\'i',
            'amount' => 500_000,
        ])->assertApiValidationErrors('category');
    }

    public function test_a_heading_the_till_writes_cannot_be_archived_or_deleted(): void
    {
        $this->actingAsOwner();

        // Materialise the row first, so the delete has something to aim at.
        $this->patchJson('/api/v1/finance/expense-categories/refund', ['position' => 3])->assertOk();

        $this->patchJson('/api/v1/finance/expense-categories/refund', ['is_archived' => true])
            ->assertStatus(409)
            ->assertApiError('finance.category_is_system');

        $id = ExpenseCategory::query()->where('code', 'refund')->value('id');

        $this->deleteJson("/api/v1/finance/expense-categories/{$id}")
            ->assertStatus(409)
            ->assertApiError('finance.category_is_system');
    }

    public function test_a_heading_with_entries_is_archived_rather_than_deleted(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/v1/finance/expense-categories', [
            'code' => 'transport', 'name' => ['uz' => 'Transport'],
        ])->assertCreated();

        $this->postJson('/api/v1/finance/expenses', [
            'category' => 'transport', 'description' => 'Yoqilg\'i', 'amount' => 500_000,
        ])->assertCreated();

        $id = ExpenseCategory::query()->where('code', 'transport')->value('id');

        $this->deleteJson("/api/v1/finance/expense-categories/{$id}")
            ->assertStatus(409)
            ->assertApiError('finance.category_in_use');
    }

    public function test_the_counts_behind_the_delete_guard_are_published(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/v1/finance/expenses', [
            'category' => 'rent', 'description' => 'Ijara · avgust', 'amount' => 12_000_000,
        ])->assertCreated();

        $rows = $this->getJson('/api/v1/finance/expense-categories?with_counts=1')->assertOk()->json('data');
        $rent = $this->rowFor($rows, 'code', 'rent');

        $this->assertSame(1, $rent['entries_count']);
        $this->assertSame(12_000_000, $rent['entries_total']);

        // A heading with nothing under it reads zero rather than reading nothing
        // — the delete guard is measured against this number.
        $repair = $this->rowFor($rows, 'code', 'repair');
        $this->assertSame(0, $repair['entries_count']);
    }

    // ============ Tenant isolation ============

    public function test_one_restaurants_configuration_is_invisible_to_another(): void
    {
        $mine = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $theirs = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        PaymentMethod::query()->create([
            'tenant_id' => $theirs->id, 'method' => 'cash', 'name' => ['uz' => 'Ularniki'],
            'kind' => 'cash', 'fee_bps' => 999,
        ]);

        $user = User::factory()->create(['tenant_id' => $mine->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        $rows = $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/finance/payment-methods')->assertOk()->json('data');

        $cash = $this->rowFor($rows, 'method', 'cash');

        // Their row is not merely filtered out of a list — it must not be
        // mistaken for ours, which is what a shared `method` key invites.
        $this->assertNull($cash['id']);
        $this->assertNull($cash['fee_bps']);
    }
}
