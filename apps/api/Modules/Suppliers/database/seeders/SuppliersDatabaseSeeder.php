<?php

declare(strict_types=1);

namespace Modules\Suppliers\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Suppliers\Models\Supplier;

final class SuppliersDatabaseSeeder extends Seeder
{
    public function run(): void
    {
        /*
         * Four companies, each in a different category and on a different
         * payment term — the two columns the supplier list filters and sorts
         * by. A demo where every supplier is "other, net 7" teaches the screen
         * nothing and hides a wrong filter.
         *
         * Lead time is what they promise, not what they manage: the market van
         * comes the same morning, the multinational takes three days. The
         * on-time column is measured against `expected_at` on the orders and is
         * deliberately unrelated to this figure.
         */
        $suppliers = [
            ['code' => 'SUP-001', 'name' => 'Toshkent Go\'sht Bazasi', 'terms' => 7, 'category' => 'meat', 'lead' => 1, 'phone' => '+998901112233', 'rating' => 5],
            ['code' => 'SUP-002', 'name' => 'Chorsu Sabzavot', 'terms' => 0, 'category' => 'produce', 'lead' => 0, 'phone' => '+998907741952', 'rating' => 5],
            ['code' => 'SUP-003', 'name' => 'Oq Tegirmon (un va guruch)', 'terms' => 14, 'category' => 'dry', 'lead' => 2, 'phone' => '+998912201108', 'rating' => 4],
            ['code' => 'SUP-004', 'name' => 'Nestle Uzbekistan', 'terms' => 30, 'category' => 'dairy', 'lead' => 3, 'phone' => '+998935076230', 'rating' => 4],
        ];

        foreach ($suppliers as $s) {
            Supplier::query()->updateOrCreate(
                ['code' => $s['code']],
                [
                    'name' => $s['name'],
                    'category' => $s['category'],
                    'contact_name' => 'Menejer',
                    'phone' => $s['phone'],
                    'payment_terms_days' => $s['terms'],
                    'lead_time_days' => $s['lead'],
                    'rating' => $s['rating'],
                    'is_active' => true,
                ],
            );
        }

        $this->command?->info(sprintf('✅ Suppliers: %d yetkazib beruvchi yaratildi.', count($suppliers)));
    }
}
