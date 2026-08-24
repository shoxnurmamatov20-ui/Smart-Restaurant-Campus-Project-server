<?php

declare(strict_types=1);

namespace Modules\Analytics\Database\Seeders;

use App\Support\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Modules\Analytics\Services\DailyRollup;
use Modules\Orders\Database\Seeders\DemoTradingSeeder;

/**
 * The projection, caught up with the demo week.
 *
 * `analytics.daily_facts` is rolled up every night for yesterday. The demo
 * seeders write bills *into* the last seven days this morning — dated back,
 * after those nights have passed — so the facts for the week hold either
 * nothing or the day as it was before the seed. Everything that reads the
 * projection (the P&L, the cash flow, the coverage caveat) then disagrees
 * with everything that reads the bills.
 *
 * So the demo set ends here: each day of the window is projected again, which
 * `DailyRollup::forDay()` does as an upsert — the same day twice is the same
 * row. Last in the set because Analytics is registered after Orders and
 * Finance, which is also the order the numbers depend on.
 */
final class DemoFactsSeeder extends Seeder
{
    public function run(): void
    {
        if (app(TenantContext::class)->id() === null) {
            $this->command?->warn('⚠️  Analytics: tenant tanlanmagan — demo:seed orqali ishga tushiring.');

            return;
        }

        $rollup = app(DailyRollup::class);
        $today = CarbonImmutable::now()->startOfDay();
        $written = 0;

        for ($back = DemoTradingSeeder::DAYS - 1; $back >= 0; $back--) {
            $written += $rollup->forDay($today->subDays($back)->toDateString());
        }

        $this->command?->info(sprintf('✅ Analytics: oxirgi %d kun qayta proyeksiya qilindi (%d qator).', DemoTradingSeeder::DAYS, $written));
    }
}
