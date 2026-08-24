<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Modules\Pos\Models\PosApproval;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Services\PinAuthenticator;
use Tests\TestCase;

/**
 * P9: the manager who walked over.
 *
 * `approvals/{id}/decide` answers the manager who is somewhere else — their own
 * token, from their own phone — and that is the case the queue was built
 * around. It is not the case a restaurant actually does forty times a shift.
 *
 * Without this door the honest path costs the cashier their session: the
 * manager would have to sign in on the tablet the waiter is holding, answer,
 * and sign back out, because a terminal holds exactly one session. What happens
 * instead is that the manager's PIN gets told to the cashier once and used
 * forever, and the approval table records a lie for the rest of the year.
 */
final class ApprovalAtTheTillTest extends TestCase
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

        $this->cashier = $this->staff('cashier', '4821');
        $this->cashierSession = $this->signIn($this->cashier, '4821');
    }

    // ============ Harness ============

    private function inTenant(?Tenant $tenant = null): void
    {
        app(TenantContext::class)->set($tenant ?? $this->tenant);
    }

    private function staff(string $role, string $pin, ?Tenant $tenant = null): User
    {
        $this->inTenant($tenant);

        $user = User::factory()->create(['tenant_id' => ($tenant ?? $this->tenant)->id]);
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

    private function signIn(User $user, string $pin): string
    {
        return $this->bearer($this->deviceToken)
            ->postJson('/api/v1/pos/auth/pin', ['user_id' => $user->id, 'pin' => $pin])
            ->assertCreated()->json('token');
    }

    private function till(?string $token = null): self
    {
        return $this->bearer($token ?? $this->cashierSession)
            ->withHeaders(['X-Pos-Local-Id' => (string) Str::uuid(), 'X-Pos-Seq' => '1']);
    }

    /** A pending question, raised by the cashier at this till. */
    private function asked(): int
    {
        return (int) $this->till()->postJson('/api/v1/pos/approvals', [
            'action' => 'void_order',
            'reason' => 'Mehmon buyurtmadan voz kechdi',
            'amount' => 4_500_000,
        ])->assertCreated()->json('data.id');
    }

    // ============ The door itself ============

    public function test_a_manager_pin_answers_the_question_on_the_cashiers_own_till(): void
    {
        $manager = $this->staff('branch-manager', '9999');
        $approvalId = $this->asked();

        $this->till()->postJson("/api/v1/pos/approvals/{$approvalId}/pin", [
            'user_id' => $manager->id, 'pin' => '9999', 'approved' => true,
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.approved_by.id', $manager->id)
            // Answered at a till, and the record says so — which is the point
            // of the endpoint rather than a detail of it.
            ->assertJsonPath('data.method', 'pin');
    }

    /**
     * The failure the whole endpoint exists to prevent.
     *
     * `auth/pin` takes the terminal over: whoever signs in closes whoever was
     * signed in. If a manager had to use that door, the waiter would be signed
     * out by the act of getting their own void approved — mid-service, with a
     * guest at the table.
     */
    public function test_the_cashier_is_still_signed_in_afterwards(): void
    {
        $manager = $this->staff('branch-manager', '9999');
        $approvalId = $this->asked();

        $this->till()->postJson("/api/v1/pos/approvals/{$approvalId}/pin", [
            'user_id' => $manager->id, 'pin' => '9999', 'approved' => true,
        ])->assertOk();

        $this->bearer($this->cashierSession)->getJson('/api/v1/pos/auth/session')
            ->assertOk()
            ->assertJsonPath('data.user.id', $this->cashier->id);
    }

    public function test_a_refusal_is_recorded_as_one(): void
    {
        $manager = $this->staff('branch-manager', '9999');
        $approvalId = $this->asked();

        $this->till()->postJson("/api/v1/pos/approvals/{$approvalId}/pin", [
            'user_id' => $manager->id, 'pin' => '9999', 'approved' => false,
        ])->assertOk()->assertJsonPath('data.status', 'rejected');
    }

    // ============ What it refuses ============

    public function test_a_wrong_pin_changes_nothing(): void
    {
        $manager = $this->staff('branch-manager', '9999');
        $approvalId = $this->asked();

        $this->till()->postJson("/api/v1/pos/approvals/{$approvalId}/pin", [
            'user_id' => $manager->id, 'pin' => '1234', 'approved' => true,
        ])->assertApiError('pos.pin_invalid');

        $this->assertSame('pending', PosApproval::query()->findOrFail($approvalId)->status);
    }

    /**
     * A cashier's own PIN is a valid PIN. It is not an authorisation.
     *
     * This is the door's one genuinely new risk: `decide` checks `pos.approve`
     * on the caller's token, and here the caller is the person being checked
     * up on. The permission therefore has to be read off whoever the PIN
     * belongs to, and this is the test that says so.
     */
    public function test_a_cashiers_own_pin_cannot_authorise(): void
    {
        $approvalId = $this->asked();

        $this->till()->postJson("/api/v1/pos/approvals/{$approvalId}/pin", [
            'user_id' => $this->cashier->id, 'pin' => '4821', 'approved' => true,
        ])->assertApiError('pos.approval_no_permission');

        $this->assertSame('pending', PosApproval::query()->findOrFail($approvalId)->status);
    }

    public function test_a_manager_cannot_sign_off_their_own_request(): void
    {
        $manager = $this->staff('branch-manager', '9999');

        // The manager is the one at the till this time, and asks for the void
        // themselves — then tries to answer it with their own four digits.
        $managerSession = $this->signIn($manager, '9999');
        $approvalId = (int) $this->till(token: $managerSession)->postJson('/api/v1/pos/approvals', [
            'action' => 'void_order', 'reason' => 'Xato buyurtma', 'amount' => 1_000_000,
        ])->assertCreated()->json('data.id');

        $this->till(token: $managerSession)->postJson("/api/v1/pos/approvals/{$approvalId}/pin", [
            'user_id' => $manager->id, 'pin' => '9999', 'approved' => true,
        ])->assertApiError('pos.approval_self');
    }

    /**
     * A manager PIN given for one till does not answer another till's queue.
     *
     * Without the terminal check a cashier holding a PIN they were legitimately
     * told — their own venue's manager — could answer any pending row in the
     * restaurant by guessing an id, including another branch's shift variance.
     */
    public function test_a_question_raised_at_another_till_is_not_answerable_here(): void
    {
        $manager = $this->staff('branch-manager', '9999');
        $approvalId = $this->asked();

        $this->inTenant();
        $other = Terminal::factory()->create(['code' => 'KASSA-2']);
        PosApproval::query()->whereKey($approvalId)->update(['terminal_id' => $other->id]);

        $this->till()->postJson("/api/v1/pos/approvals/{$approvalId}/pin", [
            'user_id' => $manager->id, 'pin' => '9999', 'approved' => true,
        ])->assertApiError('pos.approval_closed');

        $this->assertSame('pending', PosApproval::query()->findOrFail($approvalId)->status);
    }

    /**
     * Another restaurant's manager is answered exactly like a wrong PIN.
     *
     * Three codes for "wrong digits", "not enrolled" and "not your restaurant"
     * would be three answers to "does this person exist", typed on a keypad
     * anybody can reach.
     */
    public function test_another_restaurants_manager_is_refused_like_a_wrong_pin(): void
    {
        $stranger = Tenant::query()->create([
            'name' => 'Boshqa Restoran', 'slug' => 'boshqa-restoran', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $theirManager = $this->staff('branch-manager', '9999', $stranger);

        $this->inTenant();
        $approvalId = $this->asked();

        $this->till()->postJson("/api/v1/pos/approvals/{$approvalId}/pin", [
            'user_id' => $theirManager->id, 'pin' => '9999', 'approved' => true,
        ])->assertApiError('pos.pin_invalid');
    }

    public function test_the_four_digits_and_the_answer_are_both_required(): void
    {
        $approvalId = $this->asked();

        $this->till()->postJson("/api/v1/pos/approvals/{$approvalId}/pin", [
            'user_id' => $this->cashier->id,
        ])->assertStatus(422);
    }
}
