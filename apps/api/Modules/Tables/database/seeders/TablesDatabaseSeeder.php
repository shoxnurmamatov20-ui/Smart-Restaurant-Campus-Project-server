<?php

declare(strict_types=1);

namespace Modules\Tables\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Tables\Models\Hall;
use Modules\Tables\Models\RestaurantTable;

/**
 * A believable floor plan: three halls, 24 tables.
 */
final class TablesDatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $plan = [
            ['code' => 'MAIN', 'name' => 'Asosiy zal', 'prefix' => 'A', 'count' => 12, 'seats' => 4, 'kind' => 'regular'],
            ['code' => 'TERR', 'name' => 'Terassa', 'prefix' => 'T', 'count' => 8, 'seats' => 6, 'kind' => 'terrace'],
            ['code' => 'VIP', 'name' => 'VIP zal', 'prefix' => 'V', 'count' => 4, 'seats' => 10, 'kind' => 'vip'],
        ];

        $tables = 0;
        $sort = 10;

        foreach ($plan as $row) {
            $hall = Hall::query()->updateOrCreate(
                ['code' => $row['code']],
                [
                    'name' => $row['name'],
                    'capacity' => $row['count'] * $row['seats'],
                    'sort_order' => $sort,
                    'is_active' => true,
                ],
            );
            $sort += 10;

            for ($i = 1; $i <= $row['count']; $i++) {
                RestaurantTable::query()->updateOrCreate(
                    ['label' => sprintf('%s-%d', $row['prefix'], $i)],
                    [
                        'hall_id' => $hall->id,
                        'seats' => $row['seats'],
                        'kind' => $row['kind'],
                        'status' => 'free',
                        'qr_token' => bin2hex(random_bytes(16)),
                        'is_active' => true,
                    ],
                );
                $tables++;
            }
        }

        $this->command?->info(sprintf('✅ Tables: %d zal, %d stol yaratildi.', count($plan), $tables));
    }
}
