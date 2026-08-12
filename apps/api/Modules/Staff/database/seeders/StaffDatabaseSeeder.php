<?php

declare(strict_types=1);

namespace Modules\Staff\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Staff\Models\StaffMember;

final class StaffDatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $team = [
            ['code' => 'EMP-0001', 'first' => 'Aziz', 'last' => 'Karimov', 'position' => 'chef', 'rate' => 5000000],
            ['code' => 'EMP-0002', 'first' => 'Bekzod', 'last' => 'Tursunov', 'position' => 'cook', 'rate' => 3000000],
            ['code' => 'EMP-0003', 'first' => 'Dilnoza', 'last' => 'Yusupova', 'position' => 'waiter', 'rate' => 2200000],
            ['code' => 'EMP-0004', 'first' => 'Jasur', 'last' => 'Rahimov', 'position' => 'waiter', 'rate' => 2200000],
            ['code' => 'EMP-0005', 'first' => 'Malika', 'last' => 'Sobirova', 'position' => 'cashier', 'rate' => 2500000],
            ['code' => 'EMP-0006', 'first' => 'Sardor', 'last' => 'Nazarov', 'position' => 'bartender', 'rate' => 2400000],
            ['code' => 'EMP-0007', 'first' => 'Ulugbek', 'last' => 'Ismoilov', 'position' => 'courier', 'rate' => 2000000],
            ['code' => 'EMP-0008', 'first' => 'Nodira', 'last' => 'Aliyeva', 'position' => 'host', 'rate' => 2100000],
        ];

        foreach ($team as $t) {
            StaffMember::query()->updateOrCreate(
                ['employee_code' => $t['code']],
                [
                    'first_name' => $t['first'],
                    'last_name' => $t['last'],
                    'phone' => '+998901234567',
                    'position' => $t['position'],
                    'hourly_rate' => $t['rate'],
                    'status' => 'active',
                    'hired_at' => now()->subMonths(random_int(2, 30)),
                    'health_book_expires_at' => now()->addMonths(random_int(1, 11)),
                ],
            );
        }

        $this->command?->info(sprintf('✅ Staff: %d xodim yaratildi.', count($team)));
    }
}
