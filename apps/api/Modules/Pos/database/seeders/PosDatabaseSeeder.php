<?php

declare(strict_types=1);

namespace Modules\Pos\Database\Seeders;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Seeder;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Services\PinAuthenticator;
use Modules\Pos\Services\TerminalPairing;

/**
 * A till you can actually stand at, thirty seconds after cloning the repo.
 *
 * Four terminals, one per venue mode, because the mode is the thing worth
 * seeing: the same code base looks and behaves like a restaurant, a fast-food
 * counter, a bar and a café. Everyone who can work a till gets a PIN, so the
 * lock screen is a staff room rather than an empty grid.
 *
 * Idempotent — running it twice re-issues pairing codes and leaves everything
 * else alone.
 */
final class PosDatabaseSeeder extends Seeder
{
    /**
     * @var array<int, array{code: string, name: string, mode: string}>
     */
    private const TERMINALS = [
        ['code' => 'KASSA-1', 'name' => 'Asosiy kassa', 'mode' => 'table_service'],
        ['code' => 'KASSA-2', 'name' => 'Fast food', 'mode' => 'quick_service'],
        ['code' => 'BAR-1', 'name' => 'Bar', 'mode' => 'bar'],
        ['code' => 'KAFE-1', 'name' => 'Kafe peshtaxtasi', 'mode' => 'counter'],
    ];

    /**
     * Demo PINs. Obvious on purpose — this seeder never runs in production,
     * and a demo whose credentials nobody can remember demos nothing.
     *
     * @var array<string, string>
     */
    private const PINS = [
        'owner@demo.uz' => '1001',
        'manager@demo.uz' => '2002',
        'cashier@demo.uz' => '3003',
        'waiter@demo.uz' => '4004',
        'chef@demo.uz' => '5005',
        'storekeeper@demo.uz' => '6006',
        'accountant@demo.uz' => '7007',
        'host@demo.uz' => '8008',
    ];

    public function run(): void
    {
        $tenant = Tenant::query()->where('status', 'active')->first();

        if ($tenant === null) {
            $this->command?->warn('Faol restoran topilmadi — avval `php artisan db:seed` ni ishga tushiring.');

            return;
        }

        // The global scope needs a tenant, and a seeder has no request to get
        // one from.
        app(TenantContext::class)->set($tenant);

        $pairing = app(TerminalPairing::class);
        $codes = [];

        foreach (self::TERMINALS as $definition) {
            /** @var Terminal $terminal */
            $terminal = Terminal::query()->firstOrCreate(
                ['code' => $definition['code']],
                [
                    'name' => $definition['name'],
                    'mode' => $definition['mode'],
                    'status' => 'active',
                    'settings' => [
                        'currency' => 'UZS',
                        // Nothing below one so'm exists in circulation.
                        'cash_rounding_tiyin' => 100,
                        // How much of a bill each role may take off unsupervised.
                        // A waiter: nothing. A manager: a third.
                        'discount_limits' => [
                            'waiter' => 0,
                            'bartender' => 0,
                            'cashier' => 5,
                            'branch-manager' => 30,
                            'brand-manager' => 50,
                        ],
                    ],
                ],
            );

            $codes[$definition['code']] = $pairing->issueCode($terminal);
        }

        $pins = app(PinAuthenticator::class);
        $enrolled = 0;

        foreach (self::PINS as $email => $pin) {
            $user = User::query()->where('email', $email)->first();

            if ($user === null) {
                continue;
            }

            $pins->setPin($user, $pin);
            $enrolled++;
        }

        app(TenantContext::class)->clear();

        $this->command?->info('✅ POS: '.count(self::TERMINALS)." terminal, {$enrolled} PIN.");

        foreach ($codes as $code => $pairingCode) {
            $this->command?->line("   {$code} → ulash kodi: {$pairingCode}");
        }

        $this->command?->line('   PIN: cashier 3003 · waiter 4004 · manager 2002 · owner 1001');
    }
}
