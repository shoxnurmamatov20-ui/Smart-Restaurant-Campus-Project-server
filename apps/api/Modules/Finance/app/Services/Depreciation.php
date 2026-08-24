<?php

declare(strict_types=1);

namespace Modules\Finance\Services;

use Illuminate\Support\Carbon;
use Modules\Finance\Models\FixedAsset;

/**
 * What the register costs the month it is read against.
 *
 * Straight line, and derived rather than posted — see the `fixed_assets`
 * migration for both decisions. This class is the arithmetic, in one place,
 * because the same number is asked for by three different screens (the asset
 * register, the P&L's "Amortizatsiya" line, and a period close) and three
 * implementations of "how much of an oven is this month" is how a statement
 * comes to disagree with the register printed beside it.
 */
final class Depreciation
{
    /**
     * The charge for one asset in one calendar month, in tiyin.
     *
     * Four rules, and each exists because the naive version gets it wrong:
     *
     *   **Nothing in the month of purchase.** An oven bought on the 28th did not
     *   cost a month of use. The convention is the one Uzbek accounting uses —
     *   the charge begins the month AFTER acquisition — and a part-month
     *   proration would put a different fraction on every asset and reconcile
     *   with nothing.
     *
     *   **Nothing after the life runs out.** Past `useful_life_months` the
     *   asset stands at its residual and stays there.
     *
     *   **Nothing from the month it left.** A fryer sold in March depreciates
     *   through February.
     *
     *   **The last month takes the remainder.** `(cost − residual)` rarely
     *   divides by the life, and sixty equal instalments leave a few tiyin on
     *   the books forever.
     *
     * @param string $month `YYYY-MM`
     */
    public function forAsset(FixedAsset $asset, string $month): int
    {
        $charge = $asset->monthlyCharge();

        if ($charge <= 0) {
            return 0;
        }

        $elapsed = $this->monthsBetween($asset->acquired_on, $month);

        // Month 0 is the month of purchase, month 1 the first charged one.
        if ($elapsed < 1 || $elapsed > $asset->useful_life_months) {
            return 0;
        }

        if ($asset->disposed_on !== null && $this->monthsBetween($asset->disposed_on, $month) >= 0) {
            return 0;
        }

        if ($elapsed < $asset->useful_life_months) {
            return $charge;
        }

        // The final instalment: everything not yet written off.
        return max(0, ($asset->cost - $asset->residual) - $charge * ($asset->useful_life_months - 1));
    }

    /**
     * The whole register's charge for a month, in tiyin.
     *
     * `$branchId` narrows it to one venue, and null means the business — the
     * platform's usual reading of an unset branch, and the one an owner uses.
     *
     * Disposed assets are NOT filtered out in the query. They still owe the
     * months they were held for, and `forAsset()` is what decides that; a
     * `whereNull('disposed_on')` here would silently drop the charge for the two
     * months before a fryer was sold and make a quarter's statement disagree
     * with the two months of it that were already printed.
     *
     * @param string $month `YYYY-MM`
     */
    public function forMonth(string $month, ?int $branchId = null): int
    {
        $total = 0;

        FixedAsset::query()
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            /*
             * Cheap prefilter: nothing bought after the month in question can
             * owe anything for it, and a chain's register outlives its assets.
             *
             * A plain comparison on the raw column, never `whereDate()` — that
             * compiles to `date(acquired_on) = ?`, which PostgreSQL cannot serve
             * from an index, and `ModuleBoundaryTest` fails the build on it.
             * `acquired_on` is already a date, so there is nothing to cast.
             */
            ->where('acquired_on', '<=', $month.'-01')
            ->chunkById(200, function ($assets) use (&$total, $month): void {
                foreach ($assets as $asset) {
                    $total += $this->forAsset($asset, $month);
                }
            });

        return $total;
    }

    /**
     * Whole months from a date to the first of `$month`.
     *
     * Negative when the date is later, which is what the two guards above read.
     */
    private function monthsBetween(Carbon $from, string $month): int
    {
        $target = Carbon::createFromFormat('Y-m-d', $month.'-01');

        if (! $target instanceof Carbon) {
            return -1;
        }

        return ($target->year - $from->year) * 12 + ($target->month - $from->month);
    }
}
