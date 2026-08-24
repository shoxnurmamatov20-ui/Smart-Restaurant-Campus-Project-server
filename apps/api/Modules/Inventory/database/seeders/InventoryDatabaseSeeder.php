<?php

declare(strict_types=1);

namespace Modules\Inventory\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Inventory\Models\Ingredient;

/**
 * The staples an Uzbek kitchen actually runs on.
 *
 * Cost is tiyin per *base* unit — per gram, per millilitre, per piece — which
 * is the only place this file is easy to get wrong. A kilogram of lamb at
 * 95 000 so'm is 9 500 tiyin per gram, not 12: the column had been filled in
 * as if it were so'm per kilogram, and the whole store room valued out at
 * thirty thousand so'm. Nothing read that figure while the screen showed
 * fixtures, and everything reads it now.
 *
 * Pomidor is deliberately below its reorder point. It is the one row the
 * inventory screen has to draw in red, and a demo where every line is healthy
 * never proves the rail and the pill agree.
 */
final class InventoryDatabaseSeeder extends Seeder
{
    /**
     * Tashkent wholesale, mid-2026. Per kilogram / litre / piece, in so'm —
     * converted to tiyin per base unit below, so the prices stay readable and
     * the arithmetic stays in one place.
     *
     * @var array<int, array{sku: string, name: string, unit: string, buy: string, stock: int, min: int, price: int, storage: string, store: string, shelf: int, barcode: ?string}>
     */
    private const ITEMS = [
        ['sku' => 'ING-0001', 'name' => "Qo'y go'shti", 'unit' => 'g', 'buy' => 'kg', 'stock' => 45000, 'min' => 10000, 'price' => 95_000, 'storage' => 'chilled', 'store' => 'main', 'shelf' => 4, 'barcode' => null],
        ['sku' => 'ING-0002', 'name' => "Mol go'shti", 'unit' => 'g', 'buy' => 'kg', 'stock' => 38000, 'min' => 10000, 'price' => 85_000, 'storage' => 'chilled', 'store' => 'main', 'shelf' => 4, 'barcode' => null],
        ['sku' => 'ING-0003', 'name' => 'Tovuq filesi', 'unit' => 'g', 'buy' => 'kg', 'stock' => 52000, 'min' => 12000, 'price' => 45_000, 'storage' => 'chilled', 'store' => 'kitchen', 'shelf' => 3, 'barcode' => null],
        ['sku' => 'ING-0004', 'name' => 'Guruch (devzira)', 'unit' => 'g', 'buy' => 'sack', 'stock' => 120000, 'min' => 30000, 'price' => 28_000, 'storage' => 'dry', 'store' => 'main', 'shelf' => 365, 'barcode' => '4780015680012'],
        ['sku' => 'ING-0005', 'name' => 'Sabzi', 'unit' => 'g', 'buy' => 'kg', 'stock' => 80000, 'min' => 20000, 'price' => 6_000, 'storage' => 'chilled', 'store' => 'kitchen', 'shelf' => 21, 'barcode' => null],
        ['sku' => 'ING-0006', 'name' => 'Piyoz', 'unit' => 'g', 'buy' => 'kg', 'stock' => 65000, 'min' => 15000, 'price' => 4_500, 'storage' => 'dry', 'store' => 'main', 'shelf' => 60, 'barcode' => null],
        ['sku' => 'ING-0007', 'name' => 'Un', 'unit' => 'g', 'buy' => 'sack', 'stock' => 95000, 'min' => 25000, 'price' => 7_000, 'storage' => 'dry', 'store' => 'main', 'shelf' => 180, 'barcode' => '4780015680029'],
        ['sku' => 'ING-0008', 'name' => "Paxta yog'i", 'unit' => 'ml', 'buy' => 'l', 'stock' => 40000, 'min' => 10000, 'price' => 22_000, 'storage' => 'dry', 'store' => 'kitchen', 'shelf' => 300, 'barcode' => '4780015680036'],
        ['sku' => 'ING-0009', 'name' => 'Pomidor', 'unit' => 'g', 'buy' => 'kg', 'stock' => 8000, 'min' => 12000, 'price' => 12_000, 'storage' => 'chilled', 'store' => 'kitchen', 'shelf' => 7, 'barcode' => null],
        ['sku' => 'ING-0010', 'name' => 'Tuxum', 'unit' => 'pcs', 'buy' => 'tray', 'stock' => 180, 'min' => 60, 'price' => 1_400, 'storage' => 'chilled', 'store' => 'bar', 'shelf' => 25, 'barcode' => '4780015680043'],
    ];

    /**
     * How many base units are in one purchase unit.
     *
     * The three that are not arithmetic are the point of the column: a sack of
     * flour is fifty kilos, a tray of eggs is thirty, and no lookup table of
     * unit *names* can know either — that is a fact about the product, and the
     * console guessing it from `g → kg ÷1000` is what this replaces.
     */
    private const PER_PURCHASE_UNIT = [
        'kg' => 1000,
        'l' => 1000,
        'pcs' => 1,
        'sack' => 50_000,
        'tray' => 30,
    ];

    /**
     * Base units in one sold unit.
     *
     * A price is quoted per kilogram or per litre; stock is held per gram or
     * per millilitre. Eggs are quoted and held the same way, which is why the
     * pieces divide by one.
     */
    private const PER_SOLD_UNIT = ['g' => 1000, 'ml' => 1000, 'pcs' => 1];

    public function run(): void
    {
        foreach (self::ITEMS as $i) {
            Ingredient::query()->updateOrCreate(
                ['sku' => $i['sku']],
                [
                    'name' => $i['name'],
                    'barcode' => $i['barcode'],
                    'unit' => $i['unit'],
                    'purchase_unit' => $i['buy'],
                    'units_per_purchase' => self::PER_PURCHASE_UNIT[$i['buy']],
                    'stock_quantity' => $i['stock'],
                    'min_quantity' => $i['min'],
                    // so'm per kilo → tiyin per gram. Integer throughout: a
                    // fractional tiyin multiplied by a hundred kilos of rice is
                    // a stock valuation nobody can reconcile.
                    'cost_per_unit' => intdiv($i['price'] * 100, self::PER_SOLD_UNIT[$i['unit']]),
                    'storage' => $i['storage'],
                    'store' => $i['store'],
                    'shelf_life_days' => $i['shelf'],
                    'is_active' => true,
                ],
            );
        }

        $this->command?->info(sprintf('✅ Inventory: %d ingredient yaratildi.', count(self::ITEMS)));

        // Called from here rather than from `DatabaseSeeder` because every prep
        // card is a list of ingredients looked up by SKU: the ordering is not a
        // preference, it is the dependency.
        $this->call(PrepItemSeeder::class);
    }
}
