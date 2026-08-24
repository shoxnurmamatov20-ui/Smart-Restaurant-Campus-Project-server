<?php

declare(strict_types=1);

namespace App\Contracts\Pos;

/** With no Pos module there are no tills, so there is no ceiling to read. */
final class UnavailableDiscountLimits implements DiscountLimits
{
    public function all(): array
    {
        return [];
    }

    public function set(string $role, int $percent): int
    {
        return 0;
    }
}
