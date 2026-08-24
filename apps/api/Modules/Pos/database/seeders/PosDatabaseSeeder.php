<?php

declare(strict_types=1);

namespace Modules\Pos\Database\Seeders;

use App\Models\Branch;
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
 * Six terminals across three branches — the venue modes and the branch spread
 * both matter, and the constant below says why. Everyone who can work a till
 * gets a PIN, so the lock screen is a staff room rather than an empty grid.
 *
 * Idempotent — running it twice re-issues pairing codes and leaves everything
 * else alone.
 */
final class PosDatabaseSeeder extends Seeder
{
    /**
     * The tills, per branch, as the design draws them.
     *
     * Two things are being satisfied at once. The design's terminal-health
     * table lists POS-1..3 and KDS-1 at Chilonzor and POS-1 at each of the
     * other venues — which is why the codes repeat across branches and why
     * that had to become legal before this seeder could exist. And the four
     * venue modes each need a till, because the mode is the thing worth
     * seeing: one code base behaving like a restaurant, a counter, a bar and
     * a café.
     *
     * POS-3 at Chilonzor is deliberate. It is the terminal the design's idle
     * screen and settings preview are drawn against ("POS-3 · Chilonzor"), so
     * anyone comparing the built screen to the design is comparing like with
     * like.
     *
     * @var array<int, array{branch: string, code: string, name: string, mode: string}>
     */
    private const TERMINALS = [
        ['branch' => 'chilonzor', 'code' => 'POS-1', 'name' => 'Asosiy kassa', 'mode' => 'table_service'],
        ['branch' => 'chilonzor', 'code' => 'POS-2', 'name' => 'Fast food peshtaxtasi', 'mode' => 'quick_service'],
        ['branch' => 'chilonzor', 'code' => 'POS-3', 'name' => 'Kirish — kutish ekrani', 'mode' => 'counter'],
        ['branch' => 'chilonzor', 'code' => 'BAR-1', 'name' => 'Bar', 'mode' => 'bar'],
        ['branch' => 'yunusobod', 'code' => 'POS-1', 'name' => 'Asosiy kassa', 'mode' => 'table_service'],
        ['branch' => 'sergeli', 'code' => 'POS-1', 'name' => 'Asosiy kassa', 'mode' => 'table_service'],
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

        /*
         * The global scope needs a tenant, and a seeder has no request to get
         * one from.
         *
         * Remembered before it is replaced, and restored at the end rather than
         * cleared — see below. `DatabaseSeeder` sets a tenant for the whole run
         * and eleven seeders after this one rely on it.
         */
        $before = app(TenantContext::class)->tenant();

        app(TenantContext::class)->set($tenant);

        // Branch slug → id, read once. A till with no branch has no venue name
        // to print and no room to count, which is the whole of the idle screen.
        $branches = Branch::query()->pluck('id', 'slug');

        $pairing = app(TerminalPairing::class);
        $codes = [];

        foreach (self::TERMINALS as $definition) {
            $branchId = $branches[$definition['branch']] ?? null;

            if ($branchId === null) {
                $this->command?->warn("⚠️  {$definition['code']}: '{$definition['branch']}' filiali topilmadi — o'tkazib yuborildi.");

                continue;
            }

            /*
             * `withoutGlobalScope('branch')`, and this one is not optional.
             *
             * DatabaseSeeder pins BranchContext to the head office before
             * calling any module seeder, so every Terminal query silently
             * carries `where branch_id = <head office>`. This seeder writes to
             * three branches on purpose, so the lookup for POS-1 at Yunusobod
             * searched `branch_id = 1 AND branch_id = 2`, found nothing, and
             * inserted a duplicate — which passed on a fresh database and blew
             * up with a unique violation the second time anybody re-seeded.
             *
             * Any seeder that writes outside the head office needs this. The
             * tenant scope stays: crossing THAT boundary is never intended.
             */
            /** @var Terminal $terminal */
            $terminal = Terminal::query()->withoutGlobalScope('branch')->firstOrCreate(
                // Both halves of the identity, matching the unique index: the
                // same code in two branches is two different tills.
                ['code' => $definition['code'], 'branch_id' => $branchId],
                [
                    'name' => $definition['name'],
                    'mode' => $definition['mode'],
                    'status' => 'active',
                    'settings' => [
                        'currency' => 'UZS',
                        // Nothing below one so'm exists in circulation.
                        'cash_rounding_tiyin' => 100,
                        /*
                         * How much of a bill each role may take off unsupervised,
                         * in whole percent — P9's ladder.
                         *
                         * A waiter: nothing, they ask. A cashier: enough to round
                         * a bill down for a regular. A manager: a fifth, which is
                         * the figure apps/web/src/lib/roles.ts draws its chips
                         * from. This said 30 and the console said 20, so the
                         * picker offered a percentage the server then refused.
                         *
                         * Above a role's number the chip is still offered — it
                         * raises an approval instead of applying one. `0` does not
                         * mean "no discounts", it means "every one goes to a
                         * manager", which is what a waiter's row says.
                         */
                        'discount_limits' => [
                            'waiter' => 0,
                            'bartender' => 0,
                            'cashier' => 5,
                            'branch-manager' => 20,
                            /*
                             * The same twenty, not fifty.
                             *
                             * A brand manager is senior to a branch manager in
                             * SCOPE — more venues — and a discount ceiling is not
                             * about scope. It is about one guest's cheque, and one
                             * cheque is the same size in either job. Fifty percent
                             * is half a table given away, which has no operational
                             * reason behind it; it was a fourth number nobody
                             * enforced. In practice the row is inert for anyone
                             * holding `pos.approve` — the gate never reaches the
                             * ladder for them — so its only real job is to be the
                             * honest answer if that permission is ever taken away.
                             */
                            'brand-manager' => 20,
                        ],
                    ],
                ],
            );

            $codes[$definition['code'].' · '.$definition['branch']] = $pairing->issueCode($terminal);
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

        /*
         * Put back what was there, never clear.
         *
         * Clearing looked like tidiness and was a silent bug with a long reach:
         * `DatabaseSeeder` pins one tenant for the entire run, and everything
         * scheduled after this seeder — `PurchaseOrderSeeder`, `CrmPromoSeeder`,
         * `CrmFeedbackSeeder`, `ReservationSeeder`, `MarketplaceDatabaseSeeder` —
         * inherits it. With it cleared, any of them that did not set its own
         * context wrote rows with a null `tenant_id`.
         *
         * `CrmPromoSeeder` was one, and the consequence was invisible until the
         * customer app tried to use it: `BelongsToTenant` scopes every read by
         * tenant, so the three seeded promo codes existed in the table and
         * `POST /public/promo-codes/check` answered `promo.not_found` for all of
         * them. The whole promotions feature was dead on every seeded database
         * and nothing failed.
         */
        app(TenantContext::class)->set($before);

        // What was actually created, not what was asked for — a missing branch
        // skips its till, and reporting the constant's length would hide that.
        $this->command?->info('✅ POS: '.count($codes)." terminal, {$enrolled} PIN.");

        foreach ($codes as $code => $pairingCode) {
            $this->command?->line("   {$code} → ulash kodi: {$pairingCode}");
        }

        $this->command?->line('   PIN: cashier 3003 · waiter 4004 · manager 2002 · owner 1001');
    }
}
