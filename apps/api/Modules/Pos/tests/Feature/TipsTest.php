<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Modules\Finance\Models\Payment;
use Modules\Menu\Models\MenuItem;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Services\PinAuthenticator;
use Tests\TestCase;

/**
 * Choypuli — the tip, DECISIONS Q6.
 *
 * A tip is money the guest handed over on TOP of the bill, and every property
 * below is a separate way a restaurant gets that wrong:
 *
 *   1. It does not reduce what is owed. A guest who hands over 50 000 on a
 *      45 000 bill and says "keep it" has paid the bill in full and tipped
 *      5 000. Subtracting the tip from the due would settle a bill for 40 000
 *      and leave the restaurant 5 000 short on a table that paid over.
 *   2. It is not revenue. It never enters `total_takings` and never enters the
 *      total the bill was taxed on — an owner whose revenue included tips would
 *      pay VAT and income tax on other people's money, every month, forever.
 *   3. A tip left in notes IS in the drawer at counting time, so the expected
 *      cash counts it. One left on a card is in the bank and is not, which is
 *      the difference that matters: a shift counting card tips would report a
 *      surplus every single night and teach a manager to ignore the one figure
 *      that catches a hand in the till.
 *   4. The guest cannot tip money they did not hand over, and a NEGATIVE tip is
 *      a discount wearing a tip's name — it would walk straight past the
 *      approval ladder every real discount goes through.
 *
 * All of it in integer tiyin. 1 so'm = 100 tiyin, and a tip is the one figure a
 * cashier is most tempted to type as "5%".
 */
