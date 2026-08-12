<?php

declare(strict_types=1);

namespace App\Support\Events;

use App\Models\StoredDomainEvent;
use App\Models\Tenant;
use App\Support\Tenancy\TenantContext;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Database\DatabaseManager;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * How modules talk to each other.
 *
 *   Orders:   $bus->publish(new OrderPaid($order));
 *   Kitchen:  Event::listen('orders.paid', OpenTicket::class);
 *
 * Publishing writes a row inside whatever transaction is open, so the event
 * cannot survive a rolled-back sale and cannot be lost by a process that dies
 * after commit. Delivery then happens once the transaction commits — never
 * inside it, or a subscriber would read rows that do not exist yet.
 *
 * Delivery is attempted immediately for responsiveness, and `events:relay`
 * sweeps up anything that failed or that a crash left behind. That combination
 * is what makes the guarantee at-least-once rather than best-effort.
 */
final class EventBus
{
    /** Backoff per attempt, in seconds. A failing subscriber is retried, not spammed. */
    private const BACKOFF = [10, 60, 300, 900, 3600];

    public function __construct(
        private readonly DatabaseManager $db,
        private readonly Dispatcher $events,
        private readonly TenantContext $tenants,
    ) {}

    /**
     * Record one or more events and deliver them once the current transaction
     * commits. Safe to call outside a transaction, where "after commit" is now.
     */
    public function publish(DomainEvent ...$events): void
    {
        $stored = [];

        foreach ($events as $event) {
            $stored[] = $this->store($event);
        }

        $this->db->afterCommit(function () use ($stored): void {
            foreach ($stored as $record) {
                $this->deliver($record);
            }
        });
    }

    /**
     * Deliver everything still waiting — the safety net behind `publish()`.
     *
     * Called by `events:relay` on a schedule. Returns how many were delivered.
     */
    public function relayPending(int $limit = 100): int
    {
        $delivered = 0;

        $records = StoredDomainEvent::query()
            ->pending()
            ->orderBy('id')          // Causal order: an order is paid before it is refunded.
            ->limit($limit)
            ->get();

        foreach ($records as $record) {
            if ($this->deliver($record)) {
                $delivered++;
            }
        }

        return $delivered;
    }

    /**
     * Hand one event to its subscribers.
     *
     * The tenant context is swapped to the event's own restaurant first: a
     * relay running from cron has no request behind it, and a subscriber that
     * queried without it would either see nothing or see everyone.
     */
    public function deliver(StoredDomainEvent $record): bool
    {
        if ($record->isPublished()) {
            return false;
        }

        $previous = $this->tenants->tenant();

        try {
            $this->tenants->set(
                $record->tenant_id === null ? null : Tenant::query()->find($record->tenant_id),
            );

            $this->events->dispatch($record->name, [$record->toReceivedEvent()]);

            $record->forceFill([
                'published_at' => now(),
                'attempts' => $record->attempts + 1,
                'last_error' => null,
            ])->save();

            return true;
        } catch (Throwable $e) {
            $this->recordFailure($record, $e);

            return false;
        } finally {
            $this->tenants->set($previous);
        }
    }

    /**
     * @return array{stored: int, delivered: int, abandoned: int}
     */
    public function stats(): array
    {
        return [
            'stored' => StoredDomainEvent::query()->count(),
            'pending' => StoredDomainEvent::query()->pending()->count(),
            'abandoned' => StoredDomainEvent::query()->abandoned()->count(),
        ];
    }

    private function store(DomainEvent $event): StoredDomainEvent
    {
        $aggregate = $event->aggregate();

        return StoredDomainEvent::query()->create([
            'event_id' => (string) Str::uuid(),
            'tenant_id' => $event->tenantId() ?? $this->tenants->id(),
            'name' => $event->name(),
            'module' => $event->module(),
            'schema_version' => $event->schemaVersion(),
            'actor_id' => Auth::id(),
            'aggregate_type' => $aggregate === null ? null : $aggregate::class,
            'aggregate_id' => $aggregate?->getKey(),
            'payload' => $event->payload(),
            'occurred_at' => now(),
        ]);
    }

    private function recordFailure(StoredDomainEvent $record, Throwable $e): void
    {
        $attempts = $record->attempts + 1;
        $backoff = self::BACKOFF[min($attempts, count(self::BACKOFF)) - 1];

        $record->forceFill([
            'attempts' => $attempts,
            'available_at' => now()->addSeconds($backoff),
            // Truncated: a stack trace in a column nobody reads is not worth
            // the storage, and the class plus message identifies the fault.
            'last_error' => mb_substr($e::class.': '.$e->getMessage(), 0, 1000),
        ])->save();

        Log::error('Domain event delivery failed', [
            'event_id' => $record->event_id,
            'name' => $record->name,
            'attempts' => $attempts,
            'abandoned' => $attempts >= StoredDomainEvent::MAX_ATTEMPTS,
            'exception' => $e->getMessage(),
        ]);
    }
}
