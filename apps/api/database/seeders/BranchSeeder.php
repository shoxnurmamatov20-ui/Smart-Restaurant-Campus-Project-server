<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Tenant;
use Illuminate\Database\Seeder;

/**
 * The five venues of the demo restaurant.
 *
 * These are the branches the design's sample data names — four Tashkent
 * districts and one other city — so a freshly seeded install shows the same
 * branch switcher, the same comparison table and the same "Chilonzor is 12.4%
 * ahead of yesterday" line that the prototype does.
 *
 * The first one is marked as the head office: something has to be the default
 * a user with no pinned branch lands on, and "whichever row came back first"
 * is not a decision anyone can read later.
 */
final class BranchSeeder extends Seeder
{
    /**
     * @var array<int, array{name: string, slug: string, code: string, city: string, address: string, hq: bool}>
     */
    private const BRANCHES = [
        [
            'name' => 'Chilonzor', 'slug' => 'chilonzor', 'code' => 'CHZ', 'city' => 'Toshkent',
            'address' => 'Chilonzor tumani, Bunyodkor shoh ko\'chasi 12', 'hq' => true,
        ],
        [
            'name' => 'Yunusobod', 'slug' => 'yunusobod', 'code' => 'YUN', 'city' => 'Toshkent',
            'address' => 'Yunusobod tumani, Amir Temur shoh ko\'chasi 108', 'hq' => false,
        ],
        [
            'name' => 'Sergeli', 'slug' => 'sergeli', 'code' => 'SRG', 'city' => 'Toshkent',
            'address' => 'Sergeli tumani, Yangi Sergeli 4-mavze', 'hq' => false,
        ],
        [
            'name' => "Mirzo Ulug'bek", 'slug' => 'mirzo-ulugbek', 'code' => 'MUB', 'city' => 'Toshkent',
            'address' => "Mirzo Ulug'bek tumani, Mustaqillik shoh ko'chasi 59", 'hq' => false,
        ],
        [
            'name' => 'Termiz', 'slug' => 'termiz', 'code' => 'TRM', 'city' => 'Termiz',
            'address' => 'Termiz shahri, Al-Termiziy ko\'chasi 21', 'hq' => false,
        ],
    ];

    public function run(): void
    {
        $tenant = Tenant::query()
            ->where('slug', (string) config('tenancy.default_slug', 'demo-restaurant'))
            ->first();

        if ($tenant === null) {
            $this->command?->warn('⚠️  Demo restoran topilmadi — filiallar yaratilmadi.');

            return;
        }

        foreach (self::BRANCHES as $index => $branch) {
            Branch::query()->withoutGlobalScope('tenant')->updateOrCreate(
                ['tenant_id' => $tenant->id, 'slug' => $branch['slug']],
                [
                    'name' => $branch['name'],
                    'code' => $branch['code'],
                    'city' => $branch['city'],
                    'address' => $branch['address'],
                    'phone' => '+998 71 200 '.str_pad((string) (10 + $index), 2, '0', STR_PAD_LEFT).' 0'.$index,
                    'timezone' => 'Asia/Tashkent',
                    'status' => 'active',
                    'opened_at' => now()->subMonths(36 - ($index * 7))->startOfMonth(),
                    'settings' => $branch['hq'] ? ['is_head_office' => true] : null,
                ],
            );
        }

        $this->command?->info('✅ Filiallar: '.count(self::BRANCHES).' ta venue yaratildi.');
    }
}
