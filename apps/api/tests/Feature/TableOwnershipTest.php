<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Support\Modules\TableOwnership;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Which module owns which table.
 *
 * Every module keeps its tables in a PostgreSQL schema of its own, and the map
 * is derived from the migrations rather than maintained by hand — the module
 * whose migration ran `Schema::create('menu.menu_items')` owns it and declares
 * its schema in the same line.
 *
 * These assertions keep that map honest, and `db:annotate` writes it into the
 * database so a table always says which module it belongs to.
 */
final class TableOwnershipTest extends TestCase
{
    use RefreshDatabase;

    private function ownership(): TableOwnership
    {
        return app(TableOwnership::class);
    }

    public function test_every_module_table_is_attributed_to_its_module_and_schema(): void
    {
        $map = $this->ownership()->map();

        // Keyed by the qualified name, which is what actually identifies a table
        // once every module has a schema of its own.
        $expected = [
            'menu.menu_items' => 'Menu',
            'menu.menu_categories' => 'Menu',
            'orders.orders' => 'Orders',
            'orders.order_items' => 'Orders',
            'kitchen.kitchen_tickets' => 'Kitchen',
            'tables.restaurant_tables' => 'Tables',
            'inventory.ingredients' => 'Inventory',
            'suppliers.purchase_orders' => 'Suppliers',
            'staff.staff_members' => 'Staff',
            'finance.payments' => 'Finance',
            'crm.customers' => 'Crm',
            'telegram.tg_bots' => 'TelegramBots',
        ];

        foreach ($expected as $table => $module) {
            $this->assertSame($module, $map->get($table), "{$table} should belong to {$module}.");
        }
    }

    public function test_a_bare_table_name_still_resolves_to_its_module(): void
    {
        // Callers that only know the table — a log line, a support query — get
        // an answer without having to know the schema.
        $this->assertSame('Menu', $this->ownership()->ownerOf('menu_items'));
        $this->assertSame('Orders', $this->ownership()->ownerOf('order_items'));
        $this->assertSame('Core', $this->ownership()->ownerOf('users'));
    }

    public function test_each_module_keeps_its_tables_in_exactly_one_schema(): void
    {
        $schemas = $this->ownership()->schemas();

        $this->assertSame('menu', $schemas->get('Menu'));
        $this->assertSame('orders', $schemas->get('Orders'));
        $this->assertSame('telegram', $schemas->get('TelegramBots'));
        $this->assertSame('public', $schemas->get('Core'));

        // A comma means a module spread its tables across two schemas.
        foreach ($schemas as $module => $schema) {
            $this->assertStringNotContainsString(',', $schema, "{$module} spans more than one schema.");
        }
    }

    public function test_platform_tables_belong_to_the_core(): void
    {
        $map = $this->ownership()->map();

        // Identity, tenancy and the event bus are the core's own, and they stay
        // in `public`. A module claiming one would mean the core depends on it.
        foreach (['users', 'tenants', 'domain_events', 'processed_domain_events'] as $table) {
            $this->assertSame('Core', $map->get("public.{$table}"), "{$table} must belong to the core.");
        }
    }

    public function test_no_table_is_claimed_by_two_modules(): void
    {
        // The map is keyed by table, so a double claim would show up as the
        // later migration silently winning. Compare against the raw count.
        $tables = $this->ownership()->byModule()->flatten();

        $this->assertSame(
            $tables->count(),
            $tables->unique()->count(),
            'A table is created by more than one module\'s migrations.',
        );
    }

    public function test_the_map_covers_every_table_the_database_actually_has(): void
    {
        $known = $this->ownership()->map()->keys();

        $actual = collect(Schema::getTables())
            ->map(static fn (array $table): string => $table['schema_qualified_name'] ?? $table['name'])
            // Framework bookkeeping and packages that ship their own migrations.
            ->reject(fn (string $table): bool => in_array($table, [
                'public.migrations', 'public.activity_log', 'public.permissions', 'public.roles',
                'public.model_has_permissions', 'public.model_has_roles', 'public.role_has_permissions',
                'public.telescope_entries', 'public.telescope_entries_tags', 'public.telescope_monitoring',
            ], true));

        $unattributed = $actual->diff($known)->values();

        // A table nobody owns is a table nobody maintains — and it will show up
        // in pgAdmin with no label, which is the problem this map exists to fix.
        $this->assertSame([], $unattributed->all(), 'Tables with no owning module: '.$unattributed->implode(', '));
    }

    public function test_the_annotate_command_reports_the_map(): void
    {
        $exit = Artisan::call('db:annotate', ['--dry' => true]);
        $output = Artisan::output();

        $this->assertSame(0, $exit);

        foreach (['Menu', 'menu_items', 'Kitchen', 'kitchen_tickets', 'TelegramBots'] as $expected) {
            $this->assertStringContainsString($expected, $output);
        }
    }

    public function test_annotating_writes_the_owner_onto_the_table_itself(): void
    {
        $this->artisan('db:annotate')->assertSuccessful();

        $comment = DB::selectOne(
            "select obj_description('menu.menu_items'::regclass) as comment",
        );

        // A table read out of context — in a query plan, a slow-query log, a
        // support ticket — should still say which module owns it.
        $this->assertNotNull($comment?->comment);
        $this->assertStringContainsString('Menu', (string) $comment->comment);
    }
}
