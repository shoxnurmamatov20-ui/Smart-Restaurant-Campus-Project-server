<?php

declare(strict_types=1);

namespace Modules\Marketplace\Console;

use App\Models\Tenant;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\DatabaseTenancy;
use App\Support\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Modules\Marketplace\Models\Store;
use Modules\Marketplace\Services\Settlements;
use Throwable;

/**
 * Pay the restaurants. Weekly, on a Monday, for the week that has just ended.
 *
 * ---------------------------------------------------------------------------
 * Monday for last Monday–Sunday
 *
 * The default window is the previous ISO week, and the day it runs is the
 * argument for it: a Sunday order delivered at half past midnight belongs to
 * Sunday's trading day, and a run at midnight on Sunday would miss it. By
 * Monday morning every one of those has a `business_date` that cannot move
 * again.
 *
 * `--from`/`--to` override it and are inclusive at both ends, which is what a
 * corrected week or a first run needs. Both paths are the same code, because a
 * payout that can only be produced going forwards is a payout nobody can fix.
 *
 * ---------------------------------------------------------------------------
 * One restaurant at a time, and one failure does not stop the rest
 *
 * A console process starts with `app.bypass_tenancy` on, so every query would
 * read the whole platform and every row would land under no tenant at all.
 * `focusDuring()` pins the connection AND the Eloquent scope to one restaurant
 * for the duration and puts them back afterwards, including when the work
 * throws. Forty restaurants are paid; the one whose data is broken is reported
 * and the other thirty-nine still get their money.
 *
 * ---------------------------------------------------------------------------
 * Running it twice is safe
 *
 * `(tenant_id, store_id, period_start)` is unique and `Settlements::issue()`
 * returns the existing row rather than writing a second. A scheduler that fires
 * twice after a deploy is ordinary; a merchant paid twice is not.
 */
final class SettleMerchants extends Command
{
    protected $signature = 'marketplace:settle
                            {--tenant= : Only this restaurant, by id}
                            {--from= : First day of the period, Y-m-d (default: last Monday)}
                            {--to= : Last day of the period, Y-m-d (default: last Sunday)}
                            {--dry-run : Work out the figures and write nothing}';

    protected $description = 'Issue weekly marketplace statements and stamp the orders they pay for';

    public function handle(DatabaseTenancy $database, TenantContext $tenants, BranchContext $branches, Settlements $settlements): int
    {
        [$from, $to] = $this->window();

        if ($from->greaterThan($to)) {
            $this->error('--from is after --to.');

            return self::FAILURE;
        }

        $this->info(sprintf('Settling %s → %s', $from->toDateString(), $to->toDateString()));

        $only = $this->option('tenant');
        $failures = 0;
        $issued = 0;

        $restaurants = Tenant::query()
            ->when($only !== null, fn ($query) => $query->whereKey((int) $only))
            ->orderBy('id')
            ->get();

        foreach ($restaurants as $tenant) {
            try {
                $issued += $database->focusDuring($tenant->id, function () use ($tenant, $tenants, $branches, $settlements, $from, $to): int {
                    /*
                     * The connection is focused; the Eloquent scope is not.
                     * `BelongsToTenant` reads `TenantContext`, and a console
                     * process has none — so a create() would write a null
                     * `tenant_id` that the policy then refuses. Setting both
                     * and putting both back is what makes this loop safe.
                     */
                    $previousTenant = $tenants->tenant();
                    $previousBranch = $branches->branch();

                    $tenants->set($tenant);
                    $branches->clear();

                    try {
                        $count = 0;

                        foreach (Store::query()->orderBy('id')->get() as $store) {
                            if ($this->option('dry-run')) {
                                $this->line(sprintf('  [dry] %s · %s', $tenant->slug, $store->slug));

                                continue;
                            }

                            $settlement = $settlements->issue($store, $from, $to);

                            $this->line(sprintf(
                                '  %s · %s · %s · %d orders · %s tiyin',
                                $tenant->slug,
                                $store->slug,
                                $settlement->invoice_number,
                                $settlement->orders_count,
                                number_format($settlement->payable_tiyin, thousands_separator: ' '),
                            ));

                            $count++;
                        }

                        return $count;
                    } finally {
                        $tenants->set($previousTenant);
                        $branches->set($previousBranch);
                    }
                });
            } catch (Throwable $failure) {
                // Reported and counted, never rethrown: one restaurant's broken
                // week must not leave the other thirty-nine unpaid.
                $failures++;
                $this->error(sprintf('  %s: %s', $tenant->slug, $failure->getMessage()));
            }
        }

        $this->info(sprintf('%d statement(s) issued, %d restaurant(s) failed.', $issued, $failures));

        return $failures === 0 ? self::SUCCESS : self::FAILURE;
    }

    /**
     * The period, from the options or from last week.
     *
     * ISO weeks — Monday to Sunday — because that is what a merchant's own
     * bookkeeping uses and because `startOfWeek()` without it depends on the
     * server's locale, which is a payout period that changes when somebody
     * edits a config file.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    private function window(): array
    {
        $from = $this->option('from');
        $to = $this->option('to');

        if (is_string($from) && $from !== '') {
            $start = CarbonImmutable::parse($from)->startOfDay();

            $end = is_string($to) && $to !== ''
                ? CarbonImmutable::parse($to)->startOfDay()
                : $start->addDays(6);

            return [$start, $end];
        }

        $lastMonday = CarbonImmutable::now()->startOfWeek(CarbonImmutable::MONDAY)->subWeek();

        return [$lastMonday, $lastMonday->addDays(6)];
    }
}
