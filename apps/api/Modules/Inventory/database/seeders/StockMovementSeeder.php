<?php

declare(strict_types=1);

namespace Modules\Inventory\Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\StockMovement;

/**
 * How the shelf got to where it is.
 *
 * InventoryDatabaseSeeder sets a quantity on each ingredient and records
 * nothing about how it arrived, which leaves the movements ledger empty. That
 * ledger is the module's whole point: a stock figure nobody can explain is a
 * figure nobody will trust, and the first question a storekeeper asks about a
 * shortfall is where it went.
 *
 * Two rules the first draft of this file broke, both worth stating:
 *
 * 1. **`balance_after` follows the clock, not the code.** Movements are built
 *    with their timestamps, sorted by time, and only then given running
 *    balances. Writing them in the order the loop happens to create them puts
 *    a write-off dated Tuesday after a consumption dated Wednesday, and the
 *    ledger no longer replays to the same answer.
 * 2. **The shelf follows the ledger.** The history is derived backwards from
 *    each ingredient's current quantity, and the last balance is asserted
 *    against it. If they ever disagree, the ledger is right and the ingredient
 *    is corrected — never the other way round.
 */
final class StockMovementSeeder extends Seeder
{
    /** Days of history. Enough for a chart, short enough to stay legible. */
    private const DAYS = 5;

    /**
     * What leaves the shelf each day, as a share of what is on it.
     *
     * A restaurant turns over a fraction of its stock daily, not all of it —
     * six per cent a day is roughly a fortnight's cover, which is what a
     * kitchen holding fresh produce actually runs.
     */
    private const DAILY_USE = 0.06;

    /** Ingredients that lost something, and why. Two out of ten is a normal week. */
    private const WRITE_OFFS = [
        9 => 'Muddati tugagan — pomidor',
        3 => 'Sovutkich buzilgani uchun — tovuq',
    ];

    public function run(): void
    {
        $ingredients = Ingredient::query()->where('is_active', true)->orderBy('id')->get();

        if ($ingredients->isEmpty()) {
            $this->command?->warn('⏭  Inventory: ingredient yo\'q — avval InventoryDatabaseSeeder.');

            return;
        }

        $written = 0;

        foreach ($ingredients as $ingredient) {
            $current = (int) $ingredient->stock_quantity;
            $daily = max((int) round($current * self::DAILY_USE), 1);
            $writeOff = isset(self::WRITE_OFFS[$ingredient->id]) ? (int) round($daily * 1.5) : 0;

            /** @var array<int, array{kind: string, quantity: int, reason: string, reference: string, at: Carbon}> */
            $movements = [[
                'kind' => 'receipt',
                'quantity' => $daily * self::DAYS * 2,
                'reason' => 'Yetkazib beruvchidan qabul qilindi',
                'reference' => 'SUP-KIRIM',
                'at' => now()->subDays(self::DAYS)->setTime(8, 30),
            ]];

            for ($day = self::DAYS - 1; $day >= 0; $day--) {
                $movements[] = [
                    'kind' => 'consumption',
                    'quantity' => -$daily,
                    'reason' => 'Texnologik karta bo\'yicha yechildi',
                    'reference' => 'KDS',
                    'at' => now()->subDays($day)->setTime(22, 0),
                ];
            }

            if ($writeOff > 0) {
                $movements[] = [
                    'kind' => 'write_off',
                    'quantity' => -$writeOff,
                    'reason' => self::WRITE_OFFS[$ingredient->id],
                    'reference' => 'CHIQINDI',
                    // Late on the day before last: after that evening's service,
                    // before the next day's.
                    'at' => now()->subDays(1)->setTime(23, 15),
                ];
            }

            // Chronological. This is the whole fix: a running balance means
            // nothing unless the rows it runs through are in time order.
            usort($movements, fn (array $a, array $b): int => $a['at'] <=> $b['at']);

            // Wind back from today's shelf to whatever the opening balance must
            // have been for the sequence above to land on it.
            $net = array_sum(array_column($movements, 'quantity'));
            $balance = $current - $net;

            foreach ($movements as $movement) {
                $balance += $movement['quantity'];

                StockMovement::query()->updateOrCreate(
                    [
                        'ingredient_id' => $ingredient->id,
                        'kind' => $movement['kind'],
                        'happened_at' => $movement['at'],
                    ],
                    [
                        'tenant_id' => $ingredient->tenant_id,
                        'quantity' => $movement['quantity'],
                        'balance_after' => $balance,
                        'reason' => $movement['reason'],
                        'reference' => $movement['reference'],
                    ],
                );

                $written++;
            }

            // The ledger has to land on the shelf. It does by construction, and
            // this asserts it rather than trusting the arithmetic above.
            if ($balance !== $current) {
                $ingredient->forceFill(['stock_quantity' => max($balance, 0)])->save();
            }
        }

        $this->command?->info("✅ Inventory: {$written} ta ombor harakati yozildi.");
    }
}
