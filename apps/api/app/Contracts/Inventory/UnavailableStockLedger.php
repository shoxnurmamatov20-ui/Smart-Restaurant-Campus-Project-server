<?php

declare(strict_types=1);

namespace App\Contracts\Inventory;

use RuntimeException;

/**
 * What a write-off does when the Inventory module is not installed.
 *
 * It refuses, like the other write fallbacks in this directory and unlike the
 * read ones. A missing catalogue can honestly answer "no dishes"; a missing
 * store cannot honestly answer "written off". A phone told its write-off landed
 * would clear that entry from its queue, and the four kilograms of spoiled
 * chicken would exist nowhere at all.
 *
 * A restaurant that genuinely runs without stock control switches the module
 * off, and the staff app then never offers the button.
 */
final class UnavailableStockLedger implements StockLedger
{
    public function writeOff(int $ingredientId, int $quantity, string $reason, ?string $reference = null): ?StockChange
    {
        throw new RuntimeException('Ombor moduli yoqilmagan — chiqimni yozib bo\'lmaydi.');
    }

    public function recordCount(int $ingredientId, int $counted, ?string $reference = null): ?StockChange
    {
        throw new RuntimeException('Ombor moduli yoqilmagan — sanoqni yozib bo\'lmaydi.');
    }
}
