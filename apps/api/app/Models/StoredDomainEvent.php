<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Events\ReceivedEvent;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * One row of the outbox.
 *
 * Deliberately NOT using BelongsToTenant: the relay runs from a console command
 * with no tenant context and must see every restaurant's pending events. It sets
 * the context per event instead, from this row's own `tenant_id`.
 *
 * @property int $id
 * @property string $event_id
 * @property int|null $tenant_id
 * @property string $name
 * @property string $module
 * @property int $schema_version
 * @property int|null $actor_id
 * @property string|null $aggregate_type
 * @property int|null $aggregate_id
 * @property array<string, mixed> $payload
 * @property CarbonImmutable $occurred_at
 * @property CarbonImmutable|null $published_at
 * @property CarbonImmutable|null $available_at
 * @property int $attempts
 * @property string|null $last_error
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
