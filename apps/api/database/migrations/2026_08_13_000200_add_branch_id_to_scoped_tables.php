<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Points the rows that happen at an address at the address they happen at.
 *
 * Everything listed here is a thing you can stand next to: a hall, a table, a
 * booking, an order, a kitchen ticket, a station, a till shift, an employee and
 * their rota. None of them make sense without a venue, and until now they
 * carried only `tenant_id` — so a chain's five restaurants shared one floor
 * plan, one order stream and one cash drawer.
 *
 * Deliberately NOT here, because they belong to the business rather than to a
 * venue: the menu (one brand, one card), customers and loyalty (a guest belongs
 * to the chain), and suppliers. Per-branch stock levels and per-branch prices
 * are real requirements, but they need their own tables rather than a column —
 * that work belongs with the inventory module, not with this migration.
 *
 * Backfill: every existing row is handed to its tenant's first branch, and a
 * tenant with no branch yet gets a "Bosh filial" created for it. Leaving rows
 * with a null branch would be worse than it sounds — the scope treats null as
 * "every branch", so an order with no branch would surface in every venue's
 * list at once.
 */
return new class extends Migration
{
    /**
     * table => the column branch_id should sit after.
     *
     * @var array<string, string>
     */
    private const TABLES = [
        'tables.halls' => 'tenant_id',
        'tables.restaurant_tables' => 'tenant_id',
        'tables.reservations' => 'tenant_id',
        'orders.orders' => 'tenant_id',
        'kitchen.kitchen_stations' => 'tenant_id',
        'kitchen.kitchen_tickets' => 'tenant_id',
        'finance.cash_shifts' => 'tenant_id',
        'staff.staff_members' => 'tenant_id',
        'staff.shifts' => 'tenant_id',
        'staff.attendances' => 'tenant_id',
    ];

    public function up(): void
    {
        foreach (self::TABLES as $table => $after) {
            if (! Schema::hasTable($table) || Schema::hasColumn($table, 'branch_id')) {
                continue;
            }

            Schema::table($table, function (Blueprint $blueprint) use ($after): void {
                $blueprint->foreignId('branch_id')->nullable()->after($after)
                    ->constrained('public.branches')->cascadeOnDelete();
            });
        }

        $this->backfill();

        foreach (array_keys(self::TABLES) as $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            Schema::table($table, function (Blueprint $blueprint): void {
                $blueprint->index(['tenant_id', 'branch_id']);
            });
        }

        // pos.terminals already had the column, added before this table
        // existed, with the comment "no FK: branches are not owned by Pos".
        // The ownership reading was right; the missing constraint was not.
        if (Schema::hasTable('pos.terminals')) {
            Schema::table('pos.terminals', function (Blueprint $blueprint): void {
                $blueprint->foreign('branch_id')->references('id')->on('public.branches')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('pos.terminals')) {
            Schema::table('pos.terminals', function (Blueprint $blueprint): void {
                $blueprint->dropForeign(['branch_id']);
            });
        }

        foreach (array_keys(self::TABLES) as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'branch_id')) {
                continue;
            }

            Schema::table($table, function (Blueprint $blueprint): void {
                $blueprint->dropIndex(['tenant_id', 'branch_id']);
                $blueprint->dropConstrainedForeignId('branch_id');
            });
        }
    }

    /**
     * Give every existing row a home venue.
     */
    private function backfill(): void
    {
        $tenantIds = DB::table('public.tenants')->pluck('id');

        foreach ($tenantIds as $tenantId) {
            $branchId = DB::table('public.branches')
                ->where('tenant_id', $tenantId)
                ->orderBy('id')
                ->value('id');

            $branchId ??= DB::table('public.branches')->insertGetId([
                'tenant_id' => $tenantId,
                'name' => 'Bosh filial',
                'slug' => 'bosh-filial',
                'code' => 'HQ',
                'city' => 'Toshkent',
                'timezone' => 'Asia/Tashkent',
                'status' => 'active',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            // pos.terminals is in this list even though it is not in TABLES:
            // it already had the column, so it needs the backfill but not the
            // ALTER. A till with a null branch would show up at every venue.
            $targets = [...array_keys(self::TABLES), 'pos.terminals'];

            foreach ($targets as $table) {
                if (! Schema::hasTable($table)) {
                    continue;
                }

                DB::table($table)
                    ->where('tenant_id', $tenantId)
                    ->whereNull('branch_id')
                    ->update(['branch_id' => $branchId]);
            }

            // Staff carried a free-text branch_code before this table existed.
            // Where it names a branch that now exists, honour it.
            if (Schema::hasTable('staff.staff_members') && Schema::hasColumn('staff.staff_members', 'branch_code')) {
                $branches = DB::table('public.branches')
                    ->where('tenant_id', $tenantId)
                    ->whereNotNull('code')
                    ->pluck('id', 'code');

                foreach ($branches as $code => $id) {
                    DB::table('staff.staff_members')
                        ->where('tenant_id', $tenantId)
                        ->where('branch_code', $code)
                        ->update(['branch_id' => $id]);
                }
            }
        }
    }
};
