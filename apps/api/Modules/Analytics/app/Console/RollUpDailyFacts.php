<?php

declare(strict_types=1);

namespace Modules\Analytics\Console;

use App\Models\Tenant;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\DatabaseTenancy;
use App\Support\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Modules\Analytics\Services\DailyRollup;
use Throwable;

/**
 * Build `analytics.daily_facts` for every restaurant on the platform.
 *
 * Scheduled nightly in `routes/console.php`. Also the backfill tool: pass
 * `--from` and `--to` and it rebuilds any range, which is what a new column or
 * a corrected recipe needs. Both paths are the same code because a projection
 * that can only be built forwards is a projection nobody can fix.
 *
 * ---------------------------------------------------------------------------
 * Yesterday, not today
 *
 * The default window is the day before the current trading day, and the reason
 * is the trading day itself: a restaurant's day runs 06:00 → 06:00, so at
 * 03:20 the "current" business date is still the evening that is finishing and
 * summarising it would freeze a half-finished night. Today's figures are
 * derived live by `SalesInsights` and do not need this.
 *
 * `--from`/`--to` override that and are inclusive at both ends.
 *
 * ---------------------------------------------------------------------------
 * One restaurant at a time, on purpose
 *
 * A console process starts with `app.bypass_tenancy` on, which would make every
 * query below read the whole platform and every row land under whatever tenant
 * happened to be in context — which is none. `focusDuring()` puts the
 * connection AND the Eloquent scope on one restaurant for the duration and puts
 * them back afterwards, including when the work throws. One restaurant failing
 * must not stop the other forty being summarised.
 */
final class RollUpDailyFacts extends Command
{
    protected $signature = 'analytics:rollup
                            {--tenant= : Only this restaurant, by id}
                            {--from= : First trading day, Y-m-d (default: yesterday)}
                            {--to= : Last trading day, Y-m-d (default: same as --from)}';

    protected $description = 'Project each trading day into analytics.daily_facts';

    /**
     * How far back one invocation will go.
     *
     * A guard rather than a policy: `--from=2020-01-01` on a chain is tens of
     * thousands of upserts inside one command, and the honest way to backfill a
     * year is a loop of months that can be watched and stopped.
     */
    private const MAX_DAYS = 400;

    public function handle(DatabaseTenancy $tenancy, TenantContext $tenants, BranchContext $branches): int
    {
        [$from, $to] = $this->window();

        if ($from->diffInDays($to) + 1 > self::MAX_DAYS) {
            $this->error(sprintf('Bir marta %d kundan ko\'p qayta hisoblanmaydi.', self::MAX_DAYS));

            return self::FAILURE;
        }

        $restaurants = Tenant::query()
            ->when($this->option('tenant') !== null, fn ($query) => $query->whereKey((int) $this->option('tenant')))
            ->orderBy('id')
            ->get();

        $rows = 0;
        $failed = 0;

        foreach ($restaurants as $restaurant) {
            try {
                $rows += $tenancy->focusDuring((int) $restaurant->getKey(), function () use (
                    $restaurant, $tenants, $branches, $from, $to
                ): int {
                    $previousTenant = $tenants->tenant();
                    $previousBranch = $branches->branch();

                    // The GUC and the Eloquent scope are two separate belts and
                    // both have to move: `focusDuring` sets the first, and the
                    // global scope on every model reads the second.
                    $tenants->set($restaurant);
                    $branches->clear();

                    try {
                        $written = 0;
                        $rollup = app(DailyRollup::class);

                        for ($day = $from; $day->lessThanOrEqualTo($to); $day = $day->addDay()) {
                            $written += $rollup->forDay($day->toDateString());
                        }

                        return $written;
                    } finally {
                        $tenants->set($previousTenant);
                        $branches->set($previousBranch);
                    }
                });
            } catch (Throwable $failure) {
                // Loud, named, and not fatal. A restaurant whose data is in a
                // state this cannot summarise must not cost the other forty
                // their nightly figures.
                $failed++;
                $this->error(sprintf(
                    '#%d %s — %s',
                    $restaurant->getKey(),
                    $restaurant->slug,
                    $failure->getMessage(),
                ));
            }
        }

        $this->info(sprintf(
            'Yozildi: %d qator, %s — %s, %d restoran.',
            $rows,
            $from->toDateString(),
            $to->toDateString(),
            $restaurants->count() - $failed,
        ));

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    private function window(): array
    {
        $from = $this->option('from') !== null
            ? CarbonImmutable::parse((string) $this->option('from'))
            : CarbonImmutable::now()->subDay();

        $to = $this->option('to') !== null
            ? CarbonImmutable::parse((string) $this->option('to'))
            : $from;

        // A range typed backwards is a typo, not a request for nothing.
        return $from->lessThanOrEqualTo($to) ? [$from, $to] : [$to, $from];
    }
}
