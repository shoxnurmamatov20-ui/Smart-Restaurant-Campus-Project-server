<?php

declare(strict_types=1);

namespace App\Contracts\Suppliers;

/**
 * One purchase order seen from the receiving bay.
 *
 * What the storekeeper's dashboard draws in its "kutilmoqda" table: who is
 * coming, how many lines, when it was due, and whether it has already been
 * signed for. What it deliberately does NOT carry is a word like "late" —
 * lateness is a comparison against the clock the READER is holding, and a
 * status baked in here would be stale by the time it crossed the wire.
 */
final readonly class IncomingDelivery
{
    public function __construct(
        public int $id,
        /** `PO-0042` — what the paperwork at the door says. */
        public string $number,
        /** A supplier's trading name. A proper noun; never translated. */
        public string $supplier,
        /** How many lines are on the order. */
        public int $lines,
        /** When it was due, ISO-8601, or null when nobody put a date on it. */
        public ?string $expectedAt,
        /** When it was signed for, ISO-8601. Null while it is still coming. */
        public ?string $receivedAt,
        /** The order's value in tiyin (1 UZS = 100 tiyin). */
        public int $totalTiyin,
    ) {}
}
