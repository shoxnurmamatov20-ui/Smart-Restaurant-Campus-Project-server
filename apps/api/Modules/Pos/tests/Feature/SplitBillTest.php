<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Orders\BillSplit;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Services\PinAuthenticator;
use Tests\TestCase;

/**
 * Dividing a bill by money — the split sheet's other two buttons.
 *
 * `split` by `line_ids` has always worked: four friends who each ate their own
 * thing hand over their own lines. The other two divide the MONEY, and the till
 * used to close the sheet and write nothing, saying so in its own comment:
 * *"there is no request this screen could send that would produce four equal
 * bills … the API has to mint the sibling bills itself."*
 *
 * The property every test here circles is the one a cashier reads four figures
 * out loud against: **the shares add back up to the bill**. A family that does
 * not is money collected from nobody, or a table that walks out owing.
 */
final class SplitBillTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Terminal $terminal;

    private string $deviceToken;

    private string $sessionToken;

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->terminal = Terminal::factory()->create(['code' => 'KASSA-1']);
        $this->deviceToken = $this->terminal->createToken('t', ['pos:terminal'])->plainTextToken;

        $this->cashier = $this->staff('cashier');
        $this->sessionToken = $this->signIn($this->cashier);
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
     * A table with a bill on it, worth what the caller asked for.
     *
     * Takeaway rather than dine-in, so the service charge does not enter the
     * arithmetic: these tests are about how a total is divided, not about how it
     * is arrived at, and `BillTotals` has its own tests for the second half.
     *
     * @return array{0: int, 1: int} the bill id and its total in tiyin
     */
    private function billWorth(int $tiyin): array
    {
        $this->inTenant();

        $dish = MenuItem::factory()->create([
            'sku' => 'OSH-001', 'price' => $tiyin, 'is_available' => true, 'status' => 'active',
        ]);

        $bill = $this->till()->postJson('/api/v1/pos/bills', [
            'channel' => 'takeaway', 'guests' => 4,
        ])->assertCreated()->json('data');

        $with = $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/lines", [
            'menu_item_id' => $dish->id, 'quantity' => 1,
        ])->assertOk()->json('data');

        return [(int) $bill['id'], (int) $with['total']];
    }

    // ============ An even split ============

    public function test_four_equal_bills_add_back_up_to_the_one_they_came_from(): void
    {
        [$billId, $total] = $this->billWorth(197_000_00);

        $answer = $this->till()->postJson("/api/v1/pos/bills/{$billId}/split", ['ways' => 4])
            ->assertCreated()->json('data');

        $family = $answer['split'];
        $this->assertCount(4, $family);

        $shares = array_map(static fn (array $bill): int => (int) $bill['total'], $family);

        // The property the whole feature exists for.
        $this->assertSame($total, array_sum($shares));

        // Three equal shares floored to a whole note, and the remainder on the
        // last — the design's own rule, mirrored from `guestShares()`.
        $each = BillSplit::share($total, 4);
        $this->assertSame([$each, $each, $each, $total - $each * 3], $shares);
        $this->assertNotSame($each, $shares[3], 'The rounding has to land somewhere.');
    }

    public function test_the_bill_that_was_split_keeps_the_food(): void
    {
        [$billId] = $this->billWorth(120_000_00);

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/split", ['ways' => 3])->assertCreated();

        $this->inTenant();

        /** @var Order $parent */
        $parent = Order::query()->withoutGlobalScope('branch')->findOrFail($billId);

        // Food cost is joined through the parent, which is why the lines stay
        // there and the siblings hold none. See the split migration.
        $this->assertSame(1, $parent->items()->count());
        $this->assertNull($parent->split_parent_id);

        $siblings = Order::query()->withoutGlobalScope('branch')
            ->where('split_parent_id', $billId)->get();

        $this->assertCount(2, $siblings);
        $this->assertSame(0, $siblings->sum(fn (Order $bill): int => $bill->items()->count()));
    }

    public function test_a_share_is_paid_for_rather_than_added_to(): void
    {
        [$billId] = $this->billWorth(100_000_00);
        $dish = MenuItem::query()->firstOrFail();

        $family = $this->till()->postJson("/api/v1/pos/bills/{$billId}/split", ['ways' => 2])
            ->assertCreated()->json('data.split');

        $shareId = $family[1]['id'];

        // Ordering another coffee once the money has been carved up is undoing
        // the split, not adding to a share: the arithmetic no longer derives
        // from the lines, so a line added here would be cooked and never charged.
        $this->till()->postJson("/api/v1/pos/bills/{$shareId}/lines", [
            'menu_item_id' => $dish->id, 'quantity' => 1,
        ])->assertApiError('pos.bill_refused');
    }

    // ============ A named amount ============

    public function test_one_guest_puts_in_a_figure_and_the_table_settles_the_rest(): void
    {
        [$billId, $total] = $this->billWorth(180_000_00);

        $family = $this->till()->postJson("/api/v1/pos/bills/{$billId}/split", [
            'amount_tiyin' => 50_000_00,
        ])->assertCreated()->json('data.split');

        $this->assertCount(2, $family);
        // Not floored to a note: this is money somebody has already handed over
        // or typed into a card terminal, and rounding it would change what they
        // paid.
        $this->assertSame(50_000_00, (int) $family[0]['total']);
        $this->assertSame($total - 50_000_00, (int) $family[1]['total']);
    }

    public function test_paying_the_whole_bill_is_not_a_split(): void
    {
        [$billId, $total] = $this->billWorth(60_000_00);

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/split", ['amount_tiyin' => $total])
            ->assertApiError('pos.bill_refused');
    }

    // ============ Refusals ============

    public function test_one_guest_is_not_a_split_and_thirteen_is_not_either(): void
    {
        [$billId] = $this->billWorth(60_000_00);

        $this->till()->postJson("/api/v1/pos/bills/{$billId}/split", ['ways' => 1])->assertStatus(422);
        $this->till()->postJson("/api/v1/pos/bills/{$billId}/split", ['ways' => 13])->assertStatus(422);
    }

    public function test_a_bill_cannot_be_divided_two_ways_at_once(): void
    {
        [$billId] = $this->billWorth(60_000_00);

        // A till that meant one of them and sent two has a bug, and guessing
        // which would produce a bill nobody asked for in front of a guest.
        $this->till()->postJson("/api/v1/pos/bills/{$billId}/split", [
            'ways' => 2, 'amount_tiyin' => 1000,
        ])->assertStatus(422);
    }

    public function test_a_family_cannot_be_split_again(): void
    {
        [$billId] = $this->billWorth(90_000_00);

        $family = $this->till()->postJson("/api/v1/pos/bills/{$billId}/split", ['ways' => 3])
            ->assertCreated()->json('data.split');

        // The parent: the shares are what is owed now, and dividing them again
        // would be computed against money that has already been handed out.
        $this->till()->postJson("/api/v1/pos/bills/{$billId}/split", ['ways' => 2])
            ->assertApiError('pos.bill_refused');

        // And a share: `split_parent_id` has one level in it on purpose — a
        // receipt says "2/4", never "2/4 of 1/3".
        $this->till()->postJson("/api/v1/pos/bills/{$family[1]['id']}/split", ['ways' => 2])
            ->assertApiError('pos.bill_refused');
    }

    public function test_an_empty_bill_has_nothing_to_divide(): void
    {
        $bill = $this->till()->postJson('/api/v1/pos/bills', ['channel' => 'takeaway'])
            ->assertCreated()->json('data');

        // Shares of zero are a family of bills nobody can settle, sitting open
        // on a table for ever.
        $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/split", ['ways' => 2])
            ->assertApiError('pos.bill_refused');
    }

    // ============ Offline ============

    public function test_a_split_queued_in_a_basement_divides_the_same_way_when_it_drains(): void
    {
        [$billId, $total] = $this->billWorth(197_000_00);

        $answer = $this->till()->postJson('/api/v1/pos/sync/batch', [
            'entries' => [[
                'local_id' => (string) Str::uuid(),
                'local_seq' => 1,
                'action' => 'bill.split',
                'payload' => ['bill_id' => $billId, 'ways' => 4],
                'happened_at' => now()->toIso8601String(),
            ]],
        ])->assertOk();

        $this->inTenant();

        $family = Order::query()->withoutGlobalScope('branch')
            ->where('split_parent_id', $billId)->get();

        $this->assertCount(3, $family);
        $this->assertSame('accepted', $answer->json('data.0.status'));

        /** @var Order $parent */
        $parent = Order::query()->withoutGlobalScope('branch')->findOrFail($billId);
        $this->assertSame($total, (int) $parent->total + (int) $family->sum('total'));
    }

    public function test_a_ways_of_nine_hundred_is_refused_at_the_queue_door_too(): void
    {
        [$billId] = $this->billWorth(90_000_00);

        // `sync/batch` is the other door onto the same dispatcher, and a queue
        // entry never passes through MoveBillRequest.
        $this->till()->postJson('/api/v1/pos/sync/batch', [
            'entries' => [[
                'local_id' => (string) Str::uuid(),
                'local_seq' => 1,
                'action' => 'bill.split',
                'payload' => ['bill_id' => $billId, 'ways' => 900],
                'happened_at' => now()->toIso8601String(),
            ]],
        ])->assertStatus(422);
    }
}
