<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Tenant;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Seeder;
use Modules\Crm\Database\Seeders\CrmDatabaseSeeder;
use Modules\Crm\Database\Seeders\CrmFeedbackSeeder;
use Modules\Finance\Database\Seeders\FinanceDatabaseSeeder;
use Modules\Finance\Database\Seeders\FinancePaymentSeeder;
use Modules\Inventory\Database\Seeders\InventoryDatabaseSeeder;
use Modules\Kitchen\Database\Seeders\KitchenDatabaseSeeder;
use Modules\Kitchen\Database\Seeders\KitchenTicketSeeder;
use Modules\Menu\Database\Seeders\MenuDatabaseSeeder;
use Modules\Orders\Database\Seeders\OrdersDatabaseSeeder;
use Modules\Staff\Database\Seeders\StaffDatabaseSeeder;
use Modules\Staff\Database\Seeders\StaffShiftSeeder;
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

                // The rota. Depends only on the hired staff above, but kept
                // with the other derived seeders so the reading order matches
                // the dependency order.
                StaffShiftSeeder::class,

                // Reviews hang off paid orders; bookings hang off the tables
                // laid out above. Both belong after the things they reference.
                CrmFeedbackSeeder::class,
                ReservationSeeder::class,
            ]);
        } finally {
            activity()->enableLogging();
            app(BranchContext::class)->clear();
            app(TenantContext::class)->clear();
        }
    }
}
