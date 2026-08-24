<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Tenant;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Seeder;
use Modules\Analytics\Database\Seeders\DemoFactsSeeder;
use Modules\Board\Database\Seeders\BoardDatabaseSeeder;
use Modules\Crm\Database\Seeders\CrmCaseSeeder;
use Modules\Crm\Database\Seeders\CrmDatabaseSeeder;
use Modules\Crm\Database\Seeders\CrmFeedbackSeeder;
use Modules\Crm\Database\Seeders\CrmMarketingSeeder;
use Modules\Crm\Database\Seeders\CrmPromoSeeder;
use Modules\Finance\Database\Seeders\DemoTakingsSeeder;
use Modules\Finance\Database\Seeders\FinanceDatabaseSeeder;
use Modules\Finance\Database\Seeders\FinanceLedgerSeeder;
use Modules\Finance\Database\Seeders\FinancePaymentSeeder;
use Modules\Inventory\Database\Seeders\InventoryDatabaseSeeder;
use Modules\Inventory\Database\Seeders\StockMovementSeeder;
use Modules\Kitchen\Database\Seeders\KitchenDatabaseSeeder;
use Modules\Kitchen\Database\Seeders\KitchenTicketSeeder;
use Modules\Marketplace\Database\Seeders\MarketplaceDatabaseSeeder;
use Modules\Menu\Database\Seeders\MenuDatabaseSeeder;
use Modules\Menu\Database\Seeders\MenuModifierSeeder;
use Modules\Orders\Database\Seeders\DemoTradingSeeder;
use Modules\Orders\Database\Seeders\OrdersDatabaseSeeder;
use Modules\Pos\Database\Seeders\PosDatabaseSeeder;
use Modules\Staff\Database\Seeders\StaffDatabaseSeeder;
use Modules\Staff\Database\Seeders\StaffShiftSeeder;
use Modules\Suppliers\Database\Seeders\PurchaseOrderSeeder;
use Modules\Suppliers\Database\Seeders\SuppliersDatabaseSeeder;
use Modules\Tables\Database\Seeders\ReservationSeeder;
use Modules\Tables\Database\Seeders\TablesDatabaseSeeder;

