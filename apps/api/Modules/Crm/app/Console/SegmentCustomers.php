<?php

declare(strict_types=1);

namespace Modules\Crm\Console;

use App\Models\Tenant;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\DatabaseTenancy;
use App\Support\Tenancy\TenantContext;
use Illuminate\Console\Command;
use Modules\Crm\Models\Customer;
use Modules\Crm\Services\SegmentReader;
use Throwable;

/**
 * Put every guest in the bucket their visits say they are in.
 *
 * Scheduled nightly in `routes/console.php`. Nightly rather than on every
 * settled bill for one reason: three of the four segments are about the passage
 * of TIME, not about anything a guest did. A regular becomes at-risk on the
 * thirty-first quiet day, and nothing happens on that day for an event to hang
 * off — which is precisely why the at-risk list on the console was empty and
 * had no way of filling.
 *
 * ---------------------------------------------------------------------------
 * `corporate` is never written and never overwritten
 *
 * It is somebody's decision about a company account rather than a pattern in
 * the visits, so `SegmentReader::classify()` answers `null` for those rows and
 * this walks past them. A nightly pass that recomputed it would wipe the tag
 * every night and nobody would ever work out why the corporate segment kept
 * emptying itself.
 *
 * ---------------------------------------------------------------------------
 * One restaurant at a time, on purpose
 *
 * A console process starts with `app.bypass_tenancy` on, which would make the
 * query below read the whole platform and every write land under whatever
 * tenant happened to be in context — which is none. `focusDuring()` puts the
 * connection AND the Eloquent scope on one restaurant, and puts them back
 * afterwards including when the work throws: one restaurant failing must not
 * cost the other forty their segmentation.
 */
final class SegmentCustomers extends Command
{
    protected $signature = 'crm:segment
                            {--tenant= : Only this restaurant, by id}
                            {--dry-run : Report what would move, write nothing}';

    protected $description = 'Classify every guest as regular, occasional or at-risk';

    /** Guests read per round trip. A chain with two hundred thousand must not become memory. */
    private const CHUNK = 500;

    public function handle(DatabaseTenancy $tenancy, TenantContext $tenants, BranchContext $branches): int
    {
        $restaurants = Tenant::query()
            ->when($this->option('tenant') !== null, fn ($query) => $query->whereKey((int) $this->option('tenant')))
            ->orderBy('id')
            ->get();

        $moved = 0;
        $failed = 0;

        foreach ($restaurants as $restaurant) {
            try {
                $moved += $tenancy->focusDuring((int) $restaurant->getKey(), function () use (
                    $restaurant, $tenants, $branches
                ): int {
                    $previousTenant = $tenants->tenant();
                    $previousBranch = $branches->branch();

                    // The GUC and the Eloquent scope are two separate belts and
                    // both have to move.
                    $tenants->set($restaurant);
                    $branches->clear();

                    try {
                        return $this->classifyAll();
                    } finally {
                        $tenants->set($previousTenant);
                        $branches->set($previousBranch);
                    }
                });
            } catch (Throwable $failure) {
                // Loud, named, and not fatal.
                $failed++;
                $this->error(sprintf('#%d %s — %s', $restaurant->getKey(), $restaurant->slug, $failure->getMessage()));
            }
        }

        $this->info(sprintf(
            '%s: %d mijoz, %d restoran.',
            $this->option('dry-run') ? 'Ko\'chardi (quruq yurish)' : 'Segment yangilandi',
            $moved,
            $restaurants->count() - $failed,
        ));

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    private function classifyAll(): int
    {
        $reader = app(SegmentReader::class);
        $dry = (bool) $this->option('dry-run');
        $moved = 0;

        Customer::query()
            ->orderBy('id')
            ->chunkById(self::CHUNK, function ($guests) use ($reader, $dry, &$moved): void {
                foreach ($guests as $guest) {
                    $segment = $reader->classify($guest);

                    // `null` is "leave this one alone" — a corporate account.
                    // Unchanged is a write nobody needs: `updated_at` moving on
                    // two hundred thousand rows every night is two hundred
                    // thousand rows of WAL for nothing.
                    if ($segment === null || $segment === $guest->segment) {
                        continue;
                    }

                    $moved++;

                    if (! $dry) {
                        $guest->forceFill(['segment' => $segment])->save();
                    }
                }
            });

        return $moved;
    }
}
