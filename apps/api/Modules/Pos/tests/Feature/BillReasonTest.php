<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\OrderItem;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Services\PinAuthenticator;
use Tests\TestCase;

/**
 * Nothing comes off a bill without a sentence attached.
 *
 * `BillActionRequest` has said so since it was written — *"A void with no
 * reason is exactly the record an investigation cannot use, and 'the field was
 * optional' is how it ends up empty on the ones that matter"* — and nothing
 * asserted it. A rule with no test is a rule until somebody relaxes a validator
 * to unblock a screen.
 *
 * Three doors take money off a bill and all three are checked here: voiding a
 * line, voiding the whole bill, and refunding a payment. The fourth — a
 * discount — is covered by `ApprovalLadderTest`, which has to send a reason to
 * get as far as the gate.
 */
final class BillReasonTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private string $deviceToken;

    private string $sessionToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        $terminal = Terminal::factory()->create(['code' => 'KASSA-1']);
        $this->deviceToken = $terminal->createToken('t', ['pos:terminal'])->plainTextToken;

        // A manager, so the approval gate waves the void through and what is
        // being tested is the reason rather than the signature.
        $this->sessionToken = $this->signIn($this->staff('branch-manager'));
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
            ->assertCreated()
            ->json('token');
    }

    private function till(?string $localId = null): self
    {
        return $this->bearer($this->sessionToken)
            ->withHeaders(['X-Pos-Local-Id' => $localId ?? (string) Str::uuid(), 'X-Pos-Seq' => '1']);
    }

    /**
     * A fired bill with one line on it.
     *
     * @return array{0: int, 1: int} the bill id and its first line id
     */
    private function bill(): array
    {
        $this->inTenant();

        $dish = MenuItem::factory()->create([
            'sku' => 'OSH-001', 'price' => 45_000_00, 'is_available' => true, 'status' => 'active',
        ]);

        $bill = $this->till()->postJson('/api/v1/pos/bills', ['channel' => 'takeaway'])
            ->assertCreated()->json('data');

        $with = $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/lines", [
            'menu_item_id' => $dish->id, 'quantity' => 1,
        ])->assertOk()->json('data');

        return [(int) $bill['id'], (int) $with['lines'][0]['id']];
    }

    // ============ A line ============

    public function test_a_line_cannot_be_voided_without_saying_why(): void
    {
        [$billId, $lineId] = $this->bill();

        $this->till()->deleteJson("/api/v1/pos/bills/{$billId}/lines/{$lineId}", [])
            ->assertStatus(422)
            ->assertApiValidationErrors('reason');
    }

    public function test_three_characters_is_the_floor(): void
    {
        [$billId, $lineId] = $this->bill();

        // "x" is what somebody types to get past a required field. The minimum
        // is not a formality — it is what makes the loss-prevention report
        // readable.
        $this->till()->deleteJson("/api/v1/pos/bills/{$billId}/lines/{$lineId}", ['reason' => 'x'])
            ->assertStatus(422);
    }

    public function test_a_reason_is_kept_on_the_line_it_explains(): void
    {
        [$billId, $lineId] = $this->bill();

        $this->till()->deleteJson("/api/v1/pos/bills/{$billId}/lines/{$lineId}", [
            'reason' => 'Mehmon fikridan qaytdi',
        ])->assertOk();

        $this->inTenant();

        $line = OrderItem::query()->withoutGlobalScope('branch')->findOrFail($lineId);

        // The line stays visible and carries the sentence: "which lines were
        // removed, by whom, and why" is the most useful question in a
        // restaurant fraud investigation.
        $this->assertStringContainsString('Mehmon fikridan qaytdi', (string) $line->note);
        $this->assertSame(0, (int) $line->total_price);
    }

    // ============ A whole bill ============

    public function test_a_bill_cannot_be_voided_without_saying_why(): void
    {
        [$billId] = $this->bill();

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/cancel", [])
            ->assertStatus(422)
            ->assertApiValidationErrors('reason');
    }

    public function test_a_comp_needs_one_too(): void
    {
        [$billId] = $this->bill();

        // A comp is not a void and not a hundred percent discount, but it is the
        // same question: the food was made and nobody paid, so somebody has to
        // say why.
        $this->till()->postJson("/api/v1/pos/bills/{$billId}/comp", [])
            ->assertStatus(422)
            ->assertApiValidationErrors('reason');
    }

    // ============ A refund ============

    public function test_a_refund_cannot_be_taken_out_of_the_drawer_without_saying_why(): void
    {
        // The payment id is never reached: validation runs first, which is the
        // point — the rule must not depend on the payment existing.
        $this->till()->postJson('/api/v1/pos/payments/1/refund', [])
            ->assertStatus(422)
            ->assertApiValidationErrors('reason');
    }
}
