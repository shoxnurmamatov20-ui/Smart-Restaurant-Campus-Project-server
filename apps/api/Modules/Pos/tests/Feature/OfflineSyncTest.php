<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Contracts\Menu\StopList;
use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Modules\Finance\Models\Payment;
use Modules\Menu\Models\MenuItem;
use Modules\Orders\Models\Order;
use Modules\Pos\Models\PosApproval;
use Modules\Pos\Models\PosSyncEntry;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Services\PinAuthenticator;
use Tests\TestCase;

/**
 * The evening the router died, handed back the next morning.
 *
 * Everything here is one promise: **nothing is lost and nothing is doubled.**
 * A shift sold on a tablet with no network is real money and real food, so the
 * queue must apply in full, exactly once, in the order the cashier worked — and
 * where the world moved underneath it, a person must be asked rather than a
 * default chosen quietly.
 *
 * The four properties, and what each one costs when it breaks:
 *
 *   - **Replay is not a second sale.** Drain the same queue twice and there is
 *     one bill and one payment. Get this wrong and a table is charged twice for
 *     a meal they ate once.
 *   - **`local_seq` is the order of service.** A queue drained as it arrived is
 *     a bill paid before it was opened.
 *   - **A conflict is a question, not a failure.** Six kinds, each with its
 *     options in the order a screen should offer them — and two of those orders
 *     are deliberately against the reflex.
 *   - **The queue is not a way round the guards.** A waiter who cannot void a
 *     bill at the till cannot void one by queueing it, and a discount above a
 *     cashier's ceiling still waits for a manager.
 */
