<?php

declare(strict_types=1);

namespace App\Contracts\Kitchen;

/**
 * How busy the line is, in the two numbers a manager glances at.
 *
 * `open` is every docket not yet served — new, accepted or cooking — and
 * `oldestMinutes` is how long the one waiting longest has been waiting, or
 * null when there is none. Two numbers rather than a list for the same
 * reason `FloorTally` is two numbers: a caller that wants the dockets is
 * running a kitchen and belongs behind `/api/v1/kitchen` with its checks.
 */
final readonly class KitchenPressure
{
    public function __construct(
        public int $open,
        public ?int $oldestMinutes,
    ) {}
}
