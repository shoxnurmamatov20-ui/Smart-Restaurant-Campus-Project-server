<?php

declare(strict_types=1);

namespace Modules\Suppliers\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Suppliers\Models\Supplier;

final class SuppliersDatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $suppliers = [
            ['code' => 'SUP-001', 'name' => 'Toshkent Go\'sht Bazasi', 'terms' => 7],
            ['code' => 'SUP-002', 'name' => 'Chorsu Sabzavot', 'terms' => 0],
            ['code' => 'SUP-003', 'name' => 'Oq Tegirmon (un va guruch)', 'terms' => 14],
            ['code' => 'SUP-004', 'name' => 'Nestle Uzbekistan', 'terms' => 30],
        ];

        foreach ($suppliers as $s) {
            Supplier::query()->updateOrCreate(
                ['code' => $s['code']],
                [
                    'name' => $s['name'],
                    'contact_name' => 'Menejer',
                    'phone' => '+998901112233',
                    'payment_terms_days' => $s['terms'],
                    'rating' => 5,
                    'is_active' => true,
                ],
            );
        }

        $this->command?->info(sprintf('✅ Suppliers: %d yetkazib beruvchi yaratildi.', count($suppliers)));
    }
}
