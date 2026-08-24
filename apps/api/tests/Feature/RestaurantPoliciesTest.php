<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Contracts\Menu\StopList;
use App\Contracts\Orders\BillRegistry;
use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Settings\Policies;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Kitchen\Models\Printer;
use Modules\Kitchen\Models\PrintJob;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Models\MenuStopEntry;
use Modules\Orders\Models\Order;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Services\ApprovalGate;
use Modules\Tables\Models\RestaurantTable;
use RuntimeException;
use Tests\TestCase;

/**
 * The nine house rules: each one enforced when it is on, and absent when it is not.
 *
 * The settings screen drew ten policy switches and nine of them moved, toasted
 * and changed nothing anywhere. That is worse than an unfinished screen: a
 * restaurant reads those rows as a statement of how the business trades, and a
 * switch that says "a manager signs for voided food" while any cashier voids
 * anything is a control somebody believes in.
 *
 * So every test here is a pair. On → the rule bites. Off → the platform behaves
 * exactly as it did before the column existed, which is the half that keeps a
 * restaurant that has never opened this screen trading normally.
 *
 * One file rather than nine, because the rules span five modules and what is
 * being tested is the same thing nine times: `App\Support\Settings\Policies`
 * read at one enforcement point. A test per module would hide that.
 */
final class RestaurantPoliciesTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona-policies', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->branch = Branch::factory()->named('Chilonzor', 'CHZ')->create([
            'tenant_id' => $this->tenant->id,
        ]);
        app(BranchContext::class)->set($this->branch);
    }

    // ============ Harness ============

    /**
     * Write a rule into the restaurant's own settings document.
     *
     * Through the model AND back into the context, because `Policies` reads the
     * tenant the context is holding — an update that only touched the database
     * row would be read back by nothing in the same request.
     *
     * @param  array<string, mixed>  $rules
     */
    private function policy(array $rules): void
    {
        $settings = $this->tenant->settings ?? [];
        $settings['policies'] = array_merge($settings['policies'] ?? [], $rules);

        $this->tenant->forceFill(['settings' => $settings])->save();

        app(TenantContext::class)->set($this->tenant->refresh());
    }

    private function bills(): BillRegistry
    {
        return app(BillRegistry::class);
    }

    private function table(): RestaurantTable
    {
        return RestaurantTable::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'status' => 'occupied',
        ]);
    }

    private function dish(string $title = 'Osh'): MenuItem
    {
        $category = MenuCategory::factory()->create(['tenant_id' => $this->tenant->id]);

        return MenuItem::factory()->for($category, 'category')->create([
            'tenant_id' => $this->tenant->id,
            'name' => ['uz' => $title, 'ru' => $title, 'en' => $title],
            'price' => 4_000_000,
            'is_available' => true,
        ]);
    }

    /** A bill with one line on it, settled — the shape every money rule needs. */
    private function paidBillOn(?RestaurantTable $table): Order
    {
        $bill = $this->bills()->open('dine_in', $table?->id, $table?->label, guests: 2);
        $this->bills()->addLine($bill->id, $this->dish()->id, 1);
        $this->bills()->send($bill->id);
        $this->bills()->awaitPayment($bill->id);
        $this->bills()->close($bill->id);

        /** @var Order $order */
        $order = Order::query()->findOrFail($bill->id);

        return $order;
    }

    // ============ 1 · auto_close_table_after_payment ============

    public function test_a_settled_table_is_left_alone_by_default(): void
    {
        $table = $this->table();

        $this->paidBillOn($table);

        // The platform's behaviour before the switch existed: a host clears the
        // table, and a floor map that moved on its own would fight them.
        $this->assertSame('occupied', $table->refresh()->status);
    }

    public function test_a_settled_table_clears_itself_when_the_restaurant_asks(): void
    {
        $this->policy(['auto_close_table_after_payment' => true]);
        $table = $this->table();

        $this->paidBillOn($table);

        // `cleaning`, not `free`: the plates are still on it, and seating the
        // next party into somebody's dessert is the failure of a free table.
        $this->assertSame('cleaning', $table->refresh()->status);
    }

    public function test_a_table_with_another_bill_still_running_is_not_cleared(): void
    {
        $this->policy(['auto_close_table_after_payment' => true]);
        $table = $this->table();

        // Four friends on separate tabs; one of them pays early. The table is
        // still full, and taking it off the floor map mid-service is the one
        // way this convenience does damage.
        $second = $this->bills()->open('dine_in', $table->id, $table->label, guests: 2);
        $this->bills()->addLine($second->id, $this->dish('Lag\'mon')->id, 1);

        $this->paidBillOn($table);

        $this->assertSame('occupied', $table->refresh()->status);
    }

    // ============ 2 · max_open_bills_per_waiter ============

    public function test_a_waiter_carries_as_many_bills_as_they_like_by_default(): void
    {
        $waiter = User::factory()->create(['tenant_id' => $this->tenant->id]);

        for ($i = 0; $i < 5; $i++) {
            $this->bills()->open('dine_in', null, null, $waiter->id);
        }

        $this->assertSame(5, Order::query()->open()->where('waiter_user_id', $waiter->id)->count());
    }

    public function test_a_ceiling_refuses_the_bill_that_would_cross_it(): void
    {
        $this->policy(['max_open_bills_per_waiter' => 2]);
        $waiter = User::factory()->create(['tenant_id' => $this->tenant->id]);

        $this->bills()->open('dine_in', null, null, $waiter->id);
        $this->bills()->open('dine_in', null, null, $waiter->id);

        $this->expectException(RuntimeException::class);
        $this->bills()->open('dine_in', null, null, $waiter->id);
    }

    public function test_the_ceiling_counts_open_bills_and_not_closed_ones(): void
    {
        $this->policy(['max_open_bills_per_waiter' => 1]);
        $waiter = User::factory()->create(['tenant_id' => $this->tenant->id]);

        $first = $this->bills()->open('dine_in', null, null, $waiter->id);
        $this->bills()->addLine($first->id, $this->dish()->id, 1);
        $this->bills()->send($first->id);
        $this->bills()->awaitPayment($first->id);
        $this->bills()->close($first->id);

        // Settled, so the waiter is carrying nothing. A ceiling that counted
        // history would lock a waiter out halfway through their first shift.
        $second = $this->bills()->open('dine_in', null, null, $waiter->id);

        $this->assertNotSame($first->id, $second->id);
    }

    // ============ 3 · split_max_ways ============

    public function test_a_bill_divides_up_to_twelve_ways_by_default(): void
    {
        $bill = $this->bills()->open('dine_in', null, null, guests: 8);
        $this->bills()->addLine($bill->id, $this->dish()->id, 8);

        $this->assertCount(8, $this->bills()->splitEvenly($bill->id, 8));
    }

    public function test_a_house_ceiling_refuses_a_wider_split(): void
    {
        $this->policy(['split_max_ways' => 3]);

        $bill = $this->bills()->open('dine_in', null, null, guests: 4);
        $this->bills()->addLine($bill->id, $this->dish()->id, 4);

        // Refused rather than clamped. A bill silently divided three ways when
        // a cashier asked for four is three people paying and one walking out.
        $this->expectException(RuntimeException::class);
        $this->bills()->splitEvenly($bill->id, 4);
    }

    public function test_a_house_ceiling_still_allows_what_it_permits(): void
    {
        $this->policy(['split_max_ways' => 3]);

        $bill = $this->bills()->open('dine_in', null, null, guests: 3);
        $this->bills()->addLine($bill->id, $this->dish()->id, 3);

        $this->assertCount(3, $this->bills()->splitEvenly($bill->id, 3));
    }

    // ============ 4 · reopen_window_minutes ============

    public function test_a_settled_bill_reopens_whenever_by_default(): void
    {
        $order = $this->paidBillOn(null);

        Carbon::setTestNow(now()->addHours(6));

        $this->assertSame('served', $this->bills()->reopen($order->id, 'karta qaytdi')->status);

        Carbon::setTestNow();
    }

    public function test_a_window_refuses_a_bill_settled_before_it(): void
    {
        $this->policy(['reopen_window_minutes' => 30]);
        $order = $this->paidBillOn(null);

        Carbon::setTestNow(now()->addMinutes(45));

        try {
            $this->expectException(RuntimeException::class);
            $this->bills()->reopen($order->id, 'karta qaytdi');
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_a_window_allows_a_bill_settled_inside_it(): void
    {
        $this->policy(['reopen_window_minutes' => 30]);
        $order = $this->paidBillOn(null);

        Carbon::setTestNow(now()->addMinutes(10));

        $this->assertSame('served', $this->bills()->reopen($order->id, 'karta qaytdi')->status);

        Carbon::setTestNow();
    }

    // ============ 5 · refund_needs_reason ============

    public function test_a_refund_with_nothing_written_on_it_is_refused(): void
    {
        $order = $this->paidBillOn(null);

        // On by default: a loss report is a list of refunds beside their
        // reasons, and a column of blanks is a hole nobody finds.
        $this->expectException(RuntimeException::class);
        $this->bills()->refund($order->id, '  ');
    }

    public function test_a_refund_carries_the_reason_it_was_given(): void
    {
        $order = $this->paidBillOn(null);

        $this->assertSame('refunded', $this->bills()->refund($order->id, 'taom sovuq edi')->status);
    }

    public function test_a_restaurant_may_switch_the_reason_off(): void
    {
        $this->policy(['refund_needs_reason' => false]);
        $order = $this->paidBillOn(null);

        $this->assertSame('refunded', $this->bills()->refund($order->id, '')->status);
    }

    // ============ 6 · void_sent_needs_manager_pin ============

    public function test_striking_food_the_kitchen_already_has_needs_a_signature(): void
    {
        [$terminal, $cashier] = $this->tillAndCashier();

        // Well inside the cashier's 5% ceiling — on amount alone this passes,
        // which is exactly the case the rule exists for.
        $this->assertTrue(app(ApprovalGate::class)->requires(
            $terminal,
            $cashier,
            'void_line',
            amount: 10_000,
            subtotal: 10_000_000,
            alreadyFired: true,
        ));
    }

    public function test_striking_a_line_the_kitchen_never_saw_does_not(): void
    {
        [$terminal, $cashier] = $this->tillAndCashier();

        // Rung up and not sent: nobody cooked it, nothing left the shelf.
        $this->assertFalse(app(ApprovalGate::class)->requires(
            $terminal,
            $cashier,
            'void_line',
            amount: 10_000,
            subtotal: 10_000_000,
            alreadyFired: false,
        ));
    }

    public function test_a_restaurant_that_switches_the_rule_off_falls_back_to_the_ladder(): void
    {
        $this->policy(['void_sent_needs_manager_pin' => false]);
        [$terminal, $cashier] = $this->tillAndCashier();

        $gate = app(ApprovalGate::class);

        // Small: within 5%, so no signature.
        $this->assertFalse($gate->requires($terminal, $cashier, 'void_line', 10_000, 10_000_000, true));
        // Large: over 5% of the bill, so the ladder still asks — switching the
        // policy off must not switch the role ceiling off with it.
        $this->assertTrue($gate->requires($terminal, $cashier, 'void_line', 9_000_000, 10_000_000, true));
    }

    /** @return array{0: Terminal, 1: User} */
    private function tillAndCashier(): array
    {
        $terminal = Terminal::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'code' => 'KASSA-1',
            'settings' => [
                'currency' => 'UZS',
                'cash_rounding_tiyin' => 100,
                'discount_limits' => ['waiter' => 0, 'cashier' => 5, 'branch-manager' => 20],
            ],
        ]);

        $cashier = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $cashier->assignRole('cashier');

        return [$terminal, $cashier->fresh()];
    }

    // ============ 7 · kds_late_minutes ============

    public function test_a_docket_turns_red_on_its_own_station_clock_by_default(): void
    {
        $ticket = $this->ticketStartedMinutesAgo(12, stationSla: 20);

        $this->assertFalse($ticket->is_late);
        $this->assertSame(0, KitchenTicket::query()->late()->count());
    }

    public function test_a_house_clock_overrides_the_station(): void
    {
        $this->policy(['kds_late_minutes' => 10]);
        $ticket = $this->ticketStartedMinutesAgo(12, stationSla: 20);

        // The accessor and the count are two readings of one rule, and a screen
        // that showed a green docket beside "1 late" is the bug this pairs up.
        $this->assertTrue($ticket->is_late);
        $this->assertSame(1, KitchenTicket::query()->late()->count());
    }

    /**
     * A docket on the pass, started `$minutes` ago.
     *
     * `sla_minutes` is a column on the ticket rather than a join: the station's
     * figure is SNAPSHOTTED when the docket is written, so re-timing the grill
     * next month does not re-colour last night's service. That snapshot is what
     * the house rule overrides.
     */
    private function ticketStartedMinutesAgo(int $minutes, int $stationSla): KitchenTicket
    {
        return KitchenTicket::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'status' => 'cooking',
            'sla_minutes' => $stationSla,
            'started_at' => now()->subMinutes($minutes),
        ]);
    }

    // ============ 8 · kds_paper_docket ============

    public function test_a_fired_bill_leaves_a_docket_on_the_printer_by_default(): void
    {
        $this->kitchenPrinter();
        $this->fireOneBill();

        // A screen and a printer are not alternatives: the KDS goes dark when a
        // tablet's battery dies, and paper does not.
        $this->assertSame(1, PrintJob::query()->count());
    }

    public function test_a_kitchen_with_no_printer_may_switch_the_paper_off(): void
    {
        $this->policy(['kds_paper_docket' => false]);
        $this->kitchenPrinter();
        $this->fireOneBill();

        // Otherwise the queue fills with jobs nothing will ever collect.
        $this->assertSame(0, PrintJob::query()->count());
        // The docket itself is untouched — this is about paper, not about the pass.
        $this->assertSame(1, KitchenTicket::query()->count());
    }

    /** The venue's fallback head, which is what a station with no printer uses. */
    private function kitchenPrinter(): void
    {
        Printer::factory()->kitchen()->default()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
        ]);
    }

    private function fireOneBill(): void
    {
        $table = $this->table();
        $bill = $this->bills()->open('dine_in', $table->id, $table->label, guests: 2);
        $this->bills()->addLine($bill->id, $this->dish()->id, 1);
        $this->bills()->send($bill->id);
    }

    // ============ 9 · stoplist_auto_unstop_hours ============

    public function test_a_stopped_dish_stays_off_until_somebody_returns_it(): void
    {
        $dish = $this->dish('Qo\'y goshti');

        app(StopList::class)->stop($dish->id, 'tugadi');

        $this->assertNull($this->stopEntry($dish->id)->stopped_until);
    }

    public function test_a_house_rule_brings_it_back_on_its_own(): void
    {
        $this->policy(['stoplist_auto_unstop_hours' => 4]);
        $dish = $this->dish('Qo\'y goshti');

        app(StopList::class)->stop($dish->id, 'tugadi');

        $until = $this->stopEntry($dish->id)->stopped_until;

        $this->assertNotNull($until);
        $this->assertEqualsWithDelta(4 * 60, now()->diffInMinutes($until), 1);
    }

    public function test_a_time_the_chef_named_beats_the_house_rule(): void
    {
        $this->policy(['stoplist_auto_unstop_hours' => 4]);
        $dish = $this->dish('Qo\'y goshti');

        // "Off until Monday" means Monday. A default quietly overwriting it
        // would be the setting deciding what the person in the kitchen already
        // decided better.
        app(StopList::class)->stop($dish->id, 'yetkazuvchi kelmadi', now()->addDay());

        $this->assertEqualsWithDelta(
            24 * 60,
            now()->diffInMinutes($this->stopEntry($dish->id)->stopped_until),
            1,
        );
    }

    private function stopEntry(int $dishId): MenuStopEntry
    {
        /** @var MenuStopEntry $entry */
        $entry = MenuStopEntry::query()
            ->where('menu_item_id', $dishId)
            ->whereNull('cleared_at')
            ->firstOrFail();

        return $entry;
    }

    // ============ 10 · tip_default_percent ============

    public function test_no_tip_chip_is_offered_unless_the_restaurant_sets_one(): void
    {
        $this->assertSame(0, app(Policies::class)->number('tip_default_percent'));

        $this->policy(['tip_default_percent' => 10]);

        $this->assertSame(10, app(Policies::class)->number('tip_default_percent'));
    }

    // ============ The reader itself ============

    public function test_a_switch_turned_off_beats_a_default_that_is_on(): void
    {
        // The difference between `false` and "not set", which is the one thing
        // a settings reader has to get right: `??` on a stored `false` would
        // fall through to the default and switch the rule back on.
        $this->assertTrue(app(Policies::class)->on('refund_needs_reason'));

        $this->policy(['refund_needs_reason' => false]);

        $this->assertFalse(app(Policies::class)->on('refund_needs_reason'));
    }

    public function test_a_document_holding_nonsense_does_not_become_a_ceiling(): void
    {
        // jsonb accepts whatever a migration, a seeder or a hand-edited row put
        // there. A negative ceiling read as a ceiling would refuse everything.
        $this->policy(['max_open_bills_per_waiter' => -4]);

        $this->assertSame(0, app(Policies::class)->number('max_open_bills_per_waiter'));
    }
}
