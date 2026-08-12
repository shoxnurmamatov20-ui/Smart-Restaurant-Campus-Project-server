<?php

declare(strict_types=1);

namespace App\Support\Events;

use Illuminate\Database\Eloquent\Model;

/**
 * Something that happened, stated as a contract between modules.
 *
 * A module publishes one of these instead of reaching into another module's
 * models. Orders does not know that Kitchen exists; it says "orders.confirmed"
 * and Kitchen decides what that means for it. That is what keeps eleven modules
 * from becoming one tangle, and what will let any of them move to its own
 * service without a rewrite.
 *
 * Subclasses live in the publishing module (`Modules\Orders\Events\OrderPaid`)
 * and are never imported by a consumer — consumers subscribe by name and
 * receive a {@see ReceivedEvent}, which belongs to the core.
 */
abstract class DomainEvent
{
    /**
     * Dotted and past tense: `orders.paid`, `kitchen.ticket_ready`.
     *
     * This string is the actual contract. Renaming a class is safe; renaming
     * this breaks every subscriber.
     */
    abstract public function name(): string;

    /**
     * Everything a subscriber needs, and nothing that would make it depend on
     * the publisher's schema. Ids and values, not models.
     *
     * @return array<string, mixed>
     */
    abstract public function payload(): array;

    /**
     * Bumped when the payload changes shape in a way old subscribers cannot
     * read. Adding a key does not count; removing or retyping one does.
     */
    public function schemaVersion(): int
    {
        return 1;
    }

    /**
     * The module that published this, taken from the namespace so it cannot
     * drift from where the class actually lives.
     */
    public function module(): string
    {
        if (preg_match('/^Modules\\\\([A-Za-z0-9_]+)\\\\/', static::class, $matches) === 1) {
            return $matches[1];
        }

        return 'Core';
    }

    /**
     * What the event is about, so a consumer can correlate without parsing the
     * payload — and so an operator can ask "everything that happened to order 42".
     */
    public function aggregate(): ?Model
    {
        return null;
    }

    /**
     * Pin the event to one restaurant. Almost always inherited from the current
     * request; override only for events that genuinely belong to no tenant.
     */
    public function tenantId(): ?int
    {
        return null;
    }
}