final class TipsTest extends TestCase
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

    /**
     * Open a shift on a 100 000 so'm float, and a bill with one dish on it.
     *
     * @return array{0: int, 1: int} [billId, total]
     */
    private function billWorth(int $price): array
    {
        $this->till()->postJson('/api/v1/pos/shifts/open', ['opening_cash' => 10_000_000])->assertCreated();

        return $this->anotherBillWorth($price);
    }

    /**
     * A further bill on the shift that is already open.
     *
     * Split out because a second `shifts/open` for the same cashier is refused —
     * two open drawers for one person is how a payment lands in an arbitrary one —
     * and the tips a shift reports are the sum over several tables, not one.
     *
     * @return array{0: int, 1: int}
     */
    private function anotherBillWorth(int $price): array
    {
        $dish = $this->dish($price);
        $bill = $this->till()->postJson('/api/v1/pos/bills', ['channel' => 'dine_in'])
            ->assertCreated()->json('data');
        $withLine = $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/lines", [
            'menu_item_id' => $dish->id, 'quantity' => 1,
        ])->assertOk()->json('data');

        return [(int) $withLine['id'], (int) $withLine['total']];
    }

    /**
     * The row Finance wrote for one tender, as columns.
     *
     * Read as columns rather than as a total, because `amount` and `tip` being two
     * of them is the entire point: a tip folded into the amount would satisfy any
     * assertion about what the guest handed over, and still be revenue.
     *
     * @return array<string, mixed>
     */
    private function paymentOn(int $billId, string $method): array
    {
        $this->inTenant();

        return Payment::query()
            ->where('order_id', $billId)
            ->where('method', $method)
            ->firstOrFail()
            ->toArray();
    }

    // ============ A tip is not a discount ============

    /*
     * The guest hands over 50 000 on a 45 000 bill and says to keep the change.
     *
     * That is a bill paid in full plus a 5 000 tip, not a 50 000 payment and not
     * a 45 000 one. Fold the tip into the settlement the wrong way and the bill
     * is short by exactly the generosity that was meant to be on top of it.
     */
    public function test_a_tip_does_not_reduce_what_the_guest_owes(): void
    {
        [$billId, $total] = $this->billWorth(4_500_000);

        $response = $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => 5_000_000, 'tip' => 500_000]],
        ])->assertOk()
            ->assertJsonPath('data.settled', true)
            ->assertJsonPath('data.bill.status', 'paid')
            ->assertJsonPath('data.due', $total)
            ->assertJsonPath('data.offered', 5_000_000)
            ->assertJsonPath('data.tips', 500_000);

        // What reached the bill is the due to the tiyin — the tip neither topped
        // it up nor ate into it.
        $this->assertSame($total, $response->json('data.applied'));

        // And no change: the 5 000 was declared as a tip, so it stayed. A drawer
        // that handed it back would be paying the tip out of the restaurant.
        $this->assertSame(0, $response->json('data.change'));
    }

    // ============ A tip is not revenue ============

    /*
     * Nobody sold anything for a tip.
     *
     * If it entered takings the restaurant would declare it as turnover and be
     * taxed on money that belongs to the waiter — and the VAT extracted from the
     * bill would be computed against a total the guest never agreed to.
     */
    public function test_a_tip_is_not_revenue(): void
    {
        [$billId, $total] = $this->billWorth(4_500_000);

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => 5_000_000, 'tip' => 500_000]],
        ])->assertOk();

        // The payment row records the sale and carries the tip beside it, not
        // inside it: 45 000 was taken for food, 5 000 was handed to a person.
        $payment = $this->paymentOn($billId, 'cash');
        $this->assertSame($total, $payment['amount']);
        $this->assertSame(500_000, $payment['tip']);

        $this->till()->getJson('/api/v1/pos/shifts/current')
            ->assertOk()
            ->assertJsonPath('data.total_takings', $total)
            ->assertJsonPath('data.by_method.cash', $total)
            ->assertJsonPath('data.tips', 500_000);
    }

    // ============ Where the tip physically is ============

    public function test_a_cash_tip_is_in_the_drawer_at_counting_time(): void
    {
        [$billId, $total] = $this->billWorth(4_500_000);

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => 5_000_000, 'tip' => 500_000]],
        ])->assertOk();

        /*
         * Float 100 000 + 45 000 sold + 5 000 tipped = 150 000 so'm of notes.
         *
         * The tip is in the box even though it is not revenue, so takings and the
         * expected drawer legitimately disagree — by exactly the tip, and for a
         * reason the Z-report names. Leave it out and the cashier is 5 000 over
         * every time somebody tips in notes, which reads as a till that is being
         * skimmed in reverse.
         */
        $this->till()->getJson('/api/v1/pos/shifts/current')
            ->assertOk()
            ->assertJsonPath('data.cash_taken', $total)
            ->assertJsonPath('data.expected_cash', 15_000_000);

        // And the count agrees: the cashier hands over 150 000 and is level.
        $this->till()->postJson('/api/v1/pos/shifts/close', ['counted_cash' => 15_000_000])
            ->assertOk()
            ->assertJsonPath('data.expected_cash', 15_000_000)
            ->assertJsonPath('data.difference', 0);
    }

    public function test_a_card_tip_is_in_the_bank_and_not_in_the_drawer(): void
    {
        [$billId, $total] = $this->billWorth(4_500_000);

        /*
         * 50 000 on the card, 5 000 of it declared as a tip.
         *
         * The same 50 000 with no tip declared is refused outright — a card
         * terminal cannot hand notes back, so an overpayment by card is a typo
         * until somebody says otherwise. Declaring the tip is that somebody.
         */
        $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'card', 'amount' => 5_000_000, 'tip' => 500_000]],
        ])->assertOk()
            ->assertJsonPath('data.settled', true)
            ->assertJsonPath('data.applied', $total);

        /*
         * The drawer still holds only the float.
         *
         * A card tip settles into a bank account days later; no note ever entered
         * the box. Counting it would show a 5 000 surplus tonight and every night,
         * and a manager who sees a surplus every night stops reading the
         * difference at all — which is the whole reason the figure exists.
         */
        $this->till()->getJson('/api/v1/pos/shifts/current')
            ->assertOk()
            ->assertJsonPath('data.cash_taken', 0)
            ->assertJsonPath('data.tips', 500_000)
            ->assertJsonPath('data.expected_cash', 10_000_000);

        $this->till()->postJson('/api/v1/pos/shifts/close', ['counted_cash' => 10_000_000])
            ->assertOk()
            ->assertJsonPath('data.expected_cash', 10_000_000)
            ->assertJsonPath('data.difference', 0);
    }

    /*
     * Two tables, two tips, two different places the money now sits.
     *
     * `tips` is what the restaurant owes its staff at the end of the service, so
     * it is the whole of it regardless of how it arrived; `expected_cash` is only
     * the share that is physically in the box. Reporting one figure for both is
     * how a waiter gets paid out of a drawer that never received the money.
     */
    public function test_the_z_report_totals_cash_and_card_tips_together(): void
    {
        [$cashBill, $cashTotal] = $this->billWorth(4_500_000);
        [$cardBill, $cardTotal] = $this->anotherBillWorth(3_000_000);

        $this->till()->postJson("/api/v1/pos/bills/{$cashBill}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => 5_000_000, 'tip' => 500_000]],
        ])->assertOk();

        $this->till()->postJson("/api/v1/pos/bills/{$cardBill}/tenders", [
            'tenders' => [['method' => 'card', 'amount' => 3_200_000, 'tip' => 200_000]],
        ])->assertOk();

        $this->till()->getJson('/api/v1/pos/shifts/current')
            ->assertOk()
            // 5 000 in notes + 2 000 on a card, owed to the staff either way.
            ->assertJsonPath('data.tips', 700_000)
            // 45 000 + 30 000 sold. Neither tip is in here.
            ->assertJsonPath('data.total_takings', $cashTotal + $cardTotal)
            // Float 100 000 + 45 000 in notes + the 5 000 cash tip. The 2 000
            // card tip is in the bank and stays out.
            ->assertJsonPath('data.expected_cash', 15_000_000);
    }

    // ============ What a tip may not be ============

    /*
     * A tip is a part of what was handed over, never an extra on top of it.
     *
     * A cashier who types the bill into the amount box and the tip into the tip
     * box has just conjured money nobody gave: the payment row would claim more
     * cash than the drawer holds, and the shortfall lands on whoever counts.
     */
    public function test_a_tip_larger_than_the_tender_is_refused(): void
    {
        [$billId] = $this->billWorth(4_500_000);

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => 5_000_000, 'tip' => 6_000_000]],
        ])->assertApiError('pos.tender_refused');

        // Nothing was captured and the bill is still owed — a refused settlement
        // must leave the table exactly where it was.
        $this->inTenant();
        $this->assertSame(0, Payment::query()->count());
        $this->till()->getJson("/api/v1/pos/bills/{$billId}")
            ->assertOk()->assertJsonPath('data.status', 'draft');
    }

    /*
     * Refused at the door, before the service ever sees it.
     *
     * A negative tip is a discount with a friendlier name. Real discounts pass a
     * manager's PIN and land in the approval log; one smuggled in through the tip
     * field would reduce a bill with nobody's signature on it and nothing to find
     * afterwards.
     */
    public function test_a_negative_tip_is_refused_before_it_reaches_the_till(): void
    {
        [$billId] = $this->billWorth(4_500_000);

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => 4_500_000, 'tip' => -500_000]],
        ])->assertStatus(422)->assertApiValidationErrors('tenders.0.tip');

        $this->inTenant();
        $this->assertSame(0, Payment::query()->count());
        $this->till()->getJson("/api/v1/pos/bills/{$billId}")
            ->assertOk()->assertJsonPath('data.status', 'draft');
    }
}