final class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Platform foundation — always safe to run.
        //
        // Branches sit here rather than with the demo content: a real venue
        // installing this needs its own addresses on day one, and every
        // branch-scoped table has a non-null branch_id to satisfy.
        $this->call([
            TenantSeeder::class,
            BranchSeeder::class,
            RolesAndPermissionsSeeder::class,
            /*
             * The platform's price list, and this month's invoice for whoever
             * is on it.
             *
             * NOT demo content, which is why it is up here with the tenants:
             * the tiers are what the product actually sells, and a real venue
             * installing this has to be on one from the first request — the
             * platform console's MRR is plan × venues, and a restaurant with no
             * plan bills nothing forever.
             */
            PlatformSeeder::class,
        ]);

        // Demo content — a working restaurant the moment the app boots.
        // Skipped in production so a live venue never gets fake dishes,
        // fake staff or fake takings in its reports.
        if (app()->environment('production')) {
            return;
        }

        $tenant = Tenant::query()
            ->where('slug', (string) config('tenancy.default_slug', 'demo-restaurant'))
            ->firstOrFail();

        /*
         * Seeding runs in a console command, where nothing has resolved a
         * restaurant from a request. Without this, BelongsToTenant has no tenant
         * to stamp and every seeded row lands with `tenant_id = null` — a full
         * demo restaurant that is invisible to every account in it, because the
         * global scope filters all of it out.
         *
         * This class deliberately does NOT use WithoutModelEvents: muting model
         * events mutes that stamping too, which is exactly how the rows ended up
         * unowned in the first place.
         */
        app(TenantContext::class)->set($tenant);

        /*
         * And the same for the venue. Without it every seeded table, order and
         * shift lands with `branch_id = null`, which BelongsToBranch reads as
         * "belongs to every branch" — so the demo restaurant would show the
         * same twelve tables and the same takings at all five addresses at
         * once. The head office is the one the seeded day happens at; Phase 3
         * spreads the history across branches so the comparison screens have
         * something real to compare.
         */
        $headOffice = Branch::query()
            ->withoutGlobalScope('tenant')
            ->where('tenant_id', $tenant->id)
            ->orderBy('id')
            ->firstOrFail();

        app(BranchContext::class)->set($headOffice);

        // Audit logging is what WithoutModelEvents was really wanted for. Turned
        // off explicitly, so a fresh install does not open with 200 lines of
        // "system created a dish" in the owner's audit trail.
        activity()->disableLogging();

        try {
            // Order matters: Orders reads the seeded menu, so Menu must run first.
            $this->call([
                // Accounts first — a seeded restaurant nobody can sign into is
                // indistinguishable from a broken install.
                UserSeeder::class,
                MenuDatabaseSeeder::class,

                // The questions asked about a dish. After the menu, because it
                // attaches groups to the dishes MenuDatabaseSeeder just made.
                MenuModifierSeeder::class,
                KitchenDatabaseSeeder::class,
                TablesDatabaseSeeder::class,
                InventoryDatabaseSeeder::class,
                SuppliersDatabaseSeeder::class,
                StaffDatabaseSeeder::class,
                CrmDatabaseSeeder::class,
                FinanceDatabaseSeeder::class,
                OrdersDatabaseSeeder::class,

                // Last, and it has to be: a kitchen ticket is derived from an
                // order, so this reads what OrdersDatabaseSeeder just wrote.
                // KitchenDatabaseSeeder above only creates the five stations,
                // which is reference data and belongs early.
                KitchenTicketSeeder::class,

                // Same reason: a payment is derived from a closed order, and
                // an expense is paid out of the shift FinanceDatabaseSeeder
                // opened above.
                FinancePaymentSeeder::class,

                /*
                 * The ledger's furniture — tenders, headings, accounts, assets
                 * and months — and it has to be after the payments above.
                 *
                 * It closes the three oldest months, and a closed month refuses
                 * new money (`PeriodLock`). Run before `FinancePaymentSeeder`,
                 * the first seeded payment landing in one of them would be
                 * rejected and the seed would stop half-built.
                 */
                FinanceLedgerSeeder::class,

                // The last seven days of paid trading, and the tills that took
                // the money — a window `demo:seed` moves forward every morning,
                // so the dashboard's "this week" is never a week old. After
                // FinancePaymentSeeder: its payments are keyed per bill and must
                // not be claimed by the single-shift seeder above.
                DemoTradingSeeder::class,
                DemoTakingsSeeder::class,
                DemoFactsSeeder::class,

                // The tills. After branches (a terminal stands in one) and
                // after UserSeeder (a PIN belongs to a person), and it was
                // simply never listed here — so `db:seed` produced a platform
                // with zero terminals and the POS could not be opened at all.
                PosDatabaseSeeder::class,

                // The rota. Depends only on the hired staff above, but kept
                // with the other derived seeders so the reading order matches
                // the dependency order.
                StaffShiftSeeder::class,

                /*
                 * Purchases, then the stock movements those purchases wrote.
                 *
                 * Both are derived, and the second is derived from the first: the
                 * ledger is built backwards from what is on the shelf, so its last
                 * balance lands exactly on `stock_quantity`. That is the same
                 * principle FinancePaymentSeeder follows — the money in the drawer
                 * equals the money on the receipts — and it is what makes a stock
                 * screen worth looking at. A movement list that does not add up to
                 * the shelf is a list nobody trusts twice.
                 */
                PurchaseOrderSeeder::class,
                StockMovementSeeder::class,

                /*
                 * Campaigns and the loyalty shelf. Reference data — it hangs off
                 * nothing — but kept beside the other CRM seeders so a reader
                 * finds all three in one place rather than two.
                 */
                CrmPromoSeeder::class,

                // Reviews hang off paid orders; bookings hang off the tables
                // laid out above. Both belong after the things they reference.
                CrmFeedbackSeeder::class,
                ReservationSeeder::class,

                /*
                 * The marketing screen's four tabs and the complaints desk.
                 *
                 * `CrmMarketingSeeder` is reference data and could sit anywhere;
                 * `CrmCaseSeeder` cannot — it attaches two of its four
                 * complaints to real guests, so `CrmDatabaseSeeder` has to have
                 * run, and it stamps a branch onto each, so `BranchSeeder` does
                 * too. Kept together and after the reviews, because the desk's
                 * whole point is that a complaint is not a review.
                 */
                CrmMarketingSeeder::class,
                CrmCaseSeeder::class,

                /*
                 * The wall above the counter. After Menu, and it has to be: a
                 * board column points at a menu section, and this reads them
                 * through `MenuCatalog` rather than inventing ids that would
                 * draw three empty headings.
                 */
                BoardDatabaseSeeder::class,

                /*
                 * Last, because it reads what everything above it wrote.
                 *
                 * The eight storefronts stock themselves from the restaurant's
                 * own catalogue through `MenuCatalog`, so `MenuDatabaseSeeder`
                 * has to have run; and a storefront belongs to a venue, so
                 * `BranchSeeder` does too. Placed here rather than beside Menu
                 * for the same reason `KitchenTicketSeeder` is last: a seeder
                 * that reads is a seeder that waits.
                 */
                MarketplaceDatabaseSeeder::class,
            ]);
        } finally {
            activity()->enableLogging();
            app(BranchContext::class)->clear();
            app(TenantContext::class)->clear();
        }
    }
}
