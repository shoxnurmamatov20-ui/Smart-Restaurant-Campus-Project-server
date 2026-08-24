<?php

declare(strict_types=1);

namespace Modules\Staff\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Inventory\Models\Ingredient;
use Modules\Orders\Models\Delivery;
use Modules\Orders\Models\Order;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\Shift;
use Modules\Staff\Models\StaffAction;
use Modules\Staff\Models\StaffMember;
use Modules\Suppliers\Models\PurchaseOrder;
use Modules\Suppliers\Models\Supplier;
use Modules\Tables\Models\Hall;
use Modules\Tables\Models\RestaurantTable;
use Modules\Tables\Models\WaiterCall;
use Tests\TestCase;

/**
 * The staff app's offline queue, drained.
 *
 * The property the whole endpoint exists for is in
 * `test_a_resent_entry_is_not_written_twice`: a phone sends twelve, nine land,
 * the connection dies, and the retry carries an overlapping twelve. Everything
 * else here is what has to hold for that to be safe.
 */
final class CrewQueueTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $chilonzor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);
        $this->chilonzor = Branch::factory()->named('Chilonzor', 'CHZ')->create(['tenant_id' => $this->tenant->id]);
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    /** Somebody on the rota, signed in as themselves. */
    private function crew(string $role = 'waiter'): StaffMember
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);

        $member = StaffMember::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'user_id' => $user->getKey(),
            'status' => 'active',
        ]);

        $this->actingAs($user);

        return $member;
    }

    /** A table on this restaurant's floor, free and claimable. */
    private function table(): RestaurantTable
    {
        $hall = Hall::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
        ]);

        return RestaurantTable::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'hall_id' => $hall->getKey(),
        ]);
    }

    /**
     * @param  array<int, array<string, mixed>>  $entries
     */
    private function send(array $entries): TestResponse
    {
        return $this->postJson('/api/v1/staff/actions', ['entries' => $entries]);
    }

    // ============ Idempotency ============

    public function test_a_resent_entry_is_not_written_twice(): void
    {
        $member = $this->crew();
        $at = now()->subHours(2);

        $entry = ['local_id' => 'q-1', 'kind' => 'clock_in', 'at' => $at->toIso8601String()];

        $this->send([$entry])->assertCreated()->assertJsonPath('data.results.0.status', 'applied');

        // The same entry again, in a different request with a different
        // idempotency header — which is exactly what a retry after a dropped
        // connection looks like.
        $this->send([$entry])
            ->assertCreated()
            ->assertJsonPath('data.results.0.status', 'applied')
            ->assertJsonPath('data.results.0.duplicate', true);

        $this->assertSame(1, StaffAction::query()->where('local_id', 'q-1')->count());
        $this->assertSame(1, Attendance::query()->where('staff_member_id', $member->id)->count());
    }

    public function test_a_retry_is_told_the_same_refusal_it_was_told_the_first_time(): void
    {
        $this->crew();
        $entry = ['local_id' => 'q-2', 'kind' => 'clock_out', 'at' => now()->toIso8601String()];

        $this->send([$entry])->assertCreated()->assertJsonPath('data.results.0.reason', 'not_clocked_in');

        // A phone told `rejected` once has to be told it again, or it keeps the
        // entry and asks forever.
        $this->send([$entry])
            ->assertCreated()
            ->assertJsonPath('data.results.0.status', 'rejected')
            ->assertJsonPath('data.results.0.reason', 'not_clocked_in');
    }

    public function test_two_people_may_use_the_same_local_id(): void
    {
        $first = $this->crew();
        $this->send([['local_id' => '1', 'kind' => 'clock_in', 'at' => now()->toIso8601String()]])->assertCreated();

        $second = $this->crew('cook');
        $this->send([['local_id' => '1', 'kind' => 'clock_in', 'at' => now()->toIso8601String()]])
            ->assertCreated()
            ->assertJsonPath('data.results.0.status', 'applied');

        // The id is the phone's own counter, so two phones will collide on it
        // constantly. Keyed by person, both land.
        $this->assertSame(1, Attendance::query()->where('staff_member_id', $first->id)->count());
        $this->assertSame(1, Attendance::query()->where('staff_member_id', $second->id)->count());
    }

    // ============ Attendance ============

    public function test_a_clock_in_is_dated_when_it_happened_not_when_it_arrived(): void
    {
        $member = $this->crew();
        $arrived = now()->subHours(6)->startOfMinute();

        $this->send([[
            'local_id' => 'q-3', 'kind' => 'clock_in', 'at' => $arrived->toIso8601String(),
        ]])->assertCreated();

        $attendance = Attendance::query()->where('staff_member_id', $member->id)->firstOrFail();

        // Stamping `now()` would pay somebody from the moment the network came
        // back, which on a basement shift is the end of it.
        $this->assertSame($arrived->toIso8601String(), $attendance->checked_in_at->toIso8601String());

        // And at the member's own venue, not whatever branch context the phone
        // sent — `branch_id` was missing from `Attendance::$fillable`, so the
        // controller's explicit value was dropped and labour cost landed on the
        // wrong venue for exactly the shifts clocked from a phone.
        $this->assertSame($member->branch_id, $attendance->branch_id);
    }

    public function test_clocking_out_freezes_the_minutes_actually_worked(): void
    {
        $member = $this->crew();
        $in = now()->subHours(8)->startOfMinute();
        $out = now()->subHours(2)->startOfMinute();

        $this->send([
            ['local_id' => 'a', 'kind' => 'clock_in', 'at' => $in->toIso8601String()],
            ['local_id' => 'b', 'kind' => 'clock_out', 'at' => $out->toIso8601String()],
        ])->assertCreated();

        $attendance = Attendance::query()->where('staff_member_id', $member->id)->firstOrFail();

        $this->assertSame(360, $attendance->minutes_worked);
    }

    public function test_a_second_open_record_is_refused(): void
    {
        $this->crew();

        $this->send([['local_id' => 'a', 'kind' => 'clock_in', 'at' => now()->subHour()->toIso8601String()]])
            ->assertCreated();

        // Two open records would pay the same hours twice — the same refusal
        // the wall tablet makes at the service entrance.
        $this->send([['local_id' => 'b', 'kind' => 'clock_in', 'at' => now()->toIso8601String()]])
            ->assertCreated()
            ->assertJsonPath('data.results.0.reason', 'already_clocked_in');
    }

    public function test_lateness_is_measured_against_the_rota_not_the_clock(): void
    {
        $member = $this->crew();
        $start = now()->startOfHour()->subHours(2);

        Shift::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'staff_member_id' => $member->id,
            'starts_at' => $start,
            'ends_at' => $start->copy()->addHours(9),
            'status' => 'confirmed',
        ]);

        $this->send([[
            'local_id' => 'late', 'kind' => 'clock_in',
            'at' => $start->copy()->addMinutes(18)->toIso8601String(),
        ]])->assertCreated();

        $this->assertTrue((bool) Attendance::query()->where('staff_member_id', $member->id)->firstOrFail()->is_late);
    }

    public function test_somebody_with_no_shift_rostered_cannot_be_late_for_it(): void
    {
        $member = $this->crew();

        // A cook called in on their day off is doing the restaurant a favour.
        $this->send([['local_id' => 'x', 'kind' => 'clock_in', 'at' => now()->toIso8601String()]])
            ->assertCreated();

        $this->assertFalse((bool) Attendance::query()->where('staff_member_id', $member->id)->firstOrFail()->is_late);
    }

    public function test_somebody_who_is_not_on_the_roster_is_told_so(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->send([['local_id' => 'x', 'kind' => 'clock_in', 'at' => now()->toIso8601String()]])
            ->assertCreated()
            ->assertJsonPath('data.results.0.reason', 'no_roster_row');
    }

    // ============ Stock, through the contract ============

    public function test_a_write_off_from_a_phone_reaches_the_shelf(): void
    {
        $this->crew('storekeeper');
        $ingredient = Ingredient::factory()->create(['tenant_id' => $this->tenant->id, 'stock_quantity' => 5_000]);

        $this->send([[
            'local_id' => 'w-1', 'kind' => 'waste_log', 'at' => now()->subHour()->toIso8601String(),
            'payload' => ['ingredient_id' => $ingredient->id, 'quantity' => 800, 'reason' => 'Muddati tugadi'],
        ]])
            ->assertCreated()
            ->assertJsonPath('data.results.0.status', 'applied')
            ->assertJsonPath('data.results.0.applied_to', 'inventory.stock_movements');

        $this->assertSame(4_200, $ingredient->refresh()->stock_quantity);
    }

    public function test_a_write_off_with_no_reason_is_refused(): void
    {
        $this->crew('storekeeper');
        $ingredient = Ingredient::factory()->create(['tenant_id' => $this->tenant->id, 'stock_quantity' => 5_000]);

        // Unexplained shrinkage is what the stock module exists to surface.
        $this->send([[
            'local_id' => 'w-2', 'kind' => 'waste_log', 'at' => now()->toIso8601String(),
            'payload' => ['ingredient_id' => $ingredient->id, 'quantity' => 800],
        ]])->assertCreated()->assertJsonPath('data.results.0.reason', 'reason_required');

        $this->assertSame(5_000, $ingredient->refresh()->stock_quantity);
    }

    public function test_a_waiter_may_not_write_stock_off_through_the_queue(): void
    {
        $this->crew('waiter');
        $ingredient = Ingredient::factory()->create(['tenant_id' => $this->tenant->id, 'stock_quantity' => 5_000]);

        // The offline queue must not launder a permission. A waiter refused
        // this online is refused it on replay — the rule SyncController states
        // for the till, applied to the phone.
        $this->send([[
            'local_id' => 'w-3', 'kind' => 'waste_log', 'at' => now()->toIso8601String(),
            'payload' => ['ingredient_id' => $ingredient->id, 'quantity' => 800, 'reason' => 'Tushib ketdi'],
        ]])->assertCreated()->assertJsonPath('data.results.0.reason', 'not_permitted');

        $this->assertSame(5_000, $ingredient->refresh()->stock_quantity);

        // And the refusal is still recorded, so nothing goes missing quietly.
        $this->assertSame(
            StaffAction::REJECTED,
            StaffAction::query()->where('local_id', 'w-3')->firstOrFail()->status,
        );
    }

    public function test_a_count_typed_on_a_phone_posts_its_variance(): void
    {
        $this->crew('storekeeper');
        $ingredient = Ingredient::factory()->create(['tenant_id' => $this->tenant->id, 'stock_quantity' => 3_000]);

        $this->send([[
            'local_id' => 'c-1', 'kind' => 'count_submit', 'at' => now()->toIso8601String(),
            'payload' => ['ingredient_id' => $ingredient->id, 'counted' => 2_750],
        ]])->assertCreated()->assertJsonPath('data.results.0.status', 'applied');

        $this->assertSame(2_750, $ingredient->refresh()->stock_quantity);
    }

    // ============ The kinds that reach another module ============

    public function test_a_claimed_table_is_seated_and_remembers_who_took_it(): void
    {
        $member = $this->crew('waiter');
        $table = $this->table();

        $this->send([[
            'local_id' => 't-1', 'kind' => 'table_claim', 'at' => now()->subHour()->toIso8601String(),
            'payload' => ['table_id' => $table->getKey()],
        ]])
            ->assertCreated()
            ->assertJsonPath('data.results.0.status', 'applied')
            ->assertJsonPath('data.results.0.applied_to', 'tables.restaurant_tables');

        $table->refresh();

        // Seated AND attributed: a claim that only changed the status would
        // fill the room and tell nobody whose section it is.
        $this->assertSame('occupied', $table->status);
        $this->assertSame($member->user_id, $table->claimed_by_user_id);
        $this->assertNotNull($table->claimed_at);
    }

    public function test_a_table_another_waiter_already_holds_is_refused(): void
    {
        $first = $this->crew('waiter');
        $table = $this->table();

        $this->send([[
            'local_id' => 'c-1', 'kind' => 'table_claim', 'at' => now()->toIso8601String(),
            'payload' => ['table_id' => $table->getKey()],
        ]])->assertCreated()->assertJsonPath('data.results.0.status', 'applied');

        $this->crew('waiter');

        // Two waiters both told "yes" is two waiters walking to the same six
        // covers. The second is told no, and the table does not change hands.
        $this->send([[
            'local_id' => 'c-2', 'kind' => 'table_claim', 'at' => now()->toIso8601String(),
            'payload' => ['table_id' => $table->getKey()],
        ]])
            ->assertCreated()
            ->assertJsonPath('data.results.0.status', 'rejected')
            ->assertJsonPath('data.results.0.reason', 'already_claimed');

        $this->assertSame($first->user_id, $table->refresh()->claimed_by_user_id);
    }

    public function test_resolving_a_call_closes_it_and_keeps_who_answered_first(): void
    {
        $member = $this->crew('waiter');
        $table = $this->table();

        $call = WaiterCall::query()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'restaurant_table_id' => $table->getKey(),
            'kind' => 'waiter',
            'status' => 'open',
        ]);

        $this->send([[
            'local_id' => 'r-1', 'kind' => 'call_resolve', 'at' => now()->toIso8601String(),
            'payload' => ['call_id' => $call->getKey()],
        ]])
            ->assertCreated()
            ->assertJsonPath('data.results.0.applied_to', 'tables.waiter_calls');

        $call->refresh();
        $this->assertSame('done', $call->status);
        $this->assertNotNull($call->closed_at);
        $this->assertSame($member->user_id, $call->acknowledged_by_user_id);

        // A second waiter answering a call that is already closed is told so
        // rather than being made to retry forever: the guest was served.
        $this->crew('waiter');
        $this->send([[
            'local_id' => 'r-2', 'kind' => 'call_resolve', 'at' => now()->toIso8601String(),
            'payload' => ['call_id' => $call->getKey()],
        ]])
            ->assertCreated()
            ->assertJsonPath('data.results.0.reason', 'already_closed');
    }

    public function test_confirming_a_delivery_raises_stock_and_closes_the_order(): void
    {
        $this->crew('storekeeper');

        $ingredient = Ingredient::factory()->create([
            'tenant_id' => $this->tenant->id,
            'stock_quantity' => 1_000,
        ]);

        $supplier = Supplier::factory()->create(['tenant_id' => $this->tenant->id, 'payment_terms_days' => 0]);
        $order = PurchaseOrder::factory()->create([
            'tenant_id' => $this->tenant->id,
            'supplier_id' => $supplier->getKey(),
            'status' => 'sent',
        ]);
        $order->items()->create([
            'tenant_id' => $this->tenant->id,
            'ingredient_id' => $ingredient->getKey(),
            'name' => 'Guruch',
            'quantity' => 500,
            'unit_price' => 10,
            'total_price' => 5_000,
        ]);

        $entry = [
            'local_id' => 'p-1', 'kind' => 'receive_confirm', 'at' => now()->toIso8601String(),
            'payload' => ['purchase_order_id' => $order->getKey()],
        ];

        $this->send([$entry])
            ->assertCreated()
            ->assertJsonPath('data.results.0.applied_to', 'suppliers.purchase_orders');

        $this->assertSame('received', $order->refresh()->status);
        $this->assertSame(1_500, $ingredient->refresh()->stock_quantity);

        // A queue that drained twice must not double a van of stock on the
        // shelf. The second confirmation is refused and moves nothing.
        $this->send([['local_id' => 'p-2'] + $entry])
            ->assertCreated()
            ->assertJsonPath('data.results.0.reason', 'already_received');

        $this->assertSame(1_500, $ingredient->refresh()->stock_quantity);
    }

    public function test_a_courier_moves_the_bill_and_the_dispatch_row(): void
    {
        $rider = $this->crew('courier');

        $bill = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'channel' => 'delivery',
            'status' => 'ready',
        ]);

        Delivery::query()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'order_id' => $bill->getKey(),
            'courier_user_id' => $rider->user_id,
            'status' => 'assigned',
            'assigned_at' => now()->subMinutes(20),
        ]);

        $left = now()->subMinutes(12);

        $this->send([[
            'local_id' => 'd-1', 'kind' => 'delivery_status', 'at' => $left->toIso8601String(),
            'payload' => ['order_id' => $bill->getKey(), 'status' => 'enroute'],
        ]])
            ->assertCreated()
            ->assertJsonPath('data.results.0.applied_to', 'orders.deliveries');

        $delivery = Delivery::query()->where('order_id', $bill->getKey())->firstOrFail();

        $this->assertSame('enroute', $delivery->status);
        // Stamped when the rider left, not when their phone found a signal.
        $this->assertSame($left->format('Y-m-d H:i'), $delivery->picked_at?->format('Y-m-d H:i'));
        $this->assertSame('enroute', $bill->refresh()->status);
    }

    public function test_a_stale_courier_entry_cannot_wind_a_finished_drop_backwards(): void
    {
        $rider = $this->crew('courier');

        $bill = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'channel' => 'delivery',
            'status' => 'ready',
        ]);

        Delivery::query()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'order_id' => $bill->getKey(),
            'courier_user_id' => $rider->user_id,
            'status' => 'delivered',
            'assigned_at' => now()->subHour(),
            'delivered_at' => now()->subMinutes(5),
        ]);

        // The queue drained at seven the next morning and replayed `picked`.
        // Reporting a dinner as still in transit hours after somebody ate it
        // is worse than losing the entry.
        $this->send([[
            'local_id' => 'd-2', 'kind' => 'delivery_status', 'at' => now()->subHours(2)->toIso8601String(),
            'payload' => ['order_id' => $bill->getKey(), 'status' => 'picked'],
        ]])
            ->assertCreated()
            ->assertJsonPath('data.results.0.reason', 'no_live_delivery');

        $this->assertSame('delivered', Delivery::query()->where('order_id', $bill->getKey())->firstOrFail()->status);
    }

    public function test_an_entry_whose_target_is_gone_is_still_journalled(): void
    {
        $this->crew('waiter');

        // The table was taken out of service in the ninety minutes the phone
        // was offline. The verdict is a refusal, and the ROW is still written:
        // "nothing is answered fine and then dropped" cuts both ways.
        $this->send([[
            'local_id' => 't-9', 'kind' => 'table_claim', 'at' => now()->subHour()->toIso8601String(),
            'payload' => ['table_id' => 4_242],
        ]])
            ->assertCreated()
            ->assertJsonPath('data.results.0.status', 'rejected')
            ->assertJsonPath('data.results.0.reason', 'already_claimed');

        $row = StaffAction::query()->where('local_id', 't-9')->firstOrFail();
        $this->assertSame(['table_id' => 4_242], $row->payload);
        $this->assertNull($row->applied_to);
    }

    public function test_a_batch_answers_for_every_entry_it_was_given(): void
    {
        $this->crew('waiter');
        $table = $this->table();

        $response = $this->send([
            ['local_id' => 'e1', 'kind' => 'clock_in', 'at' => now()->subHours(3)->toIso8601String()],
            [
                'local_id' => 'e2', 'kind' => 'table_claim', 'at' => now()->subHours(2)->toIso8601String(),
                'payload' => ['table_id' => $table->getKey()],
            ],
            ['local_id' => 'e3', 'kind' => 'clock_in', 'at' => now()->subHour()->toIso8601String()],
        ])->assertCreated();

        // Three in, three out. Nothing is answered "fine" and then dropped, and
        // one refusal in the middle does not strand the others.
        $response->assertJsonCount(3, 'data.results')
            ->assertJsonPath('data.applied', 2)
            ->assertJsonPath('data.rejected', 1)
            ->assertJsonPath('data.results.2.reason', 'already_clocked_in');
    }

    public function test_an_entry_with_no_timestamp_is_refused_outright(): void
    {
        $this->crew();

        // Defaulting to `now()` would date a night's work to the morning the
        // network came back and put every entry on the wrong trading day.
        $this->postJson('/api/v1/staff/actions', [
            'entries' => [['local_id' => 'x', 'kind' => 'clock_in']],
        ])->assertApiValidationErrors('entries.0.at');
    }

    public function test_an_unknown_kind_is_refused_outright(): void
    {
        $this->crew();

        $this->send([['local_id' => 'x', 'kind' => 'set_own_salary', 'at' => now()->toIso8601String()]])
            ->assertApiValidationErrors('entries.0.kind');
    }

    // ============ Isolation ============

    public function test_the_journal_row_lands_at_the_venue_the_person_works_at(): void
    {
        $member = $this->crew();

        $this->send([['local_id' => 'b-1', 'kind' => 'table_claim', 'at' => now()->toIso8601String()]])
            ->assertCreated();

        $this->assertSame(
            $member->branch_id,
            StaffAction::query()->where('local_id', 'b-1')->firstOrFail()->branch_id,
        );
    }

    public function test_another_restaurants_ingredient_cannot_be_written_off_from_here(): void
    {
        $this->crew('storekeeper');

        $other = Tenant::query()->create([
            'name' => 'Lagmon uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $theirs = Ingredient::query()->create([
            'tenant_id' => $other->id, 'sku' => 'ING-X', 'name' => 'Guruch',
            'unit' => 'g', 'stock_quantity' => 9_000, 'min_quantity' => 0, 'cost_per_unit' => 1,
        ]);

        $this->send([[
            'local_id' => 'x-1', 'kind' => 'waste_log', 'at' => now()->toIso8601String(),
            'payload' => ['ingredient_id' => $theirs->id, 'quantity' => 500, 'reason' => 'Test'],
        ]])->assertCreated()->assertJsonPath('data.results.0.reason', 'unknown_ingredient');

        $this->assertSame(9_000, (int) $theirs->refresh()->stock_quantity);
    }
}
