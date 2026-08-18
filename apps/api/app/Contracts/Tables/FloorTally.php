<?php

declare(strict_types=1);

namespace App\Contracts\Tables;

/**
 * How full the room is, as two numbers.
 *
 * `occupied` counts every table a guest is at or has claimed — seated,
 * reserved, waiting on a bill. `free` counts tables a host could seat someone
 * at right now; a table being cleaned is neither, which is why the two do not
 * add up to the room and must not be made to.
 */
final readonly class FloorTally
{
    public function __construct(
        public int $occupied,
        public int $free,
    ) {}
}
