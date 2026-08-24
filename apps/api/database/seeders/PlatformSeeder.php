<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\PlatformInvoice;
use App\Models\PlatformIssue;
use App\Models\PlatformPlan;
use App\Models\Tenant;
use Illuminate\Database\Seeder;

/**
 * The platform's price list, and this month's invoice for everybody on it.
 *
 * The three tiers are the ones `/pricing` prints, in tiyin, and they are the
 * same numbers `pages-fidelity.test.ts` locks: start 2 400 000 and growth
 * 6 900 000 so'm a month, enterprise on application. `pages-fidelity` exists
 * because the marketing page once showed a tariff a hundred times too cheap —
 * a test that counted rows never checked the numbers in them — so a second
 * copy of these figures is exactly the mistake to avoid. Change them here and
 * in `apps/web/src/app/(marketing)/pages-data.ts` together, or not at all.
 *
 * Deterministic, like every other seeder: same seed, same database.
 */
final class PlatformSeeder extends Seeder
{
    public function run(): void
    {
        foreach ([
            [
                'key' => 'start', 'price_tiyin' => 240_000_000, 'position' => 0,
                'branch_limit' => 1, 'user_limit' => 15, 'terminal_limit' => 2, 'order_limit' => 3_000,
                'features' => ['kds'],
            ],
            [
                'key' => 'growth', 'price_tiyin' => 690_000_000, 'position' => 1,
                'branch_limit' => 5, 'user_limit' => 60, 'terminal_limit' => 10, 'order_limit' => 20_000,
                'features' => ['kds', 'delivery', 'multiBranch'],
            ],
            [
                // Every ceiling null: "on application" means the limits are in
                // the contract, not in the product. A large number here would
                // be a limit somebody hits at three in the morning.
                'key' => 'enterprise', 'price_tiyin' => 0, 'position' => 2,
                'branch_limit' => null, 'user_limit' => null, 'terminal_limit' => null, 'order_limit' => null,
                'features' => ['kds', 'delivery', 'loyalty', 'multiBranch'],
            ],
        ] as $plan) {
            PlatformPlan::query()->updateOrCreate(['key' => $plan['key']], $plan);
        }

        $period = now()->startOfMonth();
        $number = 800;

        foreach (Tenant::query()->orderBy('id')->get() as $tenant) {
            $number++;

            $plan = PlatformPlan::query()->where('key', $tenant->plan_key ?? 'growth')->first();

            if ($plan === null) {
                continue;
            }

            PlatformInvoice::query()->updateOrCreate(
                ['tenant_id' => $tenant->id, 'period' => $period->toDateString()],
                [
                    'number' => sprintf('INV-%d-%03d', $period->year, $number),
                    'amount_tiyin' => (int) $plan->price_tiyin,
                    // Paid, because a demo platform whose every customer is in
                    // arrears reads as a product nobody pays for. The dunning
                    // path is exercised by the tests, not by the seed.
                    'status' => 'paid',
                    'paid_at' => $period->copy()->addDays(3),
                    'issued_on' => $period->toDateString(),
                    'due_on' => $period->copy()->addDays(14)->toDateString(),
                    'plan_key' => $plan->key,
                    'branches' => 1,
                ],
            );
        }

        // One open problem, so the overview's fourth KPI is not a permanent
        // zero that nobody would notice going wrong.
        PlatformIssue::query()->firstOrCreate(
            ['title' => 'Fiskal modul: haqiqiy OFD drayveri ulanmagan'],
            [
                'severity' => 'warning',
                'status' => 'open',
                'source' => 'fiscal',
                'body' => 'P11 server tomoni tayyor; drayver va PLU qolgan.',
            ],
        );
    }
}
