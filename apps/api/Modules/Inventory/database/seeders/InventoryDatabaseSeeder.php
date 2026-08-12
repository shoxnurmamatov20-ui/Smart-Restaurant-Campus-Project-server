<?php

declare(strict_types=1);

namespace Modules\Inventory\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Inventory\Models\Ingredient;

/**
 * The staples an Uzbek kitchen actually runs on, with believable costs
 * (tiyin per gram / millilitre / piece).
 */
final class InventoryDatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $items = [
            ['sku' => 'ING-0001', 'name' => "Qo'y go'shti", 'unit' => 'g', 'stock' => 45000, 'min' => 10000, 'cost' => 12, 'storage' => 'chilled'],
            ['sku' => 'ING-0002', 'name' => "Mol go'shti", 'unit' => 'g', 'stock' => 38000, 'min' => 10000, 'cost' => 11, 'storage' => 'chilled'],
            ['sku' => 'ING-0003', 'name' => 'Tovuq filesi', 'unit' => 'g', 'stock' => 52000, 'min' => 12000, 'cost' => 6, 'storage' => 'chilled'],
            ['sku' => 'ING-0004', 'name' => 'Guruch (devzira)', 'unit' => 'g', 'stock' => 120000, 'min' => 30000, 'cost' => 3, 'storage' => 'dry'],
            ['sku' => 'ING-0005', 'name' => 'Sabzi', 'unit' => 'g', 'stock' => 80000, 'min' => 20000, 'cost' => 1, 'storage' => 'chilled'],
            ['sku' => 'ING-0006', 'name' => 'Piyoz', 'unit' => 'g', 'stock' => 65000, 'min' => 15000, 'cost' => 1, 'storage' => 'dry'],
            ['sku' => 'ING-0007', 'name' => 'Un', 'unit' => 'g', 'stock' => 95000, 'min' => 25000, 'cost' => 1, 'storage' => 'dry'],
            ['sku' => 'ING-0008', 'name' => "Paxta yog'i", 'unit' => 'ml', 'stock' => 40000, 'min' => 10000, 'cost' => 2, 'storage' => 'dry'],
            ['sku' => 'ING-0009', 'name' => 'Pomidor', 'unit' => 'g', 'stock' => 8000, 'min' => 12000, 'cost' => 2, 'storage' => 'chilled'],
            ['sku' => 'ING-0010', 'name' => 'Tuxum', 'unit' => 'pcs', 'stock' => 180, 'min' => 60, 'cost' => 140000, 'storage' => 'chilled'],
        ];

        foreach ($items as $i) {
            Ingredient::query()->updateOrCreate(
                ['sku' => $i['sku']],
                [
                    'name' => $i['name'],
                    'unit' => $i['unit'],
                    'stock_quantity' => $i['stock'],
                    'min_quantity' => $i['min'],
                    'cost_per_unit' => $i['cost'],
                    'storage' => $i['storage'],
                    'is_active' => true,
                ],
            );
        }

        $this->command?->info(sprintf('✅ Inventory: %d ingredient yaratildi.', count($items)));
    }
}
