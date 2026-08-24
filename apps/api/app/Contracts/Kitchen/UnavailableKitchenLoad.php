<?php

declare(strict_types=1);

namespace App\Contracts\Kitchen;

/**
 * The kitchen, when the Kitchen module is switched off.
 *
 * Zero dockets and no wait: a restaurant that does not run a KDS has no line
 * to be busy, and the strip simply has nothing to say about it. Bound by
 * `AppServiceProvider::bindIf`, so the module's own binding wins whenever it
 * is registered.
 */
final class UnavailableKitchenLoad implements KitchenLoad
{
    public function pressure(?int $branchId = null): KitchenPressure
    {
        return new KitchenPressure(open: 0, oldestMinutes: null);
    }

    /**
     * No KDS, no sections — and an empty list rather than a row of zeros.
     *
     * The console draws a station bar per row it is given, and four sections
     * all running at zero minutes reads as a kitchen that is instantaneous
     * rather than as a kitchen that is not there.
     */
    public function stations(string $from, string $to, ?int $branchId = null): array
    {
        return [];
    }
}
