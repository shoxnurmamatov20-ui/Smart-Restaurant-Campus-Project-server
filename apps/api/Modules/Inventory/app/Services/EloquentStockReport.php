<?php

declare(strict_types=1);

namespace Modules\Inventory\Services;

use App\Contracts\Inventory\ConsumedLine;
use App\Contracts\Inventory\StockReport;
use App\Contracts\Inventory\StockSnapshot;
use Illuminate\Support\Carbon;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\StockMovement;

/**
 * Inventory answering the platform's read contract for the shelf.
 *
 * Three aggregate queries, none of them per row. The caller is a dashboard that
 * re-renders on every navigation, and a query per ingredient over a catalogue
 * of two hundred lines is the difference between a screen and a wait.
 */
final class EloquentStockReport implements StockReport
{
    /**
     * How close to its expiry date something has to be to count as "expiring".
     *
     * Three days, because that is the window a storekeeper can still act in:
     * cook it into a special, move it to another venue, or mark it down. A
     * seven-day warning is a warning about everything, and a one-day warning is
     * a bin liner.
     */
    private const EXPIRY_WARNING_DAYS = 3;

    public function snapshot(): StockSnapshot
    {
        /*
         * Exclusive and in order of urgency — see `StockSnapshot`. PostgreSQL's
         * `filter (where ...)` rather than five queries or five PHP passes: one
         * scan of the catalogue answers all four counts and the value.
         *
         * `expiring` is derived rather than stored, and it is the only one of
         * the four that is an estimate. There are no batch rows on this
         * platform — nothing records "this crate arrived on Tuesday with a
         * fourteen-day life" — so the best available answer is the ingredient's
         * own `shelf_life_days` measured from its last receipt. That is right
         * for a store that turns over and wrong for one holding two deliveries
         * of the same line, which is exactly why the sentence is here rather
         * than only in a column comment.
         */
        $warnBefore = Carbon::now()->addDays(self::EXPIRY_WARNING_DAYS);

        $lastReceipt = StockMovement::query()
            ->where('kind', 'receipt')
            ->selectRaw('ingredient_id, max(happened_at) as at')
            ->groupBy('ingredient_id')
            ->toBase();

        $counts = Ingredient::query()
            ->where('is_active', true)
            ->leftJoinSub($lastReceipt, 'r', 'r.ingredient_id', '=', 'inventory.ingredients.id')
            ->toBase()
            ->selectRaw('count(*) filter (where stock_quantity <= 0) as out_of_stock')
            ->selectRaw(
                'count(*) filter (where stock_quantity > 0 and stock_quantity <= min_quantity) as low',
            )
            ->selectRaw(
                'count(*) filter ('
                .' where stock_quantity > min_quantity'
                .' and shelf_life_days is not null'
                .' and r.at is not null'
                .' and r.at + (shelf_life_days || \' days\')::interval <= ?'
                .') as expiring',
                [$warnBefore],
            )
            ->selectRaw('count(*) as total')
            ->selectRaw('coalesce(sum(greatest(stock_quantity, 0) * cost_per_unit), 0)::bigint as value')
            ->first();

        $out = (int) ($counts->out_of_stock ?? 0);
        $low = (int) ($counts->low ?? 0);
        $expiring = (int) ($counts->expiring ?? 0);
        $total = (int) ($counts->total ?? 0);

        return new StockSnapshot(
            // Whatever is left over. Derived rather than counted so the four
            // always add up to the catalogue, however the three above change.
            ok: max(0, $total - $out - $low - $expiring),
            low: $low,
            out: $out,
            expiring: $expiring,
            valueTiyin: (int) ($counts->value ?? 0),
        );
    }

    public function consumedBetween(string $from, string $to, int $limit = 5): array
    {
        return StockMovement::query()
            ->where('kind', 'consumption')
            ->whereBetween('happened_at', $this->window($from, $to))
            ->join('inventory.ingredients as i', 'i.id', '=', 'inventory.stock_movements.ingredient_id')
            ->groupBy('i.id', 'i.name', 'i.unit', 'i.cost_per_unit')
            ->selectRaw('i.id, i.name, i.unit, i.cost_per_unit')
            // Consumption is stored negative — the sign is the movement's, not
            // the reader's — so it is turned round here rather than leaving
            // every caller to remember.
            ->selectRaw('abs(coalesce(sum(quantity), 0))::bigint as used')
            ->orderByRaw('abs(coalesce(sum(quantity), 0)) * i.cost_per_unit desc')
            ->limit(max(1, $limit))
            ->toBase()
            ->get()
            ->map(fn (object $row): ConsumedLine => new ConsumedLine(
                ingredientId: (int) $row->id,
                // jsonb `{uz,ru,en}` — decoded at the edge that renders it. The
                // contract carries the raw column so a Russian console and an
                // Uzbek one read the same row.
                name: (string) $row->name,
                unit: (string) $row->unit,
                quantity: (int) $row->used,
                costTiyin: (int) $row->used * (int) $row->cost_per_unit,
            ))
            ->all();
    }

    public function wasteValueBetween(string $from, string $to): int
    {
        return (int) StockMovement::query()
            ->where('kind', 'write_off')
            ->whereBetween('happened_at', $this->window($from, $to))
            ->join('inventory.ingredients as i', 'i.id', '=', 'inventory.stock_movements.ingredient_id')
            ->toBase()
            ->selectRaw('coalesce(sum(abs(quantity) * i.cost_per_unit), 0)::bigint as wasted')
            ->value('wasted');
    }

    /**
     * Two datetimes from two dates, inclusive at both ends.
     *
     * A range on the raw column, never `whereDate` — that wraps `happened_at`
     * in a function and PostgreSQL stops using the index, which
     * `ModuleBoundaryTest` refuses by name.
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    private function window(string $from, string $to): array
    {
        return [Carbon::parse($from)->startOfDay(), Carbon::parse($to)->endOfDay()];
    }
}
