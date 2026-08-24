<?php

declare(strict_types=1);

namespace App\Contracts\Kitchen;

/**
 * How one section of the line is doing, in the three numbers a manager acts on.
 *
 * `code` is the station's own word — `grill`, `hot`, `cold`, `bar`, `pastry` —
 * and not its display name, because the console already words those and a
 * second list of station names is a second list to keep in step.
 *
 * `averageMinutes` is null when nothing left that station in the window. Null
 * and zero are different answers and only one of them is a reason to walk over:
 * a grill that has cooked nothing has no speed, and a bar averaging zero
 * minutes would be a bar that is winning.
 *
 * `targetMinutes` travels beside it because a duration means nothing on its
 * own. Eleven minutes is a disaster on a cold section and normal on a grill,
 * and it is the ratio between the two that turns the bar amber.
 */
final readonly class StationSpeed
{
    public function __construct(
        public string $code,
        /** Dockets on this section that nobody has finished yet. */
        public int $openTickets,
        /** Fired to ready, averaged over the window. Null when none finished. */
        public ?int $averageMinutes,
        /** The SLA this section is held to, in minutes. */
        public int $targetMinutes,
    ) {}
}
