<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Finance\CashRounding;
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
 * Cash rounding — DECISIONS Q7, and the most dangerous arithmetic in the project.
 *
 * A bill comes to 47 120 so'm and no drawer on earth can pay the 120: the
 * smallest note in circulation is a thousand so'm. So the cash side of a
 * settlement moves to the nearest note, and the difference is written down
 * rather than quietly kept or quietly lost. Four properties are protected here,
 * and each one is a restaurant losing money or a cashier being blamed for it:
 *
 *   1. The step is a thousand so'm — 100 000 tiyin — and neither a hundredth nor
 *      a hundred times that. Both errors are silent for a month.
 *   2. Rounding is to the NEAREST note. Rounding down would be a systematic
 *      donation from the restaurant to every cash guest, up to a thousand so'm
 *      a bill, in the same direction all day.
 *   3. The difference is SIGNED, and both signs actually happen. Half of all
 *      rounding is a loss; a suite that only ever exercised gains would not
 *      notice a minus sign being dropped between the service and the column.
 *   4. Takings and the drawer are allowed to disagree, and the rounding is the
 *      name of the gap. `payments.amount` is what the restaurant SOLD; the
 *      drawer holds `amount + rounding`. Recording the offered figure instead
 *      was a real bug and it made the box short by the change on every single
 *      cash sale — which at counting time reads as a cashier who cannot count.
 */
