<?php

declare(strict_types=1);

namespace App\Contracts\Pos;

/** With no Pos module there are no tills, so the wall is empty. */
final class UnavailableTerminalRegistry implements TerminalRegistry
{
    public function across(): array
    {
        return [];
    }
}
