<?php

declare(strict_types=1);

namespace Modules\Kitchen\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Kitchen\Models\KitchenStation;

/**
 * The five stations every kitchen in this platform routes to. The codes must
 * match MenuItem::STATIONS or a dish would be dispatched to a screen nobody
 * is watching.
 */
final class KitchenDatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $stations = [
            ['code' => 'hot', 'name' => 'Issiq sex', 'sla' => 20, 'sort' => 10],
            ['code' => 'cold', 'name' => 'Sovuq sex', 'sla' => 10, 'sort' => 20],
            ['code' => 'grill', 'name' => 'Mangal', 'sla' => 25, 'sort' => 30],
            ['code' => 'bar', 'name' => 'Bar', 'sla' => 5, 'sort' => 40],
            ['code' => 'pastry', 'name' => 'Konditer', 'sla' => 8, 'sort' => 50],
        ];

        foreach ($stations as $s) {
            KitchenStation::query()->updateOrCreate(
                ['code' => $s['code']],
                ['name' => $s['name'], 'sla_minutes' => $s['sla'], 'sort_order' => $s['sort'], 'is_active' => true],
            );
        }

        $this->command?->info(sprintf('✅ Kitchen: %d sex yaratildi.', count($stations)));
    }
}