final class CashRoundingTest extends TestCase
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

        /*
         * A terminal with no rounding setting of its own, which is the whole
         * point of this file.
         *
         * The factory pins `cash_rounding_tiyin` to 100 so its own fixtures deal
         * in exact so'm; omitting the key sends TenderService to
         * CashRounding::STEP_TIYIN instead — the contract's thousand so'm, and
         * the configuration a real restaurant runs on before anybody edits a
         * setting. A test that inherited the factory's 100 would be measuring
         * the fixture rather than the decision.
         */
        $this->terminal = Terminal::factory()->create([
            'code' => 'KASSA-1',
            'settings' => [
                'currency' => 'UZS',
                'discount_limits' => ['waiter' => 0, 'cashier' => 5, 'branch-manager' => 30],
            ],
        ]);
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

    /** Open a shift on a 100 000 so'm float and a bill with one dish on it. Returns [billId, total]. */
    private function billWorth(int $price): array
    {
        $this->till()->postJson('/api/v1/pos/shifts/open', ['opening_cash' => 10_000_000])->assertCreated();

        return $this->anotherBillWorth($price);
    }

    /**
     * A second bill inside the shift already open.
     *
     * A cashier gets one open shift, so a test that needs two settlements cannot
     * call billWorth twice — the second open is refused, which is correct and
     * has its own test in TillMoneyTest.
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
     * The one payment of a settlement that came in by this method.
     *
     * By method rather than by position, so the assertions do not silently move
     * when the order of the tenders in a request changes.
     *
     * @param  array<int, int>  $paymentIds
     */
    private function payment(array $paymentIds, string $method): Payment
    {
        $this->inTenant();

        return Payment::query()->whereIn('id', $paymentIds)->where('method', $method)->sole();
    }

    /** Reconfigure how far this till rounds — `1` switches it off entirely. */
    private function roundTo(int $tiyin): void
    {
        $this->inTenant();

        $this->terminal->forceFill([
            'settings' => array_merge($this->terminal->settings ?? [], ['cash_rounding_tiyin' => $tiyin]),
        ])->save();
    }

    // ============ The constant ============

    /**
     * The single most important assertion in this file.
     *
     * A factor of a hundred either way is invisible in code review and invisible
     * in production for weeks. At 1 000 tiyin (10 so'm) nothing appears to round
     * at all, `payments.rounding` stays near zero, and the first complaint is a
     * cashier who cannot make change. At 10 000 000 tiyin every bill rounds to
     * the nearest hundred thousand so'm and the restaurant gives away a meal per
     * table, evenly, to nobody's benefit.
     *
     * So it is asserted from both sides — the tiyin the code uses and the so'm a
     * human reasons about — plus the behaviour at that magnitude, because a
     * constant can be right while the arithmetic reading it is not.
     */
    public function test_the_rounding_step_is_one_thousand_som_written_in_tiyin(): void
    {
        $this->assertSame(
            100_000,
            CashRounding::STEP_TIYIN,
            'The cash rounding step must be 100 000 tiyin. A hundred times less rounds nothing; a hundred times more gives away a meal per bill.'
        );

        $this->assertSame(
            1_000,
            intdiv(CashRounding::STEP_TIYIN, 100),
            "Read back in so'm the step must be 1 000 — the smallest note a drawer actually holds."
        );

        // And the same magnitude proved through behaviour: half a step moves the
        // figure, one tiyin under half does not. Neither would be true of a step
        // of 1 000 tiyin, and both would land on 0 or 10 000 000 at a step of
        // 10 000 000.
        $this->assertSame(4_600_000, CashRounding::round(4_550_000));
        $this->assertSame(4_500_000, CashRounding::round(4_549_999));
    }

    public function test_rounding_goes_to_the_nearest_note_in_both_directions(): void
    {
        // 45 240 so'm — 240 over the note. Nearest sends it down, and the 240
        // so'm is the restaurant's loss on this bill.
        $this->assertSame(4_500_000, CashRounding::round(4_524_000));
        $this->assertSame(-24_000, CashRounding::difference(4_524_000));

        // 45 500 so'm — exactly half a step, and a tie goes up. Systematically
        // down would be a donation of up to a thousand so'm on every cash bill,
        // all day, in one direction.
        $this->assertSame(4_600_000, CashRounding::round(4_550_000));
        $this->assertSame(50_000, CashRounding::difference(4_550_000));

        // A bill already on a note boundary is left alone: no rounding row, and
        // nothing for a manager to explain.
        $this->assertSame(4_500_000, CashRounding::round(4_500_000));
        $this->assertSame(0, CashRounding::difference(4_500_000));
    }

    /**
     * A counter selling bottled water for exact change turns the step off, and
     * `round()` must then be the identity function rather than something that
     * divides by zero or falls back to the default.
     */
    public function test_a_step_of_one_leaves_every_figure_exactly_where_it_was(): void
    {
        $this->assertSame(4_524_000, CashRounding::round(4_524_000, 1));
        $this->assertSame(0, CashRounding::difference(4_524_000, 1));
        $this->assertSame(4_524_000, CashRounding::round(4_524_000, 0));
    }

    // ============ What reaches the payment row ============

    /**
     * Both signs, on real settlements, read back out of the database.
     *
     * A file that only ever produced a gain would pass against a column or a
     * cast that mangles the minus — and the mangled half is precisely the half
     * where the restaurant is out of pocket, so the error would be invisible in
     * the takings and visible only as a drawer that keeps coming up long.
     */
    public function test_both_signs_of_rounding_reach_the_payment_row(): void
    {
        // 45 240 so'm: the guest hands over 45 notes and the bill is settled in
        // full, 240 so'm of it out of the restaurant's pocket.
        [$firstBill] = $this->billWorth(4_524_000);
        $rounddown = $this->till()->postJson("/api/v1/pos/bills/{$firstBill}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => 4_500_000]],
        ])->assertOk()
            ->assertJsonPath('data.settled', true)
            ->assertJsonPath('data.bill.status', 'paid')
            ->assertJsonPath('data.change', 0)
            ->json('data');

        $this->assertSame(-24_000, $rounddown['rounding']);
        $this->assertSame(-24_000, $this->payment($rounddown['payment_ids'], 'cash')->rounding);

        // 45 500 so'm: 46 notes, and this time the 500 so'm stays in the box.
        [$secondBill] = $this->anotherBillWorth(4_550_000);
        $roundup = $this->till()->postJson("/api/v1/pos/bills/{$secondBill}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => 4_600_000]],
        ])->assertOk()
            ->assertJsonPath('data.settled', true)
            ->assertJsonPath('data.change', 0)
            ->json('data');

        $this->assertSame(50_000, $roundup['rounding']);
        $this->assertSame(50_000, $this->payment($roundup['payment_ids'], 'cash')->rounding);

        /*
         * The shift adds the two up as signed money, and the drawer holds the
         * notes rather than the bills.
         *
         * 100 000 float + 45 000 + 46 000 so'm of notes = 191 000 so'm, while
         * the takings are the 90 740 so'm the restaurant actually sold. The two
         * figures differ by exactly the rounding, which is the whole reason it is
         * recorded and reported instead of being folded into the amount.
         */
        $this->till()->getJson('/api/v1/pos/shifts/current')
            ->assertOk()
            ->assertJsonPath('data.rounding', 26_000)
            ->assertJsonPath('data.cash_taken', 9_074_000)
            ->assertJsonPath('data.expected_cash', 19_100_000);
    }

    /**
     * The bug this whole mechanism exists to prevent.
     *
     * `amount` used to be the offered figure, change included, so a guest paying
     * 50 000 for a 47 120 bill produced a 50 000 payment row and an expected
     * drawer 3 000 so'm too high — every single time change was given. Nobody
     * suspected the arithmetic; the shift blamed the person counting.
     */
    public function test_the_payment_records_what_stayed_in_the_drawer_not_what_was_handed_over(): void
    {
        // 47 120 so'm, paid with a single 50 000 note.
        [$billId] = $this->billWorth(4_712_000);

        $settled = $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => 5_000_000]],
        ])->assertOk()
            ->assertJsonPath('data.settled', true)
            ->assertJsonPath('data.bill.status', 'paid')
            ->json('data');

        // The due rounds down to 47 000, so the change is three notes and not
        // 2 880 so'm — which is a figure a drawer cannot produce.
        $this->assertSame(4_712_000, $settled['due']);
        $this->assertSame(5_000_000, $settled['offered']);
        $this->assertSame(-12_000, $settled['rounding']);
        $this->assertSame(300_000, $settled['change']);

        $payment = $this->payment($settled['payment_ids'], 'cash');

        $this->assertSame(4_712_000, $payment->amount, 'The payment must record the bill, not the note handed over.');
        $this->assertNotSame(5_000_000, $payment->amount);
        $this->assertSame(-12_000, $payment->rounding);
        $this->assertSame(
            4_700_000,
            $payment->amount + $payment->rounding,
            'Amount plus rounding is what is physically in the box: 47 notes.'
        );
    }

    /**
     * The end of the story: a counted drawer that agrees with the system to the
     * tiyin, on a sale where the guest was given change.
     *
     * This is the test that would have caught the offered-amount bug from the
     * only side a restaurant sees it — the cashier counts the notes that are
     * actually there and the Z-report calls it a shortfall.
     */
    public function test_a_cash_sale_with_change_reconciles_to_the_tiyin_at_closing(): void
    {
        // 100 000 so'm float, one 47 120 so'm bill, one 50 000 note.
        [$billId] = $this->billWorth(4_712_000);

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => 5_000_000]],
        ])->assertOk()->assertJsonPath('data.change', 300_000);

        // Float + the ROUNDED due, never the offered amount: 100 000 + 47 000.
        $this->till()->getJson('/api/v1/pos/shifts/current')
            ->assertOk()
            ->assertJsonPath('data.cash_taken', 4_712_000)
            ->assertJsonPath('data.rounding', -12_000)
            ->assertJsonPath('data.expected_cash', 14_700_000);

        // And the cashier counts exactly that, note by note, and owes nothing.
        $this->till()->postJson('/api/v1/pos/shifts/close', ['counted_cash' => 14_700_000])
            ->assertOk()
            ->assertJsonPath('data.expected_cash', 14_700_000)
            ->assertJsonPath('data.counted_cash', 14_700_000)
            ->assertJsonPath('data.difference', 0);
    }

    // ============ When rounding must not happen ============

    /**
     * A deposit, or one guest of four paying early.
     *
     * Rounding a running balance moves the goalposts between two halves of one
     * settlement: the part payment would be credited with notes the guest never
     * handed over, and the remainder would be measured against a total that had
     * shifted while they were at the cashpoint. So the balance stays exact and
     * only the piece that closes the bill is rounded.
     */
    public function test_a_part_payment_is_not_rounded(): void
    {
        // 47 120 so'm owed, 20 000 so'm on the table.
        [$billId] = $this->billWorth(4_712_000);

        $part = $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => 2_000_000]],
        ])->assertOk()
            ->assertJsonPath('data.settled', false)
            ->assertJsonPath('data.bill.status', 'draft')
            ->json('data');

        $this->assertSame(0, $part['rounding'], 'A balance the guest is coming back to must not be rounded.');
        $this->assertSame(0, $part['change']);

        $payment = $this->payment($part['payment_ids'], 'cash');
        $this->assertSame(2_000_000, $payment->amount);
        $this->assertSame(0, $payment->rounding);

        // The drawer holds the float plus exactly what was put in it.
        $this->till()->getJson('/api/v1/pos/shifts/current')
            ->assertOk()
            ->assertJsonPath('data.rounding', 0)
            ->assertJsonPath('data.expected_cash', 12_000_000);
    }

    /**
     * Rounding attaches to the cash remainder, not to the bill.
     *
     * A guest paying 10 300 so'm by card and the rest in notes must have the
     * remainder rounded once. The numbers here are chosen so the two readings
     * disagree in SIGN, not merely in size: the whole bill of 47 120 rounds down
     * by 120 so'm, while the 36 820 so'm left after the card rounds up by 180.
     * Round the wrong figure and the drawer is out by 300 so'm on a bill nobody
     * will ever re-add.
     */
    public function test_rounding_falls_on_the_cash_remainder_not_on_the_whole_bill(): void
    {
        [$billId] = $this->billWorth(4_712_000);

        $settled = $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [
                ['method' => 'card', 'amount' => 1_030_000],
                ['method' => 'cash', 'amount' => 3_700_000],
            ],
        ])->assertOk()
            ->assertJsonPath('data.settled', true)
            ->assertJsonPath('data.bill.status', 'paid')
            ->assertJsonPath('data.change', 0)
            ->json('data');

        $this->assertSame(18_000, $settled['rounding'], 'The remainder rounds UP; the whole bill would have rounded down.');
        $this->assertSame(0, $this->payment($settled['payment_ids'], 'card')->rounding);

        $cash = $this->payment($settled['payment_ids'], 'cash');
        $this->assertSame(3_682_000, $cash->amount);
        $this->assertSame(18_000, $cash->rounding);

        // Only the notes are in the box: 100 000 float + 37 000 so'm. The card
        // money is in a bank account and never passed through the drawer.
        $this->till()->getJson('/api/v1/pos/shifts/current')
            ->assertOk()
            ->assertJsonPath('data.expected_cash', 13_700_000)
            ->assertJsonPath('data.total_takings', 4_712_000);
    }

    /**
     * A till configured for exact cash, which is a real configuration: a coffee
     * counter with a coin tray does not need permission to keep 120 so'm.
     */
    public function test_a_terminal_that_rounds_to_one_tiyin_does_not_round_at_all(): void
    {
        $this->roundTo(1);

        [$billId] = $this->billWorth(4_712_000);

        $settled = $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => 5_000_000]],
        ])->assertOk()
            ->assertJsonPath('data.settled', true)
            ->assertJsonPath('data.bill.status', 'paid')
            ->json('data');

        // Change to the tiyin, and no rounding row to explain.
        $this->assertSame(0, $settled['rounding']);
        $this->assertSame(288_000, $settled['change']);
        $this->assertSame(4_712_000, $this->payment($settled['payment_ids'], 'cash')->amount);
        $this->assertSame(0, $this->payment($settled['payment_ids'], 'cash')->rounding);

        $this->till()->postJson('/api/v1/pos/shifts/close', ['counted_cash' => 14_712_000])
            ->assertOk()
            ->assertJsonPath('data.expected_cash', 14_712_000)
            ->assertJsonPath('data.difference', 0);
    }
}
