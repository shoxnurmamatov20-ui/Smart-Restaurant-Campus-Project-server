<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\StoredDomainEvent;
use App\Models\Tenant;
use App\Support\Events\DomainEvent;
use App\Support\Events\EventBus;
use App\Support\Events\ProcessedEvents;
use App\Support\Events\ReceivedEvent;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Modules\Crm\Models\Customer;
use Modules\Orders\Models\Order;
use RuntimeException;
use Tests\TestCase;

/**
 * The event bus.
 *
 * The guarantee under test is the one a restaurant actually depends on: a bill
 * that was settled cannot leave the rest of the building unaware of it. That
 * means the event survives a crash between commit and delivery, never escapes a
 * rolled-back sale, and is retried rather than dropped when a subscriber fails.
 */
final class EventBusTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);
    }

    private function bus(): EventBus
    {
        return app(EventBus::class);
    }

    // ============ Recording ============

    public function test_publishing_writes_the_documented_envelope(): void
    {
        $this->bus()->publish(new TestDishBurned(['dish' => 'Osh', 'severity' => 'high']));

        $record = StoredDomainEvent::query()->firstOrFail();

        $this->assertSame('test.dish_burned', $record->name);
        $this->assertSame('Core', $record->module);
        $this->assertSame(1, $record->schema_version);
        $this->assertSame($this->tenant->id, $record->tenant_id);
        $this->assertSame(['dish' => 'Osh', 'severity' => 'high'], $record->payload);
        $this->assertNotNull($record->occurred_at);
        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', $record->event_id);
    }

    public function test_every_event_gets_its_own_id_for_subscribers_to_deduplicate_on(): void
    {
        $this->bus()->publish(new TestDishBurned, new TestDishBurned);

        $ids = StoredDomainEvent::query()->pluck('event_id');

        $this->assertCount(2, $ids->unique(), 'Two events must never share an event_id.');
    }

    public function test_the_publishing_module_is_read_from_where_the_class_lives(): void
    {
        $order = Order::factory()->create(['tenant_id' => $this->tenant->id]);
        $order->transitionTo('paid');

        $this->assertSame('Orders', StoredDomainEvent::query()
            ->where('name', 'orders.paid')->firstOrFail()->module);
    }

    // ============ Atomicity ============

    public function test_an_event_from_a_rolled_back_sale_never_leaves_the_building(): void
    {
        $seen = [];
        Event::listen('test.dish_burned', function () use (&$seen): void {
            $seen[] = true;
        });

        try {
            DB::transaction(function (): void {
                $this->bus()->publish(new TestDishBurned);

                throw new RuntimeException('kassa xatosi');
            });
        } catch (RuntimeException) {
            // expected
        }

        $this->assertSame(0, StoredDomainEvent::query()->count(), 'The outbox row must roll back with the sale.');
        $this->assertSame([], $seen, 'A subscriber must never see an event that did not happen.');
    }

    public function test_subscribers_run_only_after_the_transaction_commits(): void
    {
        $sawRowsInsideTransaction = null;

        Event::listen('test.dish_burned', function () use (&$sawRowsInsideTransaction): void {
            // If this ran mid-transaction, the order it describes would not yet
            // be visible to any other connection.
            $sawRowsInsideTransaction = DB::transactionLevel();
        });

        DB::transaction(function (): void {
            $this->bus()->publish(new TestDishBurned);
            $this->assertNull(StoredDomainEvent::query()->firstOrFail()->published_at);
        });

        $this->assertNotNull($sawRowsInsideTransaction, 'The subscriber must have run.');
        $this->assertNotNull(StoredDomainEvent::query()->firstOrFail()->published_at);
    }

    // ============ Delivery ============

    public function test_a_subscriber_receives_the_envelope_not_the_publishers_model(): void
    {
        $received = null;
        Event::listen('test.dish_burned', function (ReceivedEvent $event) use (&$received): void {
            $received = $event;
        });

        $this->bus()->publish(new TestDishBurned(['dish' => 'Manti']));

        $this->assertInstanceOf(ReceivedEvent::class, $received);
        $this->assertSame('test.dish_burned', $received->name);
        $this->assertSame('Manti', $received->string('dish'));
        $this->assertSame($this->tenant->id, $received->tenantId);
        $this->assertArrayHasKey('event_id', $received->toEnvelope());
    }

    public function test_a_delivered_event_is_marked_and_never_delivered_again(): void
    {
        $deliveries = 0;
        Event::listen('test.dish_burned', function () use (&$deliveries): void {
            $deliveries++;
        });

        $this->bus()->publish(new TestDishBurned);
        $this->bus()->relayPending();
        $this->bus()->relayPending();

        $this->assertSame(1, $deliveries, 'The sweeper must not re-deliver what publish() already delivered.');
        $this->assertNotNull(StoredDomainEvent::query()->firstOrFail()->published_at);
    }

    public function test_the_restaurant_is_restored_before_a_subscriber_runs(): void
    {
        $seenTenant = null;
        Event::listen('test.dish_burned', function () use (&$seenTenant): void {
            $seenTenant = app(TenantContext::class)->id();
        });

        $this->bus()->publish(new TestDishBurned);

        // Simulate the relay running from cron, where no request set a tenant.
        app(TenantContext::class)->clear();
        StoredDomainEvent::query()->update(['published_at' => null]);

        $this->bus()->relayPending();

        $this->assertSame(
            $this->tenant->id,
            $seenTenant,
            'A subscriber querying its own tables must be scoped to the event\'s restaurant.',
        );
        $this->assertNull(app(TenantContext::class)->id(), 'The relay must put the context back as it found it.');
    }

    public function test_events_are_delivered_in_the_order_they_happened(): void
    {
        $order = [];
        Event::listen('test.dish_burned', function (ReceivedEvent $e) use (&$order): void {
            $order[] = $e->string('dish');
        });

        // Written by a process that then died — nothing was delivered.
        StoredDomainEvent::query()->insert([
            $this->pendingRow('OSH', 1),
            $this->pendingRow('MANTI', 2),
            $this->pendingRow('SOMSA', 3),
        ]);

        $this->bus()->relayPending();

        $this->assertSame(['OSH', 'MANTI', 'SOMSA'], $order);
    }

    // ============ Failure ============

    public function test_a_failing_subscriber_leaves_the_event_pending_for_retry(): void
    {
        $attempts = 0;
        Event::listen('test.dish_burned', function () use (&$attempts): void {
            $attempts++;

            if ($attempts === 1) {
                throw new RuntimeException('Telegram javob bermadi');
            }
        });

        $this->bus()->publish(new TestDishBurned);

        $record = StoredDomainEvent::query()->firstOrFail();
        $this->assertNull($record->published_at, 'A failed delivery must not be recorded as delivered.');
        $this->assertSame(1, $record->attempts);
        $this->assertStringContainsString('Telegram javob bermadi', (string) $record->last_error);

        // Backoff: the sweeper must not retry immediately.
        $this->assertSame(0, $this->bus()->relayPending());

        $this->travel(11)->seconds();
        $this->assertSame(1, $this->bus()->relayPending());
        $this->assertNotNull(StoredDomainEvent::query()->firstOrFail()->published_at);
    }

    public function test_an_event_is_given_up_on_rather_than_retried_forever(): void
    {
        Event::listen('test.dish_burned', function (): void {
            throw new RuntimeException('doim xato');
        });

        $this->bus()->publish(new TestDishBurned);

        for ($i = 0; $i < StoredDomainEvent::MAX_ATTEMPTS + 2; $i++) {
            $this->travel(2)->hours();
            $this->bus()->relayPending();
        }

        $record = StoredDomainEvent::query()->firstOrFail();
        $this->assertSame(StoredDomainEvent::MAX_ATTEMPTS, $record->attempts);
        $this->assertNull($record->published_at);

        // Kept, never deleted: an event nobody could deliver is exactly the one
        // worth investigating.
        $this->assertSame(1, StoredDomainEvent::query()->abandoned()->count());
    }

    public function test_one_broken_subscriber_does_not_hold_up_the_others(): void
    {
        Event::listen('test.dish_burned', fn () => throw new RuntimeException('sinmoq'));

        $delivered = false;
        Event::listen('test.kitchen_closed', function () use (&$delivered): void {
            $delivered = true;
        });

        $this->bus()->publish(new TestDishBurned, new TestKitchenClosed);

        $this->assertTrue($delivered, 'A failing event must not block the next one in the outbox.');
    }

    // ============ The relay command ============

    public function test_the_relay_command_reports_what_it_could_not_deliver(): void
    {
        Event::listen('test.dish_burned', fn () => throw new RuntimeException('xato'));

        $this->bus()->publish(new TestDishBurned);
        StoredDomainEvent::query()->update(['attempts' => StoredDomainEvent::MAX_ATTEMPTS]);

        $this->artisan('events:relay')
            ->expectsOutputToContain('yetkazilmadi')
            ->assertFailed();
    }

    public function test_the_relay_command_is_quiet_when_there_is_nothing_to_do(): void
    {
        $this->artisan('events:relay')->assertSuccessful();
    }

    // ============ Idempotency ============

    public function test_a_subscriber_can_run_its_work_exactly_once(): void
    {
        $runs = 0;
        $processed = app(ProcessedEvents::class);

        Event::listen('test.dish_burned', function (ReceivedEvent $event) use ($processed, &$runs): void {
            $processed->once($event, 'TestSubscriber', function () use (&$runs): void {
                $runs++;
            });
        });

        $this->bus()->publish(new TestDishBurned);

        // The same event arriving again — a crash after the work but before the
        // outbox row was marked delivered.
        StoredDomainEvent::query()->update(['published_at' => null]);
        $this->bus()->relayPending();
        StoredDomainEvent::query()->update(['published_at' => null]);
        $this->bus()->relayPending();

        $this->assertSame(1, $runs, 'At-least-once delivery must not mean at-least-once side effects.');
    }

    public function test_two_subscribers_of_the_same_event_each_get_their_turn(): void
    {
        $processed = app(ProcessedEvents::class);
        $runs = [];

        Event::listen('test.dish_burned', function (ReceivedEvent $e) use ($processed, &$runs): void {
            $processed->once($e, 'Kitchen', function () use (&$runs): void {
                $runs[] = 'kitchen';
            });
            $processed->once($e, 'Crm', function () use (&$runs): void {
                $runs[] = 'crm';
            });
        });

        $this->bus()->publish(new TestDishBurned);

        $this->assertSame(['kitchen', 'crm'], $runs);
    }

    public function test_work_that_throws_leaves_no_claim_behind(): void
    {
        $processed = app(ProcessedEvents::class);
        $event = new ReceivedEvent(
            eventId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            name: 'test.dish_burned', module: 'Core', schemaVersion: 1,
            tenantId: $this->tenant->id, actorId: null,
            aggregateType: null, aggregateId: null, payload: [],
            occurredAt: now()->toImmutable(),
        );

        try {
            $processed->once($event, 'Flaky', fn () => throw new RuntimeException('yiqildi'));
        } catch (RuntimeException) {
            // expected
        }

        // Otherwise the retry would be skipped as "already handled" and the
        // side effect would be lost forever.
        $this->assertFalse($processed->alreadyHandled($event->eventId, 'Flaky'));
    }

    // ============ End to end, across two modules ============

    public function test_settling_a_bill_credits_the_guest_without_either_module_knowing_the_other(): void
    {
        $guest = Customer::factory()->create([
            'tenant_id' => $this->tenant->id,
            'visits_count' => 2,
            'total_spent' => 40000000,
            'tier' => 'bronze',
        ]);

        $order = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => $guest->id,
            'total' => 70000000,
        ]);

        $order->transitionTo('paid');

        $guest->refresh();
        $this->assertSame(3, $guest->visits_count);
        $this->assertSame(110000000, $guest->total_spent);
        // Crossed 1 000 000 so'm lifetime, so the tier moved with it.
        $this->assertSame('silver', $guest->tier);
    }

    public function test_a_walk_in_guest_settles_a_bill_without_error(): void
    {
        $order = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => null,
            'total' => 50000000,
        ]);

        $this->assertTrue($order->transitionTo('paid'));
        $this->assertNotNull(StoredDomainEvent::query()->where('name', 'orders.paid')->firstOrFail()->published_at);
    }

    public function test_a_bill_credited_once_is_not_credited_again_on_redelivery(): void
    {
        $guest = Customer::factory()->create([
            'tenant_id' => $this->tenant->id, 'visits_count' => 0, 'total_spent' => 0,
        ]);
        $order = Order::factory()->create([
            'tenant_id' => $this->tenant->id, 'customer_id' => $guest->id, 'total' => 30000000,
        ]);

        $order->transitionTo('paid');

        // The relay finds the row again after a crash marked nothing delivered.
        StoredDomainEvent::query()->update(['published_at' => null, 'attempts' => 0]);
        $this->bus()->relayPending();

        $this->assertSame(1, $guest->refresh()->visits_count);
        $this->assertSame(30000000, $guest->total_spent);
    }

    public function test_a_cancelled_bill_credits_nobody(): void
    {
        $guest = Customer::factory()->create([
            'tenant_id' => $this->tenant->id, 'visits_count' => 0, 'total_spent' => 0,
        ]);
        $order = Order::factory()->create([
            'tenant_id' => $this->tenant->id, 'customer_id' => $guest->id, 'total' => 30000000,
        ]);

        $order->transitionTo('cancelled');

        $this->assertSame(0, StoredDomainEvent::query()->where('name', 'orders.paid')->count());
        $this->assertSame(0, $guest->refresh()->visits_count);
    }

    /**
     * @return array<string, mixed>
     */
    private function pendingRow(string $dish, int $index): array
    {
        return [
            'event_id' => sprintf('00000000-0000-4000-8000-%012d', $index),
            'tenant_id' => $this->tenant->id,
            'name' => 'test.dish_burned',
            'module' => 'Core',
            'schema_version' => 1,
            'payload' => json_encode(['dish' => $dish], JSON_THROW_ON_ERROR),
            'occurred_at' => now(),
            'attempts' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
}

/**
 * A stand-in for a real module event, so the bus can be tested without dragging
 * a module's behaviour into these assertions.
 */
final class TestDishBurned extends DomainEvent
{
    /**
     * @param array<string, mixed> $payload
     */
    public function __construct(private readonly array $payload = []) {}

    public function name(): string
    {
        return 'test.dish_burned';
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return $this->payload;
    }

    public function aggregate(): ?Model
    {
        return null;
    }
}

final class TestKitchenClosed extends DomainEvent
{
    public function name(): string
    {
        return 'test.kitchen_closed';
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return ['closed_at' => '23:00'];
    }
}
