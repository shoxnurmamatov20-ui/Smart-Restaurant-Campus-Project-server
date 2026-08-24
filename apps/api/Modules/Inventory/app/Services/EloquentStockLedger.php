<?php

declare(strict_types=1);

namespace Modules\Inventory\Services;

use App\Contracts\Inventory\StockChange;
use App\Contracts\Inventory\StockLedger;
use Modules\Inventory\Models\Ingredient;

/**
 * The Inventory module's answer to App\Contracts\Inventory\StockLedger.
 *
 * Thin by design: every movement still goes through `Ingredient::move()`, which
 * writes the audit line and the running balance in one transaction. Nothing
 * here writes `stock_quantity` — that is the module's one rule, and a second
 * path around it would be how a stock-take stops reconciling.
 *
 * The lookups run through Eloquent rather than the query builder, so the
 * BelongsToTenant scope applies: an ingredient id from another restaurant's
 * phone finds nothing and comes back as a rejection, not as somebody else's
 * shelf moving.
 */
final class EloquentStockLedger implements StockLedger
{
    public function writeOff(int $ingredientId, int $quantity, string $reason, ?string $reference = null): ?StockChange
    {
        $ingredient = Ingredient::query()->find($ingredientId);

        if ($ingredient === null) {
            return null;
        }

        /*
         * Never more than is there, and never a negative "write-off".
         *
         * The shelf is the ceiling because a write-off larger than the balance
         * is not a bigger loss, it is a wrong number — usually a phone that
         * sent grams where the person typed kilograms. Clamping loses nothing
         * a person can act on and keeps the balance out of the negatives, which
         * `stock.insufficient` already refuses on the direct route.
         */
        $taken = min(max(0, $quantity), max(0, $ingredient->stock_quantity));

        if ($taken === 0) {
            return new StockChange($ingredient->id, 0, $ingredient->stock_quantity);
        }

        $movement = $ingredient->move('write_off', -$taken, $reason, $reference);

        return new StockChange($ingredient->id, -$taken, $movement->balance_after);
    }

    public function recordCount(int $ingredientId, int $counted, ?string $reference = null): ?StockChange
    {
        $ingredient = Ingredient::query()->find($ingredientId);

        if ($ingredient === null) {
            return null;
        }

        $variance = max(0, $counted) - $ingredient->stock_quantity;

        // A count that agrees with the book is still a count, and it is worth
        // saying so — but it is not a movement. Writing a zero-quantity row
        // would put a line in the ledger that moved nothing, and a ledger a
        // storekeeper has to skim past is one they stop reading.
        if ($variance === 0) {
            return new StockChange($ingredient->id, 0, $ingredient->stock_quantity);
        }

        $movement = $ingredient->move(
            'stock_take',
            $variance,
            $variance < 0 ? 'Sanoqda kam chiqdi' : 'Sanoqda ortiq chiqdi',
            $reference,
        );

        return new StockChange($ingredient->id, $variance, $movement->balance_after);
    }
}
