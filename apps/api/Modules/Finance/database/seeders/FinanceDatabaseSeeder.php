<?php

declare(strict_types=1);

namespace Modules\Finance\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Finance\Models\CashShift;

final class FinanceDatabaseSeeder extends Seeder
{
    public function run(): void
    {
        CashShift::query()->updateOrCreate(
            ['number' => 'Z-0001'],
            [
                'opened_at' => now()->startOfDay()->addHours(9),
                'opening_cash' => 50000000, // 500 000 so'm float
                'status' => 'open',
            ],
        );

        $this->command?->info('✅ Finance: kassa smenasi ochildi (Z-0001).');
    }
}
