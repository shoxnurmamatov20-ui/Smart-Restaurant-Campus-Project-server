<?php

declare(strict_types=1);

namespace Modules\Analytics\Services;

use App\Contracts\Inventory\StockReport;
use App\Contracts\Staff\Roster;
use App\Models\Branch;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use Modules\Analytics\Models\DailyFact;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;

/**
 * Building one day's row in `analytics.daily_facts`.
 *
 * Called by `analytics:rollup` and by nothing else today. Everything here is
 * per (restaurant, venue, trading day), and the caller is responsible for
 * having put the tenant in context — the queries below rely on the global
 * scope, exactly like the rest of the module.
 *
 * ---------------------------------------------------------------------------
 * What is projected and what is not
 *
 * Revenue, takings, discounts, expenses, covers and cost of goods could all be
 * computed live and mostly are — `SalesInsights` still owns the dashboard's
 * headline figures. They are written here anyway, and that is deliberate: a
 * fact table whose rows carry only the two awkward numbers is a table that can
 * never answer a question on its own, and every reader would have to join it
 * back to `orders.orders` to say anything. The projection is cheap; a
 * half-projection is what costs.
 *
 * Labour and waste are the two that CANNOT be computed live from this module —
 * they cross into Staff and Inventory and arrive through
 * `App\Contracts\Staff\Roster` and `App\Contracts\Inventory\StockReport`. They
 * are the reason the table exists.
 *
 * ---------------------------------------------------------------------------
 * One row per venue AND one for the business
 *
 * The roll-up row (`branch_id = null`) is written from its own unscoped pass
 * rather than by summing the venues. It has to be: an order with no branch —
 * a phone order taken before anybody chose a venue — belongs to the business
 * and to no venue, and summing the venues would lose it.
 */
final class DailyRollup
{
    public function __construct(
        private readonly Roster $roster,
        private readonly StockReport $stock,
        private readonly TenantContext $tenants,
        private readonly BranchContext $branches,
    ) {}

    /**
     * Rebuild every row for one trading day, for the tenant in context.
     *
     * @return int How many rows were written — venues plus the business roll-up.
     */
    public function forDay(string $businessDate): int
    {
        $venues = Branch::query()->orderBy('id')->pluck('id')->all();

        $written = 0;

        foreach ($venues as $branchId) {
            $this->write($businessDate, (int) $branchId);
            $written++;
        }

        // And the business, unscoped across venues. See the class note on why
        // this is its own pass rather than a sum of the rows above.
        $this->write($businessDate, null);

        return $written + 1;
    }

    /**
     * One row, upserted on its natural key.
     *
     * `updateOrCreate` rather than `insert`, because a rollup that ran twice —
     * a retry, a backfill, a scheduler that fired on both sides of a deploy —
     * must produce the same row. Two rows for one Tuesday would report a
     * restaurant that earned twice, and the partial unique indexes in the
     * migration are what make the guarantee hold under a race.
     */
    private function write(string $businessDate, ?int $branchId): void
    {
        /*
         * The branch context is set for the duration, because the contracts do
         * not take one. `Roster::payrollBetween()` does — it is Staff's own
         * column — but `StockReport` does not, deliberately: ingredients carry
         * no branch on this platform, so the shelf figures land on the
         * business roll-up and are left at zero per venue rather than being
         * copied five times and summed to five times the truth.
         */
        $previous = $this->branches->branch();
        $this->branches->set($branchId === null ? null : Branch::query()->find($branchId));

        try {
            $orders = $this->orderTotals($businessDate, $branchId);

            DailyFact::updateOrCreate(
                [
                    'tenant_id' => $this->tenants->id(),
                    'branch_id' => $branchId,
                    'business_date' => $businessDate,
                ],
                [
                    'revenue_tiyin' => $orders['revenue'],
                    'takings_tiyin' => $this->takings($businessDate),
                    'discounts_tiyin' => $orders['discounts'],
                    'expenses_tiyin' => $this->expenses($businessDate, $branchId),
                    'cogs_tiyin' => $orders['cogs'],
                    'cogs_coverage_percent' => $orders['coverage'],
                    'labour_tiyin' => $this->roster->payrollBetween($businessDate, $businessDate, $branchId),
                    // Only on the business row — see the note above.
                    'waste_tiyin' => $branchId === null
                        ? $this->stock->wasteValueBetween($businessDate, $businessDate)
                        : 0,
                    'orders_count' => $orders['orders'],
                    'guests_count' => $orders['guests'],
                    'computed_at' => now(),
                ],
            );
        } finally {
            $this->branches->set($previous);
        }
    }