final class OfflineSyncTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

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

        /*
         * A branch, which SellFlowTest does without and this cannot.
         *
         * The stop list is a fact about one kitchen: `EloquentStopList` answers
         * nothing at all when no branch is resolved, so the `item_unavailable`
         * conflict would never fire and the test would pass by being unable to
         * ask the question.
         */
        $this->branch = Branch::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->inTenant();

        $this->terminal = Terminal::factory()->create([
            'code' => 'KASSA-1',
            'branch_id' => $this->branch->id,
        ]);
        $this->deviceToken = $this->terminal->createToken('t', ['pos:terminal'])->plainTextToken;

        $this->cashier = $this->staff('cashier');
        $this->sessionToken = $this->signIn($this->cashier);
    }

    // ============ Harness ============

    /**
     * Fixtures created after an HTTP call need the tenant and the branch put back
     * — both middlewares clear their context in a `finally` when a request ends,
     * which is right in production and a trap in a feature test.
     */
    private function inTenant(): void
    {
        app(TenantContext::class)->set($this->tenant);
        app(BranchContext::class)->set($this->branch);
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
            'X-Branch' => $this->branch->slug,
        ]);
    }

    private function signIn(User $user, string $pin = '4821'): string
    {
        return $this->bearer($this->deviceToken)
            ->postJson('/api/v1/pos/auth/pin', ['user_id' => $user->id, 'pin' => $pin])
            ->assertCreated()->json('token');
    }

    /** A live till request, stamped with a fresh device-side id. */
    private function till(?string $token = null): self
    {
        return $this->bearer($token ?? $this->sessionToken)
            ->withHeaders(['X-Pos-Local-Id' => (string) Str::uuid(), 'X-Pos-Seq' => '1']);
    }

    /**
     * A batch, sent the way a till sends one: no `X-Pos-Local-Id` on the request
     * itself, because the ids are inside it, one per queued operation.
     *
     * @param  array<int, array<string, mixed>>  $entries
     */
    private function drain(array $entries, ?string $token = null): TestResponse
    {
        return $this->bearer($token ?? $this->sessionToken)
            ->postJson('/api/v1/pos/sync/batch', ['entries' => $entries]);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function entry(string $action, array $payload, int $seq = 1, ?string $localId = null): array
    {
        return [
            'local_id' => $localId ?? (string) Str::uuid(),
            'local_seq' => $seq,
            'action' => $action,
            'payload' => $payload,
        ];
    }

    private function dish(int $price = 4_500_000, string $sku = 'OSH-001'): MenuItem
    {
        $this->inTenant();

        return MenuItem::factory()->create([
            'sku' => $sku, 'price' => $price, 'is_available' => true, 'status' => 'active',
        ]);
    }

    private function openShift(): void
    {
        $this->till()->postJson('/api/v1/pos/shifts/open', ['opening_cash' => 10_000_000])
            ->assertCreated();
    }

    /**
     * A bill with one dish on it, opened over HTTP the way a till with a network
     * would have. Returns [bill id, total].
     *
     * @return array{0: int, 1: int}
     */
    private function liveBill(MenuItem $dish, ?int $tableId = null): array
    {
        $bill = $this->till()->postJson('/api/v1/pos/bills', array_filter([
            'channel' => 'dine_in', 'table_id' => $tableId, 'guests' => 2,
        ]))->assertCreated()->json('data');

        $withLine = $this->till()->postJson("/api/v1/pos/bills/{$bill['id']}/lines", [
            'menu_item_id' => $dish->id, 'quantity' => 1,
        ])->assertOk()->json('data');

        return [(int) $withLine['id'], (int) $withLine['total']];
    }

    /** Take the money over HTTP, so the bill is genuinely settled. */
    private function settle(int $billId, int $total): void
    {
        $this->till()->postJson("/api/v1/pos/bills/{$billId}/tenders", [
            'tenders' => [['method' => 'cash', 'amount' => $total]],
        ])->assertOk();
    }

    // ============ The whole reason this exists ============

    public function test_a_queue_replayed_twice_writes_one_bill_and_one_payment(): void
    {
        $dish = $this->dish();
        $this->openShift();

        $opening = (string) Str::uuid();

        /*
         * Deliberately handed over backwards.
         *
         * A device sends what its queue table gives it, and nothing promises that
         * is chronological. If the batch did not sort by `local_seq`, the line
         * would arrive before the bill it belongs to and the payment before
         * either — which in this fixture fails loudly, because the two later
         * entries name the opening entry rather than a bill id they could not
         * have known.
         */
        $queue = [
            $this->entry('bill.tender', [
                'bill_local_id' => $opening,
                'tenders' => [['method' => 'cash', 'amount' => 4_500_000]],
            ], seq: 3),
            $this->entry('bill.line.add', [
                'bill_local_id' => $opening, 'menu_item_id' => $dish->id, 'quantity' => 1,
            ], seq: 2),
            $this->entry('bill.open', [
                'channel' => 'dine_in', 'table_label' => 'A-7', 'guests' => 2,
            ], seq: 1, localId: $opening),
        ];

        $first = $this->drain($queue)->assertOk();

        $this->assertSame(3, $first->json('summary.accepted'));
        $this->assertSame(0, $first->json('summary.outstanding'));
        // Answered in the order they were worked, not the order they arrived.
        $this->assertSame(
            ['bill.open', 'bill.line.add', 'bill.tender'],
            array_column((array) $first->json('data'), 'action'),
        );

        // The router flickers and the till, having lost the response, sends the
        // whole queue again. This is the moment the guest gets charged twice, or
        // does not.
        $second = $this->drain($queue)->assertOk();

        $this->assertSame(3, $second->json('summary.duplicate'));
        $this->assertSame(0, $second->json('summary.accepted'));
        $this->assertSame($first->json('data.2.result'), $second->json('data.2.result'));

        $this->assertSame(1, Order::query()->count());
        $this->assertSame(1, Payment::query()->count());
        $this->assertSame(4_500_000, (int) Payment::query()->sum('amount'));
        // Three operations, three rows — the second attempt claimed nothing new.
        $this->assertSame(3, PosSyncEntry::query()->count());
    }

    public function test_a_line_whose_bill_never_opened_is_not_guessed_at(): void
    {
        $dish = $this->dish();

        // The pointer names an entry that is not in this batch at all. Landing
        // the line on some other bill would put a guest's food on a stranger's
        // table, so it fails and stays in the queue.
        $row = $this->drain([
            $this->entry('bill.line.add', [
                'bill_local_id' => (string) Str::uuid(), 'menu_item_id' => $dish->id,
            ], seq: 1),
        ])->assertApiError('pos.bill_refused');

        $this->assertSame(0, Order::query()->count());
        $this->assertIsString($row->json('error.detail'));
    }

    // ============ The six questions ============

    public function test_a_bill_settled_while_the_till_was_away_asks_before_it_writes(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId, $total] = $this->liveBill($dish);
        $this->settle($billId, $total);

        $answer = $this->drain([
            $this->entry('bill.line.add', ['bill_id' => $billId, 'menu_item_id' => $dish->id]),
        ])->assertApiError('pos.conflict_bill_settled');

        $this->assertSame('bill_settled', $answer->json('error.conflict_kind'));
        // Discarding is offered LAST: the lines are real, the guest ate them.
        $this->assertSame(['reopen', 'new_bill', 'discard'], $answer->json('error.options'));
    }

    public function test_a_second_payment_for_a_paid_bill_asks_before_it_charges(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId, $total] = $this->liveBill($dish);
        $this->settle($billId, $total);

        $answer = $this->drain([
            $this->entry('bill.tender', [
                'bill_id' => $billId,
                'tenders' => [['method' => 'cash', 'amount' => $total]],
            ]),
        ])->assertApiError('pos.conflict_payment_duplicate');

        $this->assertSame('payment_duplicate', $answer->json('error.conflict_kind'));
        $this->assertSame(['discard', 'refund_duplicate'], $answer->json('error.options'));
        // And nothing was taken while the question is open.
        $this->assertSame(1, Payment::query()->count());
    }

    public function test_a_dish_stopped_during_the_outage_defaults_to_keeping_the_sale(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId] = $this->liveBill($this->dish(500_000, 'CHOY-001'));

        $this->inTenant();
        $this->assertTrue(app(StopList::class)->stop($dish->id, "go'sht tugadi"));

        $answer = $this->drain([
            $this->entry('bill.line.add', ['bill_id' => $billId, 'menu_item_id' => $dish->id]),
        ])->assertApiError('pos.conflict_item_unavailable');

        $this->assertSame('item_unavailable', $answer->json('error.conflict_kind'));

        /*
         * `keep` first, against the instinct to refuse a sold-out dish.
         *
         * The food was cooked at eight and the kitchen ran out at nine. Voiding
         * the line now means the stock left the building and the money did not,
         * which is the version an inventory count cannot explain.
         */
        $this->assertSame(['keep', 'substitute', 'void_line'], $answer->json('error.options'));
    }

    public function test_a_price_that_moved_defaults_to_the_one_the_guest_was_told(): void
    {
        $dish = $this->dish(4_500_000);
        $this->openShift();
        [$billId] = $this->liveBill($dish);

        $answer = $this->drain([
            $this->entry('bill.line.add', [
                'bill_id' => $billId,
                'menu_item_id' => $dish->id,
                // What the board said during happy hour, quoted back off the
                // till's own local price book.
                'unit_price' => 3_000_000,
            ]),
        ])->assertApiError('pos.conflict_price_moved');

        $this->assertSame('price_moved', $answer->json('error.conflict_kind'));
        $this->assertSame(['honour_quoted', 'reprice'], $answer->json('error.options'));
        $this->assertSame(3_000_000, $answer->json('error.context.quoted_price'));
        $this->assertSame(4_500_000, $answer->json('error.context.current_price'));
    }

    public function test_a_table_somebody_else_seated_asks_rather_than_refuses(): void
    {
        $dish = $this->dish();
        $this->openShift();
        // Another waiter covered the room during the outage and this table is
        // already live on the server.
        $this->liveBill($dish, tableId: 7);

        $answer = $this->drain([
            $this->entry('bill.open', ['channel' => 'dine_in', 'table_id' => 7, 'guests' => 3]),
        ])->assertApiError('pos.conflict_table_taken');

        $this->assertSame('table_taken', $answer->json('error.conflict_kind'));
        $this->assertSame(['merge', 'separate_bill', 'move_table'], $answer->json('error.options'));
        $this->assertCount(1, (array) $answer->json('error.context.open_bills'));
    }

    public function test_money_taken_in_a_counted_drawer_defaults_to_amending_it(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId, $total] = $this->liveBill($dish);

        $answer = $this->drain([
            $this->entry('bill.tender', [
                'bill_id' => $billId,
                // The shift the notes actually went into, closed and counted
                // hours ago.
                'shift_id' => 999_999,
                'tenders' => [['method' => 'cash', 'amount' => $total]],
            ]),
        ])->assertApiError('pos.conflict_shift_closed');

        $this->assertSame('shift_closed', $answer->json('error.conflict_kind'));

        /*
         * `amend_closed` first, and this is the ordering most likely to be
         * "corrected" by somebody who has not counted a drawer.
         *
         * Posting it to today double-counts the same notes: they went into
         * yesterday's till, yesterday's Z already reported them as an unexplained
         * surplus, and booking them again today makes them revenue a second time.
         */
        $this->assertSame(['amend_closed', 'post_to_current'], $answer->json('error.options'));
        $this->assertSame(0, Payment::query()->count());
    }

    public function test_every_conflict_kind_is_answerable_and_none_is_a_dead_end(): void
    {
        $kinds = (array) $this->bootstrap()->json('sync.conflicts');

        $this->assertCount(6, $kinds);

        foreach ($kinds as $kind) {
            // A kind with one option is not a question, and a kind with none is
            // a screen that can only say "sync failed" and offer Retry — which is
            // what a cashier taps until the queue empties or they give up.
            $this->assertGreaterThanOrEqual(2, count($kind['options']));
            $this->assertSame('pos.conflict_'.$kind['kind'], $kind['code']);
        }
    }

    // ============ Answering the six ============

    /**
     * The other half. Everything above proves the till is ASKED; nothing above
     * proves an answer does anything, and an unanswerable question is a queue
     * that never drains — which is the failure the whole conflict design exists
     * to avoid.
     *
     * @param  array<string, mixed>  $with
     */
    private function answer(
        string $kind,
        string $option,
        string $action,
        array $payload,
        array $with = [],
        ?string $localId = null,
        ?string $token = null,
    ): TestResponse {
        return $this->bearer($token ?? $this->sessionToken)
            ->postJson('/api/v1/pos/sync/resolve', [
                'local_id' => $localId ?? (string) Str::uuid(),
                'local_seq' => 1,
                'action' => $action,
                'payload' => $payload,
                'conflict_kind' => $kind,
                'option' => $option,
                'with' => $with,
            ]);
    }

    public function test_reopening_a_settled_bill_lets_the_queued_line_land_on_it(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId, $total] = $this->liveBill($dish);
        $this->settle($billId, $total);

        $answered = $this->answer('bill_settled', 'reopen', 'bill.line.add', [
            'bill_id' => $billId,
            'menu_item_id' => $dish->id,
        ], ['reason' => 'Mehmon yana bitta osh oldi'])->assertOk();

        $this->assertTrue($answered->json('data.applied'));
        $this->assertSame('bill_settled:reopen', $answered->json('data.resolution'));

        // The line is on the bill the guest already paid for, which is the whole
        // point: they ate it, and somebody has to be charged.
        $this->assertSame(2, count((array) $answered->json('data.result.lines')));
    }

    public function test_a_new_bill_carries_the_lines_the_settled_one_closed_too_early_for(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId, $total] = $this->liveBill($dish, tableId: 12);
        $this->settle($billId, $total);

        $answered = $this->answer('bill_settled', 'new_bill', 'bill.line.add', [
            'bill_id' => $billId,
            'menu_item_id' => $dish->id,
        ])->assertOk();

        $fresh = (int) $answered->json('data.result.id');

        // A different bill, on the same table, and the settled one untouched —
        // the guest signed for that one and it must still say what they signed.
        $this->assertNotSame($billId, $fresh);
        $this->assertSame(12, $answered->json('data.result.table_id'));
        $this->assertSame('paid', Order::query()->whereKey($billId)->value('status'));
    }

    public function test_discarding_a_duplicate_payment_takes_no_money_and_closes_the_question(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId, $total] = $this->liveBill($dish);
        $this->settle($billId, $total);

        $answered = $this->answer('payment_duplicate', 'discard', 'bill.tender', [
            'bill_id' => $billId,
            'tenders' => [['method' => 'cash', 'amount' => $total]],
        ])->assertOk();

        $this->assertFalse($answered->json('data.applied'));
        $this->assertSame('resolved', $answered->json('data.status'));

        // One meal, one payment. The other till already took it.
        $this->assertSame(1, Payment::query()->count());
    }

    public function test_a_guest_charged_twice_gets_a_payment_and_a_refund_rather_than_a_hole(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId, $total] = $this->liveBill($dish);
        $this->settle($billId, $total);

        $answered = $this->answer('payment_duplicate', 'refund_duplicate', 'bill.tender', [
            'bill_id' => $billId,
            'tenders' => [['method' => 'card', 'amount' => $total]],
        ])->assertOk();

        $captured = (array) $answered->json('data.result.payment_ids');
        $refunded = (array) $answered->json('data.result.refunded_payment_ids');

        /*
         * Two movements, netting to nothing — not "record neither".
         *
         * The card capture exists at the acquirer whatever this system decides,
         * so a reconciliation against the bank statement has to find it here too,
         * and a refund with no payment behind it is a movement an accountant
         * cannot explain.
         */
        $this->assertCount(1, $captured);
        $this->assertCount(1, $refunded);
        $this->assertSame('refunded', Payment::query()->whereKey($refunded[0])->value('status'));

        /*
         * And the bill is left exactly as the guest signed for it.
         *
         * This is the half that was wrong first time round: the obvious shape is
         * "apply the tender, then refund what comes back", and it cannot work —
         * `TenderService` refuses to settle a bill that is already settled, or
         * the bill would close twice.
         */
        $this->assertSame('paid', Order::query()->whereKey($billId)->value('status'));
    }

    public function test_keeping_a_stopped_dish_writes_the_line_the_kitchen_already_cooked(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId] = $this->liveBill($this->dish(500_000, 'CHOY-001'));

        $this->inTenant();
        app(StopList::class)->stop($dish->id, "go'sht tugadi");

        $answered = $this->answer('item_unavailable', 'keep', 'bill.line.add', [
            'bill_id' => $billId,
            'menu_item_id' => $dish->id,
        ])->assertOk();

        // The stop list is not asked twice. `apply()` never checks it and the
        // resolve path never calls `conflictsFor()`, so this lands rather than
        // bouncing off the same refusal forever.
        $this->assertTrue($answered->json('data.applied'));
        $this->assertSame(2, count((array) $answered->json('data.result.lines')));
    }

    public function test_a_substitute_is_charged_at_its_own_price_and_not_the_stopped_one(): void
    {
        $stopped = $this->dish(4_500_000);
        $instead = $this->dish(2_000_000, 'LAGMON-001');
        $this->openShift();
        [$billId] = $this->liveBill($this->dish(500_000, 'CHOY-001'));

        $this->inTenant();
        app(StopList::class)->stop($stopped->id, "go'sht tugadi");

        $answered = $this->answer('item_unavailable', 'substitute', 'bill.line.add', [
            'bill_id' => $billId,
            'menu_item_id' => $stopped->id,
            // What the guest was quoted for the dish that is now gone.
            'unit_price' => 4_500_000,
        ], ['substitute_menu_item_id' => $instead->id])->assertOk();

        $lines = (array) $answered->json('data.result.lines');
        $added = end($lines);

        /*
         * The quoted price is dropped with the dish it belonged to.
         *
         * Carrying 4 500 000 onto a 2 000 000 lagmon charges the guest for plov
         * they did not get. With no override the catalogue decides, which is the
         * only defensible answer for a dish nobody quoted.
         */
        $this->assertSame($instead->id, (int) $added['menu_item_id']);
        $this->assertSame(2_000_000, (int) $added['unit_price']);
    }

    public function test_voiding_the_line_leaves_the_bill_as_it_was(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId] = $this->liveBill($this->dish(500_000, 'CHOY-001'));

        $this->inTenant();
        app(StopList::class)->stop($dish->id, "go'sht tugadi");

        $answered = $this->answer('item_unavailable', 'void_line', 'bill.line.add', [
            'bill_id' => $billId,
            'menu_item_id' => $dish->id,
        ])->assertOk();

        $this->assertFalse($answered->json('data.applied'));
        $this->assertSame(1, Order::query()->whereKey($billId)->first()?->items()->count());
    }

    public function test_honouring_the_quoted_price_charges_what_the_guest_was_told(): void
    {
        $dish = $this->dish(4_500_000);
        $this->openShift();
        [$billId] = $this->liveBill($dish);

        $answered = $this->answer('price_moved', 'honour_quoted', 'bill.line.add', [
            'bill_id' => $billId,
            'menu_item_id' => $dish->id,
            'unit_price' => 3_000_000,
        ])->assertOk();

        $lines = (array) $answered->json('data.result.lines');
        $added = end($lines);

        $this->assertSame(3_000_000, (int) $added['unit_price']);
    }

    public function test_repricing_charges_the_catalogue_rather_than_the_old_board(): void
    {
        $dish = $this->dish(4_500_000);
        $this->openShift();
        [$billId] = $this->liveBill($dish);

        $answered = $this->answer('price_moved', 'reprice', 'bill.line.add', [
            'bill_id' => $billId,
            'menu_item_id' => $dish->id,
            'unit_price' => 3_000_000,
        ])->assertOk();

        $lines = (array) $answered->json('data.result.lines');
        $added = end($lines);

        $this->assertSame(4_500_000, (int) $added['unit_price']);
    }

    public function test_merging_a_taken_table_opens_nothing_and_names_the_bill_to_use(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$liveId] = $this->liveBill($dish, tableId: 7);

        $before = Order::query()->count();

        $answered = $this->answer('table_taken', 'merge', 'bill.open', [
            'channel' => 'dine_in', 'table_id' => 7, 'guests' => 3,
        ], ['into_bill_id' => $liveId])->assertOk();

        $this->assertFalse($answered->json('data.applied'));
        $this->assertSame($before, Order::query()->count());

        /*
         * The id the rest of the queue now means.
         *
         * Everything queued behind a `bill.open` points at "the bill that entry
         * opened". Without this the till has resolved the conflict and has no
         * idea where to send the four lines sitting behind it.
         */
        $this->assertSame($liveId, (int) $answered->json('data.result.id'));
    }

    public function test_a_separate_bill_is_allowed_because_a_table_may_carry_several(): void
    {
        $dish = $this->dish();
        $this->openShift();
        $this->liveBill($dish, tableId: 7);

        $answered = $this->answer('table_taken', 'separate_bill', 'bill.open', [
            'channel' => 'dine_in', 'table_id' => 7, 'guests' => 3,
        ])->assertOk();

        $this->assertTrue($answered->json('data.applied'));
        $this->assertSame(7, $answered->json('data.result.table_id'));
    }

    public function test_moving_the_table_opens_the_bill_somewhere_else(): void
    {
        $dish = $this->dish();
        $this->openShift();
        $this->liveBill($dish, tableId: 7);

        $answered = $this->answer('table_taken', 'move_table', 'bill.open', [
            'channel' => 'dine_in', 'table_id' => 7, 'guests' => 3,
        ], ['table_id' => 9, 'table_label' => '9'])->assertOk();

        $this->assertSame(9, $answered->json('data.result.table_id'));
        $this->assertSame('9', $answered->json('data.result.table_label'));
    }

    public function test_posting_to_the_current_shift_uses_the_drawer_that_is_open(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId, $total] = $this->liveBill($dish);

        $answered = $this->answer('shift_closed', 'post_to_current', 'bill.tender', [
            'bill_id' => $billId,
            'shift_id' => 999_999,
            'tenders' => [['method' => 'cash', 'amount' => $total]],
        ])->assertOk();

        $this->assertTrue($answered->json('data.applied'));

        $payment = Payment::query()->latest('id')->first();
        $this->assertNotNull($payment);
        // The open drawer, not the one the entry named.
        $this->assertNotSame(999_999, (int) $payment->cash_shift_id);
    }

    // ============ Answers that must be refused ============

    public function test_an_option_that_belongs_to_another_conflict_is_refused_by_name(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId] = $this->liveBill($dish);

        /*
         * `reopen` is a bill_settled answer. Applied to a price conflict it would
         * unseal a bill nobody asked to unseal — so a stale client is told what
         * this kind actually offers rather than being quietly defaulted.
         */
        $refusal = $this->answer('price_moved', 'reopen', 'bill.line.add', [
            'bill_id' => $billId, 'menu_item_id' => $dish->id, 'unit_price' => 1,
        ])->assertApiError('pos.conflict_option_unknown');

        $this->assertSame(['honour_quoted', 'reprice'], $refusal->json('error.options'));
    }

    public function test_an_answer_missing_what_it_needs_names_the_missing_field(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId] = $this->liveBill($dish);

        $refusal = $this->answer('item_unavailable', 'substitute', 'bill.line.add', [
            'bill_id' => $billId, 'menu_item_id' => $dish->id,
        ])->assertApiError('pos.conflict_option_incomplete');

        $this->assertSame('substitute_menu_item_id', $refusal->json('error.field'));
    }

    public function test_a_till_cannot_grant_itself_the_stop_list_exemption(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId] = $this->liveBill($this->dish(500_000, 'CHOY-001'));

        $this->inTenant();
        app(StopList::class)->stop($dish->id, "go'sht tugadi");

        /*
         * `served_before_stop` is what `keep` writes after a person has been
         * shown the question and answered it. A device that could put it in its
         * own JSON would sell a stopped dish all evening by claiming every plate
         * was cooked before the stop — so the key is stripped off anything a
         * client sends, on both the batch and the resolve path.
         *
         * Stripped and not refused: a queue that 422s on a key it should not
         * have sent is a queue that never drains, and the entry behind it is real
         * money. Dropping the key applies the write on the terms the till was
         * actually entitled to — which here means the conflict is still raised.
         */
        $this->drain([
            $this->entry('bill.line.add', [
                'bill_id' => $billId,
                'menu_item_id' => $dish->id,
                'served_before_stop' => "o'zim ruxsat berdim",
            ]),
        ])->assertApiError('pos.conflict_item_unavailable');

        $this->answer('price_moved', 'honour_quoted', 'bill.line.add', [
            'bill_id' => $billId,
            'menu_item_id' => $dish->id,
            'unit_price' => 4_500_000,
            'served_before_stop' => "o'zim ruxsat berdim",
        ])->assertApiError('pos.bill_refused');
    }

    public function test_resolving_twice_writes_once(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId] = $this->liveBill($dish);

        $localId = (string) Str::uuid();
        $payload = ['bill_id' => $billId, 'menu_item_id' => $dish->id, 'unit_price' => 3_000_000];

        $this->answer('price_moved', 'honour_quoted', 'bill.line.add', $payload, localId: $localId)
            ->assertOk();

        $again = $this->answer('price_moved', 'honour_quoted', 'bill.line.add', $payload, localId: $localId)
            ->assertOk();

        /*
         * A resolve is retried for the same reasons a batch is — the answer was
         * sent, the connection dropped, the till does not know whether it landed.
         * The same idempotency guard on the same `local_id` is what stops the
         * guest being charged for two plates because a router hiccupped.
         */
        $this->assertSame('duplicate', $again->json('data.status'));
        $this->assertSame(2, count((array) $again->json('data.result.lines')));
    }

    public function test_a_waiter_cannot_resolve_their_way_into_a_void(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId] = $this->liveBill($dish);

        $waiter = $this->staff('waiter', '1357');
        $waiterToken = $this->signIn($waiter, '1357');

        /*
         * The verb is checked against the person again, exactly as `batch()`
         * checks it. Without this, a conflict would be a door round every
         * permission in the module: queue the void, get a conflict on something
         * else, and answer your way through.
         */
        $this->answer(
            'bill_settled',
            'reopen',
            'bill.cancel',
            ['bill_id' => $billId, 'reason' => 'mehmon ketdi'],
            token: $waiterToken,
        )->assertApiError('pos.sync_action_forbidden');
    }

    // ============ The queue is not a way round the guards ============

    public function test_a_waiter_cannot_void_a_bill_through_the_queue(): void
    {
        $dish = $this->dish();
        $this->openShift();
        [$billId] = $this->liveBill($dish);

        $waiter = $this->staff('waiter', '4444');
        $waiterSession = $this->signIn($waiter, '4444');

        // `bills/{bill}/cancel` asks for `pos.void`, which a waiter does not
        // hold. The batch is one route for eleven verbs, and without a per-verb
        // check it would be the way round that.
        $this->drain([
            $this->entry('bill.cancel', ['bill_id' => $billId, 'reason' => 'Mehmon ketdi']),
        ], token: $waiterSession)->assertApiError('pos.sync_action_forbidden');

        $this->assertNotSame('voided', Order::query()->findOrFail($billId)->status);
    }

    public function test_a_discount_above_a_cashiers_ceiling_still_waits_for_a_manager(): void
    {
        $dish = $this->dish(4_500_000);
        $this->openShift();
        [$billId] = $this->liveBill($dish);

        // A cashier is trusted with 5% at this terminal. Half the bill is not a
        // rounding courtesy, offline or not — and the approval registry lives on
        // this server, so it could not have been signed during the outage.
        $answer = $this->drain([
            $this->entry('bill.discount', [
                'bill_id' => $billId, 'amount' => 2_250_000, 'reason' => 'Uzr so\'radik',
            ]),
        ])->assertApiError('pos.approval_required');

        $this->assertIsInt($answer->json('error.approval_id'));
        $this->assertSame(1, PosApproval::query()->where('status', 'pending')->count());
        // The sale is not lost, it is waiting: nothing came off the bill.
        $this->assertSame(0, (int) Order::query()->findOrFail($billId)->discount_total);
    }

    public function test_a_queue_larger_than_the_limit_is_refused_by_name(): void
    {
        $entries = [];

        for ($seq = 1; $seq <= 201; $seq++) {
            $entries[] = $this->entry('bill.open', ['channel' => 'takeaway'], seq: $seq);
        }

        // Not a generic 422 on "entries": a till has to be told to send the queue
        // in pieces, because that is the only answer that empties it.
        $this->drain($entries)->assertApiError('pos.sync_batch_too_large', 'entries');

        $this->assertSame(0, Order::query()->count());
    }

    public function test_one_local_id_may_not_appear_twice_in_one_batch(): void
    {
        $twice = (string) Str::uuid();

        // The guard would answer the second with the first one's result, and a
        // second round of drinks would quietly become a duplicate of the first.
        $this->drain([
            $this->entry('bill.open', ['channel' => 'takeaway'], seq: 1, localId: $twice),
            $this->entry('bill.open', ['channel' => 'takeaway'], seq: 2, localId: $twice),
        ])->assertApiValidationErrors('entries.0.local_id');

        $this->assertSame(0, Order::query()->count());
    }

    // ============ The local store ============

    private function bootstrap(): TestResponse
    {
        return $this->bearer($this->sessionToken)
            ->getJson('/api/v1/pos/offline/bootstrap')
            ->assertOk();
    }

    public function test_the_bootstrap_answers_with_a_menu_a_till_could_sell_from(): void
    {
        $osh = $this->dish(4_500_000, 'OSH-001');
        $choy = $this->dish(500_000, 'CHOY-001');

        $this->inTenant();
        app(StopList::class)->stop($choy->id, 'choy tugadi');

        $store = $this->bootstrap();

        // Identity, so a receipt printed with no network still names the venue.
        $this->assertSame('KASSA-1', $store->json('terminal.code'));
        $this->assertSame('Osh Markazi', $store->json('restaurant.name'));
        $this->assertSame($this->branch->id, $store->json('branch.id'));
        $this->assertSame($this->cashier->id, $store->json('person.user_id'));
        // The rounding rule comes down with everything else: a till that guessed
        // it would ask a guest for a figure the settlement then disagrees with.
        $this->assertSame(100, $store->json('terminal.cash_rounding_step'));
        $this->assertSame(5, $store->json('terminal.discount_limits.cashier'));

        /** @var array<int, array<string, mixed>> $items */
        $items = (array) $store->json('menu.items');
        $prices = array_column($items, 'price_tiyin', 'sku');

        $this->assertSame(4_500_000, $prices['OSH-001']);
        // Money is tiyin on the wire, here as everywhere: a till that received
        // 45 000.00 would be a till that can round it.
        $this->assertIsInt($prices['OSH-001']);

        // The sold-out dish is present and crossed out rather than missing — a
        // waiter can answer "do you have choy" without walking to the pass.
        $stopped = array_column($items, 'is_stopped', 'sku');
        $this->assertTrue($stopped['CHOY-001']);
        $this->assertSame($choy->id, $store->json('stop_list.0.dish_id'));

        // Each dish once, and the channels point at it by id.
        $dineIn = (array) $store->json('menu.channels.dine_in');
        $this->assertNotSame([], $dineIn);
        $this->assertContains($osh->id, array_merge(...array_column($dineIn, 'item_ids')));
        $this->assertSame(count($items), count(array_unique(array_column($items, 'id'))));

        // What the queue will need to talk about itself.
        $this->assertContains('bill.tender', (array) $store->json('sync.actions'));
        $this->assertContains('cash', (array) $store->json('payment_methods'));
        $this->assertSame(200, $store->json('sync.max_batch'));
        $this->assertSame(4, $store->json('limits.bills_per_table'));
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}$/', (string) $store->json('business_date'));

        /*
         * And the blunt test of the whole endpoint: pull the cable here, sell
         * from what came down, and hand the queue back.
         */
        $this->openShift();
        $opening = (string) Str::uuid();

        $drained = $this->drain([
            $this->entry('bill.open', ['channel' => 'dine_in', 'table_label' => 'B-2'], seq: 1, localId: $opening),
            $this->entry('bill.line.add', [
                'bill_local_id' => $opening,
                'menu_item_id' => $osh->id,
                'quantity' => 2,
                // The price the store quoted, sent back so the server can say
                // whether it still holds.
                'unit_price' => $prices['OSH-001'],
            ], seq: 2),
        ])->assertOk();

        $this->assertSame(2, $drained->json('summary.accepted'));
        $this->assertSame(9_000_000, $drained->json('data.1.result.total'));
    }

    public function test_the_bootstrap_carries_the_shift_the_queue_will_stamp(): void
    {
        // With no shift open there is no drawer to name, and the till must be
        // told so rather than left to invent one.
        $this->assertNull($this->bootstrap()->json('shift.id'));
        $this->assertFalse($this->bootstrap()->json('shift.is_open'));

        $this->openShift();

        $store = $this->bootstrap();

        $this->assertTrue($store->json('shift.is_open'));
        $this->assertIsInt($store->json('shift.id'));
    }

    public function test_the_local_store_needs_a_person_at_the_till(): void
    {
        // A device token alone is not a person, and the store carries what that
        // person is allowed to do. Signing in is what makes it answerable.
        $this->bearer($this->deviceToken)
            ->getJson('/api/v1/pos/offline/bootstrap')
            ->assertApiError('pos.session_required');
    }
}
