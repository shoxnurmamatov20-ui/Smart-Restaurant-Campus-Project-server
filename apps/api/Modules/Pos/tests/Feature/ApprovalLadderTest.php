<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Models\StoredDomainEvent;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Modules\Menu\Models\MenuItem;
use Modules\Pos\Models\PosApproval;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Services\PinAuthenticator;
use Tests\TestCase;

/**
 * P9: who may take money off a bill, and how much of it.
 *
 * The approval table already existed; what it could not do is the part a
 * restaurant is actually robbed through. A signature said "yes to a void" and
 * nothing more, so one signed off a 50 000 so'm line and was then spent on a
 * 500 000 so'm one — same action, same line, different money, and the record
 * showed a manager approving the larger figure they never saw.
 */
final class ApprovalLadderTest extends TestCase
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

        // Straight off the design's ladder: a waiter asks, a cashier is trusted
        // with a rounding-error's worth, a manager with a fifth of the bill.
        $this->terminal = Terminal::factory()->create([
            'code' => 'KASSA-1',
            'settings' => [
                'currency' => 'UZS',
                'cash_rounding_tiyin' => 100,
                'discount_limits' => ['waiter' => 0, 'cashier' => 5, 'branch-manager' => 20],
            ],
        ]);
        $this->deviceToken = $this->terminal->createToken('t', ['pos:terminal'])->plainTextToken;

        $this->cashier = $this->staff('cashier');
        $this->cashierSession = $this->signIn($this->cashier);
    }

    // ============ Harness ============

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

    /**
     * A dine-in bill carrying one dish. Returns its id.
     *
     * `$token` because a terminal holds one session at a time: signing a manager
     * in kills the cashier's, so a test that needs a bill AFTER that has to open
     * it as whoever is still signed in.
     */
    private function billWorth(int $price, ?string $token = null): int
    {
        $this->inTenant();

        $dish = MenuItem::factory()->create([
            'sku' => 'OSH-'.Str::upper(Str::random(4)),
            'price' => $price, 'is_available' => true, 'status' => 'active',
        ]);

        $bill = $this->till(token: $token)->postJson('/api/v1/pos/bills', ['channel' => 'dine_in'])
            ->assertCreated()->json('data');

        return (int) $this->till(token: $token)->postJson("/api/v1/pos/bills/{$bill['id']}/lines", [
            'menu_item_id' => $dish->id, 'quantity' => 1,
        ])->assertOk()->json('data.id');
    }

    /** Ask for a discount, get refused, and have a manager sign the refusal. */
    private function signedDiscount(int $billId, int $amount): int
    {
        $approvalId = (int) $this->till()->postJson("/api/v1/pos/bills/{$billId}/discount", [
            'amount' => $amount, 'reason' => 'Doimiy mijoz',
        ])->assertApiError('pos.approval_required')->json('error.approval_id');

        $manager = $this->staff('branch-manager', '9999');
        $this->till(token: $this->signIn($manager, '9999'))
            ->postJson("/api/v1/pos/approvals/{$approvalId}/decide", ['approved' => true])
            ->assertOk();

        $this->cashierSession = $this->signIn($this->cashier);

        return $approvalId;
    }

    // ============ A signature is for an amount, not for an action ============

    public function test_a_signature_does_not_stretch_to_a_larger_amount(): void
    {
        $billId = $this->billWorth(10_000_000);
        $approvalId = $this->signedDiscount($billId, 1_000_000);

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/discount", [
            'amount' => 5_000_000, 'reason' => 'Doimiy mijoz', 'approval_id' => $approvalId,
        ])->assertApiError('pos.approval_invalid');

        // Refused, and not quietly spent on the way: the cashier can still
        // apply the discount the manager actually agreed to.
        $this->assertSame('approved', PosApproval::query()->findOrFail($approvalId)->status);
        $this->assertSame(0, (int) $this->till()->getJson("/api/v1/pos/bills/{$billId}")
            ->assertOk()->json('data.discount_total'));
    }

    public function test_a_signature_covers_the_amount_it_was_given_for(): void
    {
        $billId = $this->billWorth(10_000_000);
        $approvalId = $this->signedDiscount($billId, 1_000_000);

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/discount", [
            'amount' => 1_000_000, 'reason' => 'Doimiy mijoz', 'approval_id' => $approvalId,
        ])->assertOk()->assertJsonPath('data.discount_total', 1_000_000);
    }

    public function test_a_signature_covers_less_than_it_was_given_for(): void
    {
        $billId = $this->billWorth(10_000_000);
        $approvalId = $this->signedDiscount($billId, 1_000_000);

        // A manager who agreed to a million agreed to eight hundred thousand.
        // The ceiling is what was signed; asking for less is not a new question.
        $this->till()->postJson("/api/v1/pos/bills/{$billId}/discount", [
            'amount' => 800_000, 'reason' => 'Doimiy mijoz', 'approval_id' => $approvalId,
        ])->assertOk()->assertJsonPath('data.discount_total', 800_000);
    }

    // ============ The percent picker ============

    public function test_a_discount_may_be_asked_for_as_a_percentage(): void
    {
        $billId = $this->billWorth(10_000_000);
        $manager = $this->staff('branch-manager', '9999');

        // Ten percent, and this terminal trusts a manager with twenty.
        $this->till(token: $this->signIn($manager, '9999'))
            ->postJson("/api/v1/pos/bills/{$billId}/discount", [
                'percent' => 10, 'reason' => 'Kechikkan buyurtma uchun',
            ])
            ->assertOk()
            ->assertJsonPath('data.discount_total', 1_000_000);
    }

    public function test_the_till_never_works_out_the_money_itself(): void
    {
        $billId = $this->billWorth(10_000_000);

        // A percent above the cashier's five, so it stops at the gate — and the
        // figure the manager is asked to answer is in so'm, not in percent. A
        // manager approving "10%" is approving a number they have to work out.
        $approvalId = (int) $this->till()->postJson("/api/v1/pos/bills/{$billId}/discount", [
            'percent' => 10, 'reason' => 'Doimiy mijoz',
        ])->assertApiError('pos.approval_required')->json('error.approval_id');

        $this->assertSame(1_000_000, (int) PosApproval::query()->findOrFail($approvalId)->amount);
    }

    public function test_a_discount_names_a_percent_or_an_amount_and_never_both(): void
    {
        $billId = $this->billWorth(10_000_000);

        // Two figures that can disagree is a bill whose discount depends on
        // which one the server happened to read.
        $this->till()->postJson("/api/v1/pos/bills/{$billId}/discount", [
            'percent' => 10, 'amount' => 1_000_000, 'reason' => 'Doimiy mijoz',
        ])->assertApiValidationErrors('percent');
    }

    public function test_a_discount_of_nothing_is_not_a_discount(): void
    {
        $billId = $this->billWorth(10_000_000);

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/discount", [
            'reason' => 'Doimiy mijoz',
        ])->assertApiValidationErrors('amount');
    }

    // ============ The ladder the till draws its picker from ============

    public function test_the_session_says_what_this_person_may_take_off_a_bill(): void
    {
        // Without this the tablet has two bad options: offer every percentage
        // and let half of them come back 403, or hard-code a ladder that is a
        // per-terminal setting. Both teach a cashier to ignore the screen.
        $this->till()->getJson('/api/v1/pos/auth/session')
            ->assertOk()
            ->assertJsonPath('data.user.discount_ceiling', 5);
    }

    public function test_the_ceiling_follows_the_person_and_not_the_till(): void
    {
        $waiter = $this->staff('waiter', '1111');

        // Same terminal, same settings, a different row of the ladder.
        $this->till(token: $this->signIn($waiter, '1111'))
            ->getJson('/api/v1/pos/auth/session')
            ->assertOk()
            ->assertJsonPath('data.user.discount_ceiling', 0);
    }

    public function test_somebody_who_signs_approvals_has_no_ceiling_to_report(): void
    {
        $manager = $this->staff('branch-manager', '9999');
        $session = $this->signIn($manager, '9999');

        /*
         * A manager's configured row says 20, and reporting that would be a lie
         * the tablet then acts on: `requires()` returns false for anyone holding
         * `pos.approve` before it ever reaches the ladder, so a manager can take
         * off any amount unaided. A picker drawn from 20 would hide the chips
         * they are allowed to press — and the ones it did draw would work, which
         * is what makes the wrong number survive a demo.
         */
        $this->till(token: $session)->getJson('/api/v1/pos/auth/session')
            ->assertOk()
            ->assertJsonPath('data.user.discount_ceiling', 100);

        $billId = $this->billWorth(10_000_000, $session);

        $this->till(token: $session)->postJson("/api/v1/pos/bills/{$billId}/discount", [
            'percent' => 50, 'reason' => 'Ish beruvchining mehmoni',
        ])->assertOk()->assertJsonPath('data.discount_total', 5_000_000);
    }

    // ============ The manager who is not in the building ============

    public function test_a_manager_answers_from_the_car_park(): void
    {
        $billId = $this->billWorth(10_000_000);

        $approvalId = (int) $this->till()->postJson("/api/v1/pos/bills/{$billId}/discount", [
            'percent' => 10, 'reason' => 'Doimiy mijoz',
        ])->assertApiError('pos.approval_required')->json('error.approval_id');

        // A phone, not a till: an ordinary user token, no device token behind
        // it, no PIN session, nobody standing at KASSA-1.
        $manager = $this->staff('branch-manager', '9999');
        $phone = $manager->createToken('telefon')->plainTextToken;

        $this->bearer($phone)->getJson('/api/v1/pos/approvals')
            ->assertOk()
            ->assertJsonPath('data.0.id', $approvalId);

        $this->bearer($phone)->postJson("/api/v1/pos/approvals/{$approvalId}/decide", ['approved' => true])
            ->assertOk()
            ->assertJsonPath('data.status', 'approved')
            // Answered remotely, and the record says so — "the manager was here
            // and typed their PIN" is a different claim about the evening.
            ->assertJsonPath('data.method', 'remote');

        // And the tablet, which never moved, can now apply it.
        $this->cashierSession = $this->signIn($this->cashier);
        $this->till()->postJson("/api/v1/pos/bills/{$billId}/discount", [
            'percent' => 10, 'reason' => 'Doimiy mijoz', 'approval_id' => $approvalId,
        ])->assertOk()->assertJsonPath('data.discount_total', 1_000_000);
    }

    public function test_a_manager_standing_at_the_till_answered_with_a_pin(): void
    {
        $billId = $this->billWorth(10_000_000);

        $approvalId = (int) $this->till()->postJson("/api/v1/pos/bills/{$billId}/discount", [
            'percent' => 10, 'reason' => 'Doimiy mijoz',
        ])->assertApiError('pos.approval_required')->json('error.approval_id');

        $manager = $this->staff('branch-manager', '9999');

        $this->till(token: $this->signIn($manager, '9999'))
            ->postJson("/api/v1/pos/approvals/{$approvalId}/decide", ['approved' => true])
            ->assertOk()
            ->assertJsonPath('data.method', 'pin');
    }

    public function test_a_terminal_on_its_own_answers_nothing(): void
    {
        $billId = $this->billWorth(10_000_000);

        $approvalId = (int) $this->till()->postJson("/api/v1/pos/bills/{$billId}/discount", [
            'percent' => 10, 'reason' => 'Doimiy mijoz',
        ])->assertApiError('pos.approval_required')->json('error.approval_id');

        // The device token is the till, not a person. Opening the route to the
        // outside must not open it to the tablet itself — otherwise a cashier
        // signs their own discount off by talking to the terminal's own token.
        $this->bearer($this->deviceToken)
            ->postJson("/api/v1/pos/approvals/{$approvalId}/decide", ['approved' => true])
            ->assertApiError('pos.session_required');

        $this->assertSame('pending', PosApproval::query()->findOrFail($approvalId)->status);
    }

    // ============ Three ways a bill ends, three events ============

    public function test_voiding_a_bill_says_so_on_the_bus(): void
    {
        $billId = $this->billWorth(10_000_000);

        $owed = (int) $this->till()->getJson("/api/v1/pos/bills/{$billId}")->assertOk()->json('data.total');

        $manager = $this->staff('branch-manager', '9999');
        $this->till(token: $this->signIn($manager, '9999'))
            ->postJson("/api/v1/pos/bills/{$billId}/cancel", ['reason' => 'Mehmon ketdi'])
            ->assertOk()
            ->assertJsonPath('data.status', 'voided');

        $event = StoredDomainEvent::query()->where('name', 'pos.bill_voided')->sole();

        $this->assertSame($billId, $event->payload['bill_id']);
        // What walked out of the door, so a loss-prevention screen has a figure
        // rather than a count — and the figure the guest would have paid, taken
        // from the bill rather than restated here where it could drift.
        $this->assertSame($owed, $event->payload['total']);
        $this->assertGreaterThan(0, $owed);
        $this->assertSame('Mehmon ketdi', $event->payload['reason']);
    }

    public function test_a_comp_is_not_a_void(): void
    {
        $billId = $this->billWorth(10_000_000);

        // Always a manager's call, whoever asks and whatever it comes to: the
        // restaurant is giving food away.
        $approvalId = (int) $this->till()->postJson("/api/v1/pos/bills/{$billId}/comp", [
            'reason' => 'Qirq daqiqa kutdi',
        ])->assertApiError('pos.approval_required')->json('error.approval_id');

        $manager = $this->staff('branch-manager', '9999');
        $this->till(token: $this->signIn($manager, '9999'))
            ->postJson("/api/v1/pos/approvals/{$approvalId}/decide", ['approved' => true])->assertOk();

        $this->cashierSession = $this->signIn($this->cashier);
        $this->till()->postJson("/api/v1/pos/bills/{$billId}/comp", [
            'reason' => 'Qirq daqiqa kutdi', 'approval_id' => $approvalId,
        ])->assertOk()->assertJsonPath('data.status', 'comped');

        // The distinction the whole thing exists for: the food was cooked and
        // the stock is gone, so this must not reach a subscriber counting voids.
        $this->assertSame(1, StoredDomainEvent::query()->where('name', 'pos.bill_comped')->count());
        $this->assertSame(0, StoredDomainEvent::query()->where('name', 'pos.bill_voided')->count());
    }

    public function test_the_comp_event_names_who_agreed_to_it(): void
    {
        $billId = $this->billWorth(10_000_000);

        $approvalId = (int) $this->till()->postJson("/api/v1/pos/bills/{$billId}/comp", [
            'reason' => 'Qirq daqiqa kutdi',
        ])->assertApiError('pos.approval_required')->json('error.approval_id');

        $manager = $this->staff('branch-manager', '9999');
        $phone = $manager->createToken('telefon')->plainTextToken;
        $this->bearer($phone)->postJson("/api/v1/pos/approvals/{$approvalId}/decide", ['approved' => true])
            ->assertOk();

        $this->cashierSession = $this->signIn($this->cashier);
        $this->till()->postJson("/api/v1/pos/bills/{$billId}/comp", [
            'reason' => 'Qirq daqiqa kutdi', 'approval_id' => $approvalId,
        ])->assertOk();

        $payload = StoredDomainEvent::query()->where('name', 'pos.bill_comped')->sole()->payload;

        // Orders could publish that a bill was comped. It could not publish
        // this: who signed it off, and that they were not in the building.
        $this->assertSame($manager->id, $payload['approved_by_user_id']);
        $this->assertSame($this->cashier->id, $payload['by_user_id']);
        $this->assertSame('remote', $payload['approval_method']);
    }

    // ============ Telling the manager there is something to answer ============

    public function test_a_request_reaches_the_bus_so_somebody_can_be_told(): void
    {
        $billId = $this->billWorth(10_000_000);

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/discount", [
            'percent' => 10, 'reason' => 'Doimiy mijoz',
        ])->assertApiError('pos.approval_required');

        $payload = StoredDomainEvent::query()->where('name', 'pos.approval_requested')->sole()->payload;

        $this->assertSame('discount', $payload['action']);
        $this->assertSame(1_000_000, $payload['amount']);
        $this->assertSame('Doimiy mijoz', $payload['reason']);
    }

    public function test_tapping_the_button_again_does_not_buzz_the_manager_again(): void
    {
        $billId = $this->billWorth(10_000_000);

        // What anybody does when a screen says no: tap it again.
        foreach (range(1, 3) as $ignored) {
            $this->till()->postJson("/api/v1/pos/bills/{$billId}/discount", [
                'percent' => 10, 'reason' => 'Doimiy mijoz',
            ])->assertApiError('pos.approval_required');
        }

        $this->assertSame(1, StoredDomainEvent::query()->where('name', 'pos.approval_requested')->count());
    }

    public function test_a_refusal_travels_as_well_as_an_agreement(): void
    {
        $billId = $this->billWorth(10_000_000);

        $approvalId = (int) $this->till()->postJson("/api/v1/pos/bills/{$billId}/discount", [
            'percent' => 10, 'reason' => 'Doimiy mijoz',
        ])->assertApiError('pos.approval_required')->json('error.approval_id');

        $manager = $this->staff('branch-manager', '9999');
        $this->bearer($manager->createToken('telefon')->plainTextToken)
            ->postJson("/api/v1/pos/approvals/{$approvalId}/decide", ['approved' => false])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected');

        // "No" is an answer. A till that only ever heard the yeses would have to
        // treat silence as a refusal, and then a dropped message and a refusal
        // look the same to the waiter standing at the table.
        $payload = StoredDomainEvent::query()->where('name', 'pos.approval_decided')->sole()->payload;

        $this->assertSame('rejected', $payload['status']);
        $this->assertSame($manager->id, $payload['approved_by_user_id']);
    }

    // ============ A drawer that does not agree ============

    public function test_a_shift_variance_is_signed_off_like_anything_else(): void
    {
        $shiftId = (int) $this->till()->postJson('/api/v1/pos/shifts/open', ['opening_cash' => 10_000_000])
            ->assertCreated()->json('data.shift_id');

        /*
         * Finance refuses to close a drawer that is short by more than a
         * threshold without a manager behind it, and the obvious way to satisfy
         * that is to let the till post an `approved_by_user_id` — which is a
         * claim, not a signature. A cashier knows their manager's id.
         *
         * So the same ladder answers this as answers a discount: a row with an
         * expiry, bound to its subject and its amount, spent once, and answerable
         * from a phone.
         */
        $approval = $this->till()->postJson('/api/v1/pos/approvals', [
            'action' => 'shift_variance',
            'subject_type' => 'shift',
            'subject_id' => $shiftId,
            // The gap itself, so the record says what was agreed to rather than
            // that something was.
            'amount' => 2_900_000,
            'reason' => 'Yashik 29 000 so\'m kam chiqdi',
        ])->assertCreated()->json('data');

        $manager = $this->staff('branch-manager', '9999');
        $this->bearer($manager->createToken('telefon')->plainTextToken)
            ->postJson("/api/v1/pos/approvals/{$approval['id']}/decide", ['approved' => true])
            ->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.method', 'remote');
    }
}
