<?php

declare(strict_types=1);

namespace App\Contracts\Tables;

/**
 * One table in a waiter's own section.
 *
 * Deliberately the furniture and nothing else: a label, how many it sits, what
 * state the floor plan holds it in, and when it was claimed. What is running on
 * it — the bill, the covers, how long the party has been there — is a fact
 * about an ORDER and belongs to that module; the caller joins the two.
 *
 * That split is not tidiness. It is what keeps this contract from becoming a
 * way to read the dining room: a table row carries no guest, no total and no
 * ticket, so the widest thing it can answer is "A-7 seats four and is taken".
 *
 * `kind` is the table's own word — `regular`, `vip`, `terrace`, `bar` — and
 * `zone` is what the hall is actually called in this restaurant. Both travel,
 * because the console groups by the first and prints the second: a fixed union
 * of three zone names compiled beautifully and quietly lost every fourth hall.
 */
final readonly class FloorSeat
{
    public function __construct(
        public int $id,
        /** What is painted on the table — `A-7`. A label, not an index. */
        public string $label,
        public int $seats,
        /** `regular` | `vip` | `terrace` | `bar`. */
        public string $kind,
        /** The hall's own name, or null when the table belongs to none. */
        public ?string $zone,
        /** `free` | `occupied` | `reserved` | `cleaning`. */
        public string $status,
        /** When this waiter took it, ISO-8601. Null when it is not held. */
        public ?string $claimedAt,
    ) {}
}
