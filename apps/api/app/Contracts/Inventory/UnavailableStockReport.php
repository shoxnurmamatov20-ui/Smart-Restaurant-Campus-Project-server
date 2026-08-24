<?php

declare(strict_types=1);

namespace App\Contracts\Inventory;

/**
 * The shelf when the Inventory module is off: empty, not broken.
 *
 * Zeroes rather than a refusal, matching `UnavailableFloorBoard`: a venue that
 * does not run stock control genuinely has nothing to report, and the
 * storekeeper's dashboard is not on its sidebar either. The reads that would
 * have drawn a donut draw nothing, which is the correct degradation — unlike
 * the WRITE contract next door, whose fallback refuses because a write told
 * "landed" is a fact that disappears.
 */
final class UnavailableStockReport implements StockReport
{
    public function snapshot(): StockSnapshot
    {
        return new StockSnapshot(ok: 0, low: 0, out: 0, expiring: 0, valueTiyin: 0);
    }

    public function consumedBetween(string $from, string $to, int $limit = 5): array
    {
        return [];
    }

    public function wasteValueBetween(string $from, string $to): int
    {
        return 0;
    }
}
