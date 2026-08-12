<?php

declare(strict_types=1);

namespace App\Support\Events;

use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;

/**
 * What a subscriber actually receives.
 *
 * Deliberately a core type rather than the publisher's event class: Kitchen
 * subscribing to `orders.confirmed` must not have to import anything from
 * Orders, or the decoupling the outbox buys would be given straight back.
 *
 * The shape matches the envelope in docs/architecture/events-and-analytics.md.
 */
final readonly class ReceivedEvent
{
    /**
     * @param array<string, mixed> $payload
     */
    public function __construct(
        public string $eventId,
        public string $name,
        public string $module,
        public int $schemaVersion,
        public ?int $tenantId,
        public ?int $actorId,
        public ?string $aggregateType,
        public ?int $aggregateId,
        public array $payload,
        public CarbonImmutable $occurredAt,
    ) {}

    /** Read one payload key, dot notation included. */
    public function get(string $key, mixed $default = null): mixed
    {
        return Arr::get($this->payload, $key, $default);
    }

    public function integer(string $key, int $default = 0): int
    {
        $value = $this->get($key);

        return is_numeric($value) ? (int) $value : $default;
    }

    public function string(string $key, string $default = ''): string
    {
        $value = $this->get($key);

        return is_scalar($value) ? (string) $value : $default;
    }

    /**
     * The envelope as documented — for logging, for shipping to ClickHouse, and
     * for the day this goes over a broker instead of a database table.
     *
     * @return array<string, mixed>
     */
    public function toEnvelope(): array
    {
        return [
            'event_id' => $this->eventId,
            'event_name' => $this->name,
            'schema_version' => $this->schemaVersion,
            'tenant_id' => $this->tenantId,
            'actor_id' => $this->actorId,
            'module' => $this->module,
            'occurred_at' => $this->occurredAt->toIso8601String(),
            'payload' => $this->payload,
        ];
    }
}
