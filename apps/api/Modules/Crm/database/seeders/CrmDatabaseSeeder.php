<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Crm\Models\Customer;

final class CrmDatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $guests = [
            ['phone' => '+998901112233', 'name' => 'Aziz Karimov', 'spent' => 620000000],
            ['phone' => '+998902223344', 'name' => 'Dilnoza Yusupova', 'spent' => 180000000],
            ['phone' => '+998903334455', 'name' => 'Bekzod Tursunov', 'spent' => 45000000],
            ['phone' => '+998904445566', 'name' => 'Malika Sobirova', 'spent' => 12000000],
        ];

        foreach ($guests as $g) {
            $customer = Customer::query()->updateOrCreate(
                ['phone' => $g['phone']],
                [
                    'name' => $g['name'],
                    'visits_count' => max(1, (int) ($g['spent'] / 8000000)),
                    'total_spent' => $g['spent'],
                    'points' => (int) ($g['spent'] / 100000),
                    'is_active' => true,
                ],
            );
            $customer->recalculateTier();
        }

        $this->command?->info(sprintf('✅ CRM: %d mijoz yaratildi.', count($guests)));
    }
}
