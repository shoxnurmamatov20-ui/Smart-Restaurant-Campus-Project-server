<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Tenant;
use Illuminate\Database\Seeder;

/**
 * The default tenant — one restaurant (or restaurant chain) on the platform.
 *
 * In Smart Restaurant Campus a *tenant* is a business, not a venue: "Osh
 * Markazi" with four branches is one tenant. Branch-level separation lives
 * inside the modules.
 */
final class TenantSeeder extends Seeder
{
    public function run(): void
    {
        Tenant::query()->updateOrCreate(
            ['slug' => (string) config('tenancy.default_slug', 'demo-restaurant')],
            [
                'name' => 'Demo Restoran',
                'country_code' => 'UZ',
                'locale' => 'uz',
                'timezone' => 'Asia/Tashkent',
                'status' => 'active',
                'settings' => [
                    'currency' => 'UZS',
                    'service_charge_percent' => 10,
                    'vat_percent' => 12,
                    'business_day_starts_at' => '06:00',
                    'channels' => ['dine_in', 'takeaway', 'delivery'],
                ],
            ],
        );

        $this->command?->info('✅ Tenant: demo restoran yaratildi.');
    }
}
