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
            // Lead time is what a buyer plans against, and it is not the same
            // as payment terms: the vegetable market delivers next morning and
            // is paid on the spot, the distributor takes three days and bills
            // in thirty.
            ['code' => 'SUP-001', 'name' => 'Toshkent Go\'sht Bazasi', 'terms' => 7,
                'category' => 'meat', 'lead' => 1],
            ['code' => 'SUP-002', 'name' => 'Chorsu Sabzavot', 'terms' => 0,
                'category' => 'produce', 'lead' => 1],
            ['code' => 'SUP-003', 'name' => 'Oq Tegirmon (un va guruch)', 'terms' => 14,
                'category' => 'dry', 'lead' => 2],
            ['code' => 'SUP-004', 'name' => 'Nestle Uzbekistan', 'terms' => 30,
                'category' => 'beverages', 'lead' => 3],
        ];

        foreach ($suppliers as $s) {
            Supplier::query()->updateOrCreate(
                ['code' => $s['code']],
                [
                    'name' => $s['name'],
                    'category' => $s['category'],
                    'contact_name' => 'Menejer',
                    'phone' => '+998901112233',
                    'payment_terms_days' => $s['terms'],
                    'lead_time_days' => $s['lead'],
                    'rating' => 5,
                    'is_active' => true,
                ],
            );
        }

        $this->command?->info(sprintf('✅ Suppliers: %d yetkazib beruvchi yaratildi.', count($suppliers)));
    }
}