    /**
     * Revenue, covers, discounts and cost of goods, in one scan.
     *
     * The cost side joins the recipe cards through the order lines, and the
     * coverage figure beside it is what stops a partial cost base being read as
     * a gross profit — see the migration.
     *
     * @return array{revenue: int, orders: int, guests: int, discounts: int, cogs: int, coverage: int}
     */
    private function orderTotals(string $businessDate, ?int $branchId): array
    {
        $bills = DB::table('orders.orders')
            ->where('tenant_id', $this->tenants->id())
            ->where('status', 'paid')
            ->where('business_date', $businessDate)
            ->whereNull('deleted_at')
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->selectRaw('coalesce(sum(total), 0)::bigint as revenue')
            ->selectRaw('count(*)::bigint as orders')
            ->selectRaw('coalesce(sum(guests_count), 0)::bigint as guests')
            ->selectRaw('coalesce(sum(discount_total), 0)::bigint as discounts')
            ->first();

        $cost = DB::table('orders.order_items as oi')
            ->join('orders.orders as o', 'o.id', '=', 'oi.order_id')
            ->leftJoin('menu.menu_items as mi', 'mi.id', '=', 'oi.menu_item_id')
            ->where('o.tenant_id', $this->tenants->id())
            ->where('o.status', 'paid')
            ->where('o.business_date', $businessDate)
            ->whereNull('o.deleted_at')
            ->where('oi.status', '!=', 'cancelled')
            ->whereNull('oi.deleted_at')
            ->when($branchId !== null, fn ($query) => $query->where('o.branch_id', $branchId))
            /*
             * A dish with no costed recipe contributes to neither side.
             *
             * `SalesInsights` states the rule this follows: *"an unknown must
             * not read as a triumph"*. Counting an uncosted dish as zero cost
             * would report it as pure profit, which is the single most
             * flattering possible lie about a menu.
             */
            ->selectRaw('coalesce(sum(oi.total_price) filter (where mi.cost_price > 0), 0)::bigint as costed_sales')
            ->selectRaw('coalesce(sum(oi.quantity * mi.cost_price) filter (where mi.cost_price > 0), 0)::bigint as cogs')
            ->selectRaw('coalesce(sum(oi.total_price), 0)::bigint as all_sales')
            ->first();

        $allSales = (int) ($cost->all_sales ?? 0);
        $costedSales = (int) ($cost->costed_sales ?? 0);

        return [
            'revenue' => (int) ($bills->revenue ?? 0),
            'orders' => (int) ($bills->orders ?? 0),
            'guests' => (int) ($bills->guests ?? 0),
            'discounts' => (int) ($bills->discounts ?? 0),
            'cogs' => (int) ($cost->cogs ?? 0),
            'coverage' => $allSales > 0 ? (int) round($costedSales * 100 / $allSales) : 0,
        ];
    }

    /**
     * Money that actually arrived.
     *
     * No explicit branch filter: `Payment` carries `branch_id` and
     * `BelongsToBranch`, so the context this method runs inside is what scopes
     * it — set to one venue for a venue row and cleared for the roll-up, which
     * is the platform's own "an empty branch is a roll-up" rule.
     */
    private function takings(string $businessDate): int
    {
        return (int) Payment::query()
            ->captured()
            ->where('business_date', $businessDate)
            ->sum('amount');
    }

    /**
     * What went out, and why it lands only on the business row.
     *
     * `finance.expenses` carries no `branch_id` — an expense on this platform
     * belongs to the business, like the menu and like the shelf. Spreading one
     * bill across five venues would need an allocation rule nobody has written,
     * and copying it to each would make the venues sum to five times the truth.
     * So the venue rows carry zero and say so, and the roll-up carries the lot.
     */
    private function expenses(string $businessDate, ?int $branchId): int
    {
        if ($branchId !== null) {
            return 0;
        }

        return (int) Expense::query()
            ->where('business_date', $businessDate)
            ->sum('amount');
    }
}
