<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Events\ReceivedEvent;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * One row of the outbox.
 *
 * Deliberately NOT using BelongsToTenant: the relay runs from a console command
 * with no tenant context and must see every restaurant's pending events. It sets
 * the context per event instead, from this row's own `tenant_id`.
 *
 * @property int $id
 * @property string $event_id
 * @property int|null $tenant_id Which restaurant this happened in; null for platform-wide events
 * @property string $name Past tense, dotted: orders.paid, kitchen.ticket_ready
 * @property string $module
 * @property int $schema_version
 * @property int|null $actor_id The person behind it; null for system-driven events
 * @property string|null $aggregate_type
 * @property int|null $aggregate_id
 * @property array<array-key, mixed> $payload
 * @property CarbonImmutable $occurred_at
 * @property CarbonImmutable|null $published_at
 * @property CarbonImmutable|null $available_at
 * @property int $attempts
 * @property string|null $last_error
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 *
 * @method static Builder<static>|StoredDomainEvent abandoned()
 * @method static Builder<static>|StoredDomainEvent newModelQuery()
 * @method static Builder<static>|StoredDomainEvent newQuery()
 * @method static Builder<static>|StoredDomainEvent pending()
 * @method static Builder<static>|StoredDomainEvent query()
 * @method static Builder<static>|StoredDomainEvent whereActorId($value)
 * @method static Builder<static>|StoredDomainEvent whereAggregateId($value)
 * @method static Builder<static>|StoredDomainEvent whereAggregateType($value)
 * @method static Builder<static>|StoredDomainEvent whereAttempts($value)
 * @method static Builder<static>|StoredDomainEvent whereAvailableAt($value)
 * @method static Builder<static>|StoredDomainEvent whereCreatedAt($value)
 * @method static Builder<static>|StoredDomainEvent whereEventId($value)
 * @method static Builder<static>|StoredDomainEvent whereId($value)
 * @method static Builder<static>|StoredDomainEvent whereLastError($value)
 * @method static Builder<static>|StoredDomainEvent whereModule($value)
 * @method static Builder<static>|StoredDomainEvent whereName($value)
 * @method static Builder<static>|StoredDomainEvent whereOccurredAt($value)
 * @method static Builder<static>|StoredDomainEvent wherePayload($value)
 * @method static Builder<static>|StoredDomainEvent wherePublishedAt($value)
 * @method static Builder<static>|StoredDomainEvent whereSchemaVersion($value)
 * @method static Builder<static>|StoredDomainEvent whereTenantId($value)
 * @method static Builder<static>|StoredDomainEvent whereUpdatedAt($value)
 *
 * @mixin \Eloquent
 */
#[Fillable([
    'event_id', 'tenant_id', 'name', 'module', 'schema_version', 'actor_id',
    'aggregate_type', 'aggregate_id', 'payload', 'occurred_at', 'available_at',
])]
final class StoredDomainEvent extends Model
{
    /**
     * Given up on after this many failures. The row is kept, never deleted —
     * an event nobody could deliver is exactly the one worth investigating.
     */
    public const MAX_ATTEMPTS = 5;

    protected $table = 'domain_events';

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'occurred_at' => 'immutable_datetime',
            'published_at' => 'immutable_datetime',
            'available_at' => 'immutable_datetime',
            'schema_version' => 'integer',
            'attempts' => 'integer',
        ];
    }

    /** Waiting to be delivered and due now. */
    public function scopePending(Builder $query): void
    {
        $query->whereNull('published_at')
            ->where('attempts', '<', self::MAX_ATTEMPTS)
            ->where(function (Builder $inner): void {
                $inner->whereNull('available_at')->orWhere('available_at', '<=', now());
            });
    }

    /** Tried the full number of times and still failing. */
    public function scopeAbandoned(Builder $query): void
    {
        $query->whereNull('published_at')->where('attempts', '>=', self::MAX_ATTEMPTS);
    }

    public function isPublished(): bool
    {
        return $this->published_at !== null;
    }

    /** The core-owned value object subscribers actually see. */
    public function toReceivedEvent(): ReceivedEvent
    {
        return new ReceivedEvent(
            eventId: $this->event_id,
            name: $this->name,
            module: $this->module,
            schemaVersion: $this->schema_version,
            tenantId: $this->tenant_id,
            actorId: $this->actor_id,
            aggregateType: $this->aggregate_type,
            aggregateId: $this->aggregate_id,
            payload: $this->payload,
            occurredAt: $this->occurred_at,
        );
    }
}
