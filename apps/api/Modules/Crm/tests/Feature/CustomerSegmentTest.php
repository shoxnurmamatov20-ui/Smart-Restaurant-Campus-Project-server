<?php

declare(strict_types=1);

namespace Modules\Crm\Tests\Feature;

use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillLine;
use App\Contracts\Orders\BillRegistry;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Events\ProcessedEvents;
use App\Support\Events\ReceivedEvent;
use App\Support\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Mockery\Expectation;
use Mockery\MockInterface;
use Modules\Crm\Listeners\RecordGuestVisit;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\CustomerAddress;
use Modules\Crm\Models\CustomerDish;
use Modules\Crm\Services\GuestVisits;
use Tests\TestCase;

/**
 * The three things a guest row could not say, and the nightly pass that fills
 * one of them.
 *
 * Two screens were blocked on this and both said so in their own files: the CRM
 * guest list stayed on fixtures because "at risk" and "last seen five weeks
 * ago" had no columns, and the operator's caller card drew two blank lines
 * under a real person's name because nothing answered "what do they usually
 * order".
 */
final class CustomerSegmentTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        /*
         * A restaurant, explicitly. `crm:segment` walks the tenant list one at a
         * time — a console process starts with tenancy bypassed and would
         * otherwise write every guest under no restaurant at all — so a suite
         * with no tenant row would classify nobody and pass by doing nothing.
         */
        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);
    }

    private function actingAsMarketer(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('marketer');
        $this->actingAs($user);

        return $user;
    }

    /**
     * A bill with two lines and one of them voided.
     *
     * A container binding rather than a reach into Orders, because the point is
     * the contract: CRM asks Orders a question through `BillRegistry` and never
     * imports it, and a test that touched Orders' own models would prove the
     * opposite of what it is for.
     */
    private function billWith(int $orderId): void
    {
        $bill = new Bill(
            id: $orderId,
            number: 'A-1284',
            channel: 'dine_in',
            status: 'closed',
            tableId: null,
            tableLabel: null,
            waiterUserId: null,
            customerId: null,
            guestsCount: 2,
            subtotal: 100_000_00,
            discountTotal: 0,
            serviceCharge: 0,
            total: 100_000_00,
            lines: [
                new BillLine(
                    id: 1, orderId: $orderId, menuItemId: 101, sku: 'OSH',
                    title: "Osh, to'y oshi", station: null, quantity: 2,
                    unitPrice: 48_000_00, totalPrice: 96_000_00, status: 'served',
                ),
                new BillLine(
                    id: 2, orderId: $orderId, menuItemId: 900, sku: 'CHY',
                    title: "Ko'k choy", station: null, quantity: 1,
                    unitPrice: 8_000_00, totalPrice: 8_000_00, status: 'void',
                ),
            ],
        );

        $this->mock(BillRegistry::class, function (MockInterface $registry) use ($orderId, $bill): void {
            /*
             * `with()` before the return, rather than a callback that branches
             * on the id: it makes the expectation the assertion — a listener
             * that asked about a different bill would fail here rather than
             * quietly receive null and skip the tally.
             */
            /**
             * `andReturn` on a plain expectation, and the ordering matters for
             * static analysis rather than for Mockery: `shouldReceive()` is
             * typed as a union, so the chain is assigned first and narrowed.
             *
             * @var Expectation $expectation
             */
            $expectation = $registry->shouldReceive('find');
            $expectation->with($orderId)->andReturn($bill);
        });
    }

    private function paidEvent(int $customerId, int $orderId, int $total, string $closedAt): ReceivedEvent
    {
        return new ReceivedEvent(
            // A real uuid: `processed_domain_events.event_id` is a uuid column,
            // and the once-only guard reads it before the listener does anything.
            eventId: (string) Str::uuid(),
            name: 'orders.paid',
            module: 'Orders',
            schemaVersion: 1,
            tenantId: $this->tenant->id,
            actorId: null,
            aggregateType: 'order',
            aggregateId: $orderId,
            payload: [
                'order_id' => $orderId,
                'customer_id' => $customerId,
                'total' => $total,
                'closed_at' => $closedAt,
            ],
            occurredAt: CarbonImmutable::now(),
        );
    }

    // ============ The visit ============

    public function test_a_settled_bill_stamps_the_last_visit_from_the_bills_own_clock(): void
    {
        $guest = Customer::factory()->create(['visits_count' => 0, 'total_spent' => 0]);
        $this->billWith(4821);

        app(RecordGuestVisit::class)->handle(
            $this->paidEvent($guest->id, 4821, 100_000_00, '2026-08-20T19:40:00+05:00'),
        );

        $guest->refresh();

        $this->assertSame(1, $guest->visits_count);
        $this->assertSame(100_000_00, $guest->total_spent);
        // The bill's own moment, not the relay's: an event a crash left behind
        // must not report that the guest came in when the queue drained.
        $this->assertSame('2026-08-20', $guest->last_visit_at?->toDateString());
    }

    public function test_the_last_visit_never_moves_backwards(): void
    {
        $guest = Customer::factory()->create(['last_visit_at' => now()]);
        $this->billWith(4822);

        app(RecordGuestVisit::class)->handle(
            $this->paidEvent($guest->id, 4822, 50_000_00, '2020-01-01T12:00:00+05:00'),
        );

        // A bill settled late out of an offline queue arrives after a dinner
        // that happened after it.
        $this->assertTrue($guest->refresh()->last_visit_at?->isToday());
    }

    public function test_the_usual_order_is_the_dish_they_order_most(): void
    {
        $guest = Customer::factory()->create();
        $this->billWith(4823);

        app(RecordGuestVisit::class)->handle(
            $this->paidEvent($guest->id, 4823, 100_000_00, now()->toIso8601String()),
        );

        $guest->refresh();

        $this->assertSame("Osh, to'y oshi", $guest->usual_order);
        $this->assertSame(101, $guest->usual_order_item_id);

        // A line the guest sent back must never become the thing an operator
        // offers them next time they ring.
        $this->assertSame(0, CustomerDish::query()->where('menu_item_id', 900)->count());
    }

    public function test_the_tally_counts_bills_rather_than_portions(): void
    {
        $guest = Customer::factory()->create();
        $this->billWith(4824);

        // Two plov on one ticket is one bill's worth of plov.
        app(RecordGuestVisit::class)->handle(
            $this->paidEvent($guest->id, 4824, 100_000_00, now()->toIso8601String()),
        );

        $this->assertSame(
            1,
            (int) CustomerDish::query()->where('customer_id', $guest->id)->value('times'),
        );
    }

    public function test_one_bill_counted_twice_is_still_one_visit(): void
    {
        $guest = Customer::factory()->create(['visits_count' => 0]);
        $this->billWith(4825);

        $event = $this->paidEvent($guest->id, 4825, 100_000_00, now()->toIso8601String());
        $listener = new RecordGuestVisit(app(ProcessedEvents::class), app(GuestVisits::class));

        // Delivery is at-least-once, and counting one dinner twice would move a
        // guest into a tier they did not earn.
        $listener->handle($event);
        $listener->handle($event);

        $this->assertSame(1, $guest->refresh()->visits_count);
    }

    // ============ The nightly classifier ============

    public function test_the_nightly_pass_sorts_the_guest_list_into_three(): void
    {
        $regular = Customer::factory()->create([
            'visits_count' => 24, 'last_visit_at' => now()->subDays(3),
        ]);
        $occasional = Customer::factory()->create([
            'visits_count' => 3, 'last_visit_at' => now()->subDays(3),
        ]);
        $lapsed = Customer::factory()->create([
            'visits_count' => 9, 'last_visit_at' => now()->subDays(45),
        ]);
        // Long gone but only ever came once — somebody who tried the place,
        // which is not the same as a regular slipping away.
        $tried = Customer::factory()->create([
            'visits_count' => 1, 'last_visit_at' => now()->subDays(45),
        ]);
        $never = Customer::factory()->create(['visits_count' => 0, 'last_visit_at' => null]);

        $this->artisan('crm:segment')->assertSuccessful();

        $this->assertSame('regular', $regular->refresh()->segment);
        $this->assertSame('occasional', $occasional->refresh()->segment);
        $this->assertSame('at_risk', $lapsed->refresh()->segment);
        $this->assertSame('occasional', $tried->refresh()->segment);
        $this->assertSame('occasional', $never->refresh()->segment);
    }

    public function test_a_corporate_account_is_never_recomputed(): void
    {
        // Somebody's decision about a company account. A nightly pass that
        // recomputed it would wipe the tag every night and nobody would ever
        // work out why the corporate segment kept emptying itself.
        $company = Customer::factory()->create([
            'segment' => 'corporate', 'visits_count' => 1, 'last_visit_at' => now()->subYear(),
        ]);

        $this->artisan('crm:segment')->assertSuccessful();

        $this->assertSame('corporate', $company->refresh()->segment);
    }

    public function test_a_dry_run_writes_nothing(): void
    {
        $guest = Customer::factory()->create([
            'visits_count' => 24, 'last_visit_at' => now()->subDays(3), 'segment' => null,
        ]);

        $this->artisan('crm:segment', ['--dry-run' => true])->assertSuccessful();

        $this->assertNull($guest->refresh()->segment);
    }

    // ============ What the console now reads ============

    public function test_the_guest_list_publishes_the_three_columns_it_draws(): void
    {
        $this->actingAsMarketer();

        Customer::factory()->create([
            'name' => 'Zilola Abdullaeva',
            'segment' => 'at_risk',
            'last_visit_at' => now()->subDays(35),
            'usual_order' => 'Somsa, mol',
            'usual_order_item_id' => 104,
        ]);

        $this->getJson('/api/v1/crm/customers')
            ->assertOk()
            ->assertJsonPath('data.0.segment', 'at_risk')
            ->assertJsonPath('data.0.usual_order', 'Somsa, mol')
            ->assertJsonPath('data.0.usual_order_item_id', 104);
    }

    public function test_the_list_can_be_filtered_by_segment_and_sorted_by_last_visit(): void
    {
        $this->actingAsMarketer();

        Customer::factory()->create(['segment' => 'at_risk', 'last_visit_at' => now()->subDays(40)]);
        Customer::factory()->create(['segment' => 'regular', 'last_visit_at' => now()->subDay()]);

        // The campaign composer's whole query — and the reason `segment` is a
        // stored column rather than arithmetic over the guest list.
        $this->getJson('/api/v1/crm/customers?filter[segment]=at_risk')
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.segment', 'at_risk');

        // "Who have we not seen" is the question the screen exists to answer.
        $this->getJson('/api/v1/crm/customers?sort=last_visit_at')
            ->assertOk()
            ->assertJsonPath('data.0.segment', 'at_risk');
    }

    public function test_the_segment_counts_come_back_in_one_answer(): void
    {
        $this->actingAsMarketer();

        Customer::factory()->count(3)->create(['segment' => 'regular']);
        Customer::factory()->create(['segment' => 'at_risk']);
        // Unclassified, and drawn with the occasional ones exactly as the
        // console maps a null segment.
        Customer::factory()->create(['segment' => null]);
        // No phone: a campaign could never have reached them, so they are in no
        // total including `all`.
        Customer::factory()->create(['segment' => 'regular', 'phone' => '']);

        $response = $this->getJson('/api/v1/crm/customers/segments')->assertOk();

        /** @var list<array{id: string, count: int}> $rows */
        $rows = $response->json('data');

        $counts = [];

        foreach ($rows as $row) {
            $counts[$row['id']] = $row['count'];
        }

        $this->assertSame(5, $counts['all']);
        $this->assertSame(3, $counts['regular']);
        $this->assertSame(1, $counts['at_risk']);
        $this->assertSame(1, $counts['occasional']);
        $this->assertSame(0, $counts['corporate']);

        /*
         * Two more the console's own header needs.
         *
         * `all` counts REACHABLE guests, and the header counts guests — the
         * phoneless one belongs in it. Without `total` the CRM screen said
         * "2 148 tanish mehmon" from the message catalogue over an empty list.
         */
        $this->assertSame(6, $response->json('meta.total'));
        /*
         * Members are guests HOLDING points, not guests with a tier.
         *
         * A tier is recalculated from lifetime spend and every guest has one,
         * so it cannot answer "how many are in the programme" — which is what
         * the header claimed, at 312, from the message catalogue.
         */
        Customer::query()->update(['points' => 0]);
        Customer::factory()->count(2)->create(['points' => 40]);

        $this->assertSame(
            2,
            $this->getJson('/api/v1/crm/customers/segments')->json('meta.loyalty_members'),
        );
    }

    public function test_the_caller_card_can_read_where_to_send_the_food(): void
    {
        $this->actingAsMarketer();

        $guest = Customer::factory()->create();

        CustomerAddress::factory()->create([
            'customer_id' => $guest->id,
            'line' => 'Bunyodkor 41',
            'is_default' => true,
        ]);
        CustomerAddress::factory()->create(['customer_id' => $guest->id, 'is_default' => false]);

        $this->getJson("/api/v1/crm/customers/{$guest->id}/addresses")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            // Default first: the operator reads the top line out loud.
            ->assertJsonPath('data.0.line', 'Bunyodkor 41');
    }

    public function test_a_waiter_cannot_read_another_guests_addresses_of_another_restaurant(): void
    {
        $other = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $theirs = Customer::factory()->create(['tenant_id' => $other->id]);

        $this->actingAsMarketer();

        // Not 403 and not an empty list: a guest of another restaurant is not
        // findable at all, which is the tenant scope doing its job.
        $this->getJson("/api/v1/crm/customers/{$theirs->id}/addresses")->assertStatus(404);
    }

    public function test_the_usual_order_cannot_be_written_by_hand(): void
    {
        $this->actingAsMarketer();
        $guest = Customer::factory()->create(['usual_order' => 'Somsa, mol']);

        $this->patchJson("/api/v1/crm/customers/{$guest->id}", ['usual_order' => 'Kaviar'])
            ->assertOk();

        // It is the top row of the tally and meaningless on its own: a PATCH
        // that set it would put a dish on the caller card that the working
        // underneath disagrees with.
        $this->assertSame('Somsa, mol', $guest->refresh()->usual_order);
    }
}
