<?php

declare(strict_types=1);

namespace Tests\Architecture;

use App\Support\Modules\ModuleDescriptor;
use App\Support\Modules\ModuleRegistry;
use FilesystemIterator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;
use Tests\TestCase;

/**
 * Rules about the shape of the codebase, not its behaviour.
 *
 * A modular monolith does not fail loudly when a boundary is crossed — it just
 * gets a little harder to change, one import at a time, until the eleven
 * modules are one program that cannot be split. These tests are the thing that
 * makes that failure loud, on the commit that causes it, while it is still one
 * line to undo.
 */
final class ModuleBoundaryTest extends TestCase
{
    private const MODULES_PATH = 'Modules';

    /**
     * Module-to-module imports that are accepted, and why.
     *
     * Everything not listed here is a boundary violation. Adding an entry is a
     * deliberate architectural decision that shows up in a diff, which is the
     * entire point of keeping the list here rather than in a comment.
     *
     * @var array<string, array<string, string>>
     */
    private const ALLOWED_EDGES = [
        // A reporting module reads across the business by definition; this is
        // the "read model or analytics table" case in the module contract.
        // It reads only — Analytics never writes another module's tables.
        'Analytics' => [
            'Menu' => 'Reporting reads the catalogue for food-cost and ABC analysis.',
            'Orders' => 'Reporting reads bills for revenue, cheque and channel figures.',
            'Finance' => 'Reporting reads payments and expenses for the P&L.',
        ],

        // Known, deliberate, and scheduled to move onto the event bus when
        // these modules are next worked on: `orders.confirmed` opens a ticket,
        // `suppliers.delivery_received` raises stock. Recorded rather than
        // hidden so the debt is visible and cannot grow.
        'Kitchen' => [
            'Orders' => 'A ticket is opened from a bill. To become a subscriber to orders.confirmed.',
        ],
        'Suppliers' => [
            'Inventory' => 'Receiving a delivery raises stock. To become a publisher of suppliers.delivery_received.',
        ],
    ];

    /** Tables that legitimately belong to no single restaurant. */
    private const TENANT_FREE_TABLES = [
        // The tenant list itself, and identity, which discovers the tenant.
        'tenants', 'users', 'password_reset_tokens', 'sessions', 'personal_access_tokens',
        // Framework plumbing.
        'migrations', 'cache', 'cache_locks', 'jobs', 'job_batches', 'failed_jobs',
        // Platform-wide RBAC: a role means the same thing in every restaurant.
        'permissions', 'roles', 'model_has_permissions', 'model_has_roles', 'role_has_permissions',
        // Keyed by event rather than restaurant; the event row carries tenant_id.
        'processed_domain_events',
        // Polymorphic attachments — isolation comes from the model that owns them.
        'media',
        // Local development instrumentation, never installed in production.
        'telescope_entries', 'telescope_entries_tags', 'telescope_monitoring',
        'pulse_entries', 'pulse_aggregates', 'pulse_values',
    ];

    // ============ Module boundaries ============

    public function test_no_module_imports_another_module_except_where_recorded(): void
    {
        $violations = [];

        foreach ($this->crossModuleImports() as $from => $targets) {
            foreach ($targets as $to => $files) {
                if (isset(self::ALLOWED_EDGES[$from][$to])) {
                    continue;
                }

                $violations[] = sprintf(
                    '%s imports %s (%s). Use a core contract (App\Contracts) or a domain event instead.',
                    $from,
                    $to,
                    implode(', ', array_slice($files, 0, 3)),
                );
            }
        }

        $this->assertSame([], $violations, "Module boundary crossed:\n".implode("\n", $violations));
    }

    public function test_every_recorded_exception_is_still_real(): void
    {
        // An allowance nobody uses is a licence left lying around. Removing it
        // here is what stops the list becoming decoration.
        $actual = $this->crossModuleImports();
        $stale = [];

        foreach (self::ALLOWED_EDGES as $from => $targets) {
            foreach (array_keys($targets) as $to) {
                if (! isset($actual[$from][$to])) {
                    $stale[] = "{$from} -> {$to}";
                }
            }
        }

        $this->assertSame([], $stale, 'Allowed edges that no longer exist — delete them: '.implode(', ', $stale));
    }

    public function test_the_core_never_depends_on_a_module(): void
    {
        $violations = [];

        foreach ($this->phpFilesIn(base_path('app')) as $file) {
            $source = (string) file_get_contents($file->getPathname());

            if (preg_match('/^use Modules\\\\/m', $source) === 1) {
                $violations[] = $this->relative($file->getPathname());
            }
        }

        // The direction of dependency is the whole architecture: modules may
        // lean on the core, never the reverse. A core that imported Menu could
        // not boot without it, and no module could ever be removed.
        $this->assertSame([], $violations, 'Core files importing a module: '.implode(', ', $violations));
    }

    public function test_a_module_never_reaches_into_another_modules_tables(): void
    {
        $tablesByModule = $this->tablesByModule();
        $violations = [];

        foreach ($this->phpFilesIn(base_path(self::MODULES_PATH)) as $file) {
            $path = $this->relative($file->getPathname());

            if (str_contains($path, '/tests/') || str_contains($path, '/database/')) {
                continue;
            }

            $owner = $this->moduleOf($path);
            $source = (string) file_get_contents($file->getPathname());

            foreach ($tablesByModule as $module => $tables) {
                // Same allowances as the import rule: an edge that is recorded
                // as accepted is accepted however it is expressed.
                if ($module === $owner || isset(self::ALLOWED_EDGES[$owner][$module])) {
                    continue;
                }

                foreach ($tables as $table) {
                    // A raw query or an `exists:` rule against another module's
                    // table is the same coupling as an import, minus the
                    // visibility — the compiler cannot see it and neither can a
                    // reviewer skimming the use statements.
                    if (preg_match('/(DB::table\(|exists:|unique:)[\'"]?'.preg_quote($table, '/').'\b/', $source) === 1) {
                        $violations[] = "{$path} touches {$module}.{$table}";
                    }
                }
            }
        }

        $this->assertSame([], $violations, implode("\n", $violations));
    }

    // ============ Multi-tenancy ============

    public function test_every_business_table_carries_a_restaurant(): void
    {
        $missing = [];

        foreach ($this->businessTables() as $table) {
            if (! $this->schemaHasColumn($table, 'tenant_id')) {
                $missing[] = $table;
            }
        }

        // A table without `tenant_id` cannot be filtered by the global scope,
        // which means one restaurant's data is visible to all of them. There is
        // no safe version of this bug.
        $this->assertSame([], $missing, 'Tables with no tenant_id: '.implode(', ', $missing));
    }

    public function test_every_tenant_scoped_model_actually_applies_the_scope(): void
    {
        $violations = [];

        foreach ($this->phpFilesIn(base_path(self::MODULES_PATH)) as $file) {
            $path = $this->relative($file->getPathname());

            if (! str_contains($path, '/Models/')) {
                continue;
            }

            $source = (string) file_get_contents($file->getPathname());

            if (! $this->isEloquentModel($source)) {
                continue;
            }

            // Every module model belongs to a restaurant. Declaring the column
            // without the trait is worse than not having it: the data looks
            // isolated and is not.
            if (! str_contains($source, 'BelongsToTenant')) {
                $violations[] = $path;
            }
        }

        $this->assertSame([], $violations, 'Module models without BelongsToTenant: '.implode(', ', $violations));
    }

    // ============ Schema layout ============

    /**
     * Which PostgreSQL schema each module keeps its tables in.
     *
     * The one place the layout is written down. A twelfth module adds a line
     * here and a line in the 0000_01_01_000000 migration, and the tests below
     * hold it to both.
     *
     * @var array<string, string>
     */
    private const MODULE_SCHEMAS = [
        'Menu' => 'menu',
        'Orders' => 'orders',
        'Kitchen' => 'kitchen',
        'Tables' => 'tables',
        'Inventory' => 'inventory',
        'Suppliers' => 'suppliers',
        'Staff' => 'staff',
        'Finance' => 'finance',
        'Crm' => 'crm',
        'TelegramBots' => 'telegram',
        // The till: terminals, sessions, approvals, drawer, receipts, fiscal.
        // Bills stay in Orders and money stays in Finance — Pos reaches both
        // through App\Contracts, which is why it adds no allowed edge above.
        'Pos' => 'pos',
        // Analytics reports across the others and creates no tables of its own;
        // its schema is reserved for projections.
        'Analytics' => 'analytics',
    ];

    public function test_the_platform_runs_on_postgresql(): void
    {
        // Not a preference — the schema-per-module layout, `extract()` in the
        // CRM birthday scope and the outbox's partial indexes all assume it.
        // Testing on a different engine would mean testing a different schema.
        $this->assertSame('pgsql', DB::connection()->getDriverName());
    }

    public function test_the_database_session_agrees_with_the_application_about_time(): void
    {
        $sessionTimezone = DB::selectOne('show timezone')->TimeZone;

        // Laravel stores naive UTC in `timestamp without time zone` columns.
        // PostgreSQL's now() answers in the *server's* timezone, which on a
        // machine in Uzbekistan defaults to Asia/Tashkent — so any SQL comparing
        // a Laravel column against now() was five hours out, and would be out by
        // a different amount on a different server.
        $this->assertSame('UTC', $sessionTimezone);
        $this->assertSame('UTC', config('app.timezone'));

        // And the two clocks must actually agree, not merely be labelled the same.
        $drift = abs(strtotime((string) DB::selectOne('select now() as n')->n) - now()->getTimestamp());
        $this->assertLessThan(5, $drift, "Database and application clocks differ by {$drift}s.");
    }

    public function test_no_module_compares_a_timestamp_column_against_sql_now(): void
    {
        $violations = [];

        foreach ($this->phpFilesIn(base_path(self::MODULES_PATH)) as $file) {
            $path = $this->relative($file->getPathname());

            if (str_contains($path, '/tests/') || str_contains($path, '/database/migrations/')) {
                continue;
            }

            $source = (string) file_get_contents($file->getPathname());

            // `now()` inside raw SQL reintroduces the server-timezone dependency
            // even with the session pinned, because a replica or a pooler may be
            // configured differently. Bind the time from PHP instead.
            if (preg_match('/(whereRaw|selectRaw|havingRaw|orderByRaw|DB::raw)\([^)]*\bnow\(\)/i', $source) === 1) {
                $violations[] = $path;
            }
        }

        $this->assertSame([], $violations, 'Raw SQL using now(): '.implode(', ', $violations));
    }

    public function test_no_module_defeats_an_index_with_a_date_function(): void
    {
        $violations = [];

        foreach ($this->phpFilesIn(base_path(self::MODULES_PATH)) as $file) {
            $path = $this->relative($file->getPathname());

            if (str_contains($path, '/tests/')) {
                continue;
            }

            $source = (string) file_get_contents($file->getPathname());

            // whereDate compiles to `date(column) = ?`. PostgreSQL cannot use an
            // index on a column it has to transform first, so every "today"
            // query becomes a sequential scan on the table that grows fastest.
            // Use App\Support\Tenancy\BusinessDay, which ranges over the raw
            // column and honours the restaurant's own trading day.
            if (preg_match('/->where(Date|Month|Year|Time)\(/', $source) === 1) {
                $violations[] = $path;
            }
        }

        $this->assertSame([], $violations, 'Index-defeating date predicates: '.implode(', ', $violations));
    }

    public function test_every_module_schema_exists(): void
    {
        $existing = collect(DB::select(
            "select nspname from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema'",
        ))->pluck('nspname');

        $missing = collect(self::MODULE_SCHEMAS)->values()
            ->push('public')
            ->diff($existing)
            ->values();

        $this->assertSame([], $missing->all(), 'Schemas not created: '.$missing->implode(', '));
    }

    public function test_every_module_creates_its_tables_in_its_own_schema(): void
    {
        $violations = [];

        foreach (glob(base_path(self::MODULES_PATH.'/*/database/migrations/*.php')) ?: [] as $path) {
            $module = $this->moduleOf($this->relative($path));
            $expected = self::MODULE_SCHEMAS[$module] ?? null;
            $source = (string) file_get_contents($path);

            if ($expected === null) {
                continue;
            }

            if (preg_match_all("/Schema::(?:create|table)\('([a-z0-9_.]+)'/", $source, $matches) === 0) {
                continue;
            }

            foreach ($matches[1] as $table) {
                if (! str_contains($table, '.')) {
                    // Unqualified means "wherever search_path lands it", which
                    // is `public` — a module table in the platform's space.
                    $violations[] = basename($path).": '{$table}' has no schema";

                    continue;
                }

                [$schema] = explode('.', $table);

                // `public` is allowed: a module may legitimately add a column to
                // a core table it extends. Another module's schema never is.
                if ($schema !== $expected && $schema !== 'public') {
                    $violations[] = basename($path).": {$module} writes into the '{$schema}' schema";
                }
            }
        }

        $this->assertSame([], $violations, implode("\n", $violations));
    }

    public function test_every_module_model_names_its_schema(): void
    {
        $violations = [];

        foreach (self::MODULE_SCHEMAS as $module => $schema) {
            $dir = base_path(self::MODULES_PATH."/{$module}/app/Models");

            foreach ($this->phpFilesIn($dir) as $file) {
                $source = (string) file_get_contents($file->getPathname());

                // Traits and enums under Models/ are not models.
                if (! $this->isEloquentModel($source)) {
                    continue;
                }

                if (preg_match("/protected \\\$table = '([a-z0-9_.]+)';/", $source, $match) !== 1) {
                    // Without an explicit table, Eloquent guesses from the class
                    // name and lands in `public`.
                    $violations[] = $this->relative($file->getPathname()).': no $table declared';

                    continue;
                }

                if (! str_starts_with($match[1], "{$schema}.")) {
                    $violations[] = $this->relative($file->getPathname()).": '{$match[1]}' is not in '{$schema}'";
                }
            }
        }

        $this->assertSame([], $violations, implode("\n", $violations));
    }

    public function test_the_search_path_covers_every_schema(): void
    {
        /** @var string $configured */
        $configured = DB::connection()->getConfig('search_path');
        $path = collect(explode(',', $configured))->map(static fn (string $s): string => trim($s));

        $this->assertSame('public', $path->first(), 'public must come first, so unqualified creates land there.');

        $missing = collect(self::MODULE_SCHEMAS)->values()->diff($path)->values();

        // An unqualified reference — `exists:menu_items,id`, or
        // `assertDatabaseHas('orders', …)` — only resolves for schemas on the
        // path. Leaving one off breaks those silently, at runtime.
        $this->assertSame([], $missing->all(), 'Schemas missing from search_path: '.$missing->implode(', '));
    }

    // ============ Module contract (docs/architecture/module-contracts.md) ============

    public function test_every_module_describes_itself_to_the_registry(): void
    {
        $incomplete = [];

        foreach (app(ModuleRegistry::class)->all() as $module) {
            /** @var ModuleDescriptor $module */
            foreach (['uz', 'ru', 'en'] as $locale) {
                if (($module->labels[$locale] ?? '') === '') {
                    $incomplete[] = "{$module->key}: missing {$locale} label";
                }
            }

            if ($module->icon === 'square') {
                $incomplete[] = "{$module->key}: no icon declared";
            }
        }

        // Every client builds its navigation from the registry, in three
        // languages. A module that does not describe itself is invisible.
        $this->assertSame([], $incomplete, implode("\n", $incomplete));
    }

    public function test_every_module_mounts_its_routes_under_its_own_prefix(): void
    {
        $violations = [];

        foreach (app(ModuleRegistry::class)->all() as $module) {
            /** @var ModuleDescriptor $module */
            $routeFile = base_path(self::MODULES_PATH."/{$module->name}/routes/api.php");

            if (! file_exists($routeFile)) {
                $violations[] = "{$module->name}: no routes/api.php";

                continue;
            }

            $source = (string) file_get_contents($routeFile);
            $prefix = str_replace('api/', '', $module->route);

            if (! str_contains($source, "prefix('{$prefix}")) {
                $violations[] = "{$module->name}: routes are not under '{$prefix}'";
            }
        }

        $this->assertSame([], $violations, implode("\n", $violations));
    }

    public function test_every_module_has_tests(): void
    {
        $untested = [];

        foreach (app(ModuleRegistry::class)->all() as $module) {
            /** @var ModuleDescriptor $module */
            $dir = base_path(self::MODULES_PATH."/{$module->name}/tests/Feature");

            if (! is_dir($dir) || $this->phpFilesIn($dir) === []) {
                $untested[] = $module->name;
            }
        }

        $this->assertSame([], $untested, 'Modules with no feature tests: '.implode(', ', $untested));
    }

    // ============ Domain events ============

    public function test_domain_event_names_follow_the_contract(): void
    {
        $violations = [];

        foreach ($this->phpFilesIn(base_path(self::MODULES_PATH)) as $file) {
            $source = (string) file_get_contents($file->getPathname());

            if (! str_contains($source, 'extends DomainEvent')) {
                continue;
            }

            if (preg_match("/function name\(\): string\s*\{\s*return '([^']+)'/", $source, $matches) !== 1) {
                $violations[] = $this->relative($file->getPathname()).': name() is not a plain string literal';

                continue;
            }

            // `orders.paid`, not `OrderPaid` — the string is the wire contract
            // and subscribers match on it, so it must be stable and readable.
            if (preg_match('/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/', $matches[1]) !== 1) {
                $violations[] = $this->relative($file->getPathname()).": '{$matches[1]}' is not module.past_tense";
            }
        }

        $this->assertSame([], $violations, implode("\n", $violations));
    }

    // ============ Hygiene ============

    public function test_no_debugging_statements_survived(): void
    {
        $found = [];

        foreach ([base_path('app'), base_path(self::MODULES_PATH)] as $root) {
            foreach ($this->phpFilesIn($root) as $file) {
                $source = (string) file_get_contents($file->getPathname());

                if (preg_match('/(?<![\w\$>])(dd|dump|var_dump|ray)\s*\(/', $source) === 1) {
                    $found[] = $this->relative($file->getPathname());
                }
            }
        }

        $this->assertSame([], $found, 'Debug calls left behind: '.implode(', ', $found));
    }

    public function test_every_php_file_is_strictly_typed(): void
    {
        $loose = [];

        foreach ([base_path('app'), base_path(self::MODULES_PATH)] as $root) {
            foreach ($this->phpFilesIn($root) as $file) {
                $source = (string) file_get_contents($file->getPathname());

                if (! str_contains($source, 'declare(strict_types=1)')) {
                    $loose[] = $this->relative($file->getPathname());
                }
            }
        }

        // Money is integer tiyin throughout. Without strict types PHP will
        // happily coerce "45000.50" into a price and nobody finds out until
        // the Z-report disagrees with the drawer.
        $this->assertSame([], $loose, 'Files without strict_types: '.implode(', ', $loose));
    }

    // ============ Helpers ============

    /**
     * @return array<string, array<string, array<int, string>>>
     */
    private function crossModuleImports(): array
    {
        $edges = [];

        foreach ($this->phpFilesIn(base_path(self::MODULES_PATH)) as $file) {
            $path = $this->relative($file->getPathname());

            // Tests may reach for another module's factory to build a fixture;
            // that is arranging a scenario, not a runtime dependency.
            if (str_contains($path, '/tests/')) {
                continue;
            }

            $owner = $this->moduleOf($path);
            $source = (string) file_get_contents($file->getPathname());

            if (preg_match_all('/^use Modules\\\\([A-Za-z0-9_]+)\\\\/m', $source, $matches) === 0) {
                continue;
            }

            foreach ($matches[1] as $target) {
                if ($target === $owner) {
                    continue;
                }

                $edges[$owner][$target][] = basename($path);
            }
        }

        return $edges;
    }

    /**
     * Table names each module creates, read from its own migrations.
     *
     * @return array<string, array<int, string>>
     */
    private function tablesByModule(): array
    {
        $tables = [];

        foreach (glob(base_path(self::MODULES_PATH.'/*/database/migrations/*.php')) ?: [] as $path) {
            $module = $this->moduleOf($this->relative($path));
            $source = (string) file_get_contents($path);

            if (preg_match_all("/Schema::create\('([a-z0-9_.]+)'/", $source, $matches) > 0) {
                foreach ($matches[1] as $table) {
                    // Bare name: what another module would write if it reached
                    // across the boundary.
                    $tables[$module][] = str_contains($table, '.') ? explode('.', $table)[1] : $table;
                }
            }
        }

        return $tables;
    }

    /**
     * Every table that exists after migrating, minus the ones that genuinely
     * belong to no restaurant.
     *
     * @return array<int, string>
     */
    private function businessTables(): array
    {
        // RefreshDatabase has already migrated. Running `migrate` again here
        // would try to create every table a second time.
        //
        // Schema-qualified, because a bare name is ambiguous the moment two
        // schemas are in play — and `Schema::hasColumn` needs the qualified form
        // to look outside `public`.
        $tables = array_map(
            static fn (array $table): string => $table['schema_qualified_name'] ?? $table['name'],
            Schema::getTables(),
        );

        return array_values(array_filter(
            $tables,
            static fn (string $table): bool => ! in_array(
                str_contains($table, '.') ? explode('.', $table)[1] : $table,
                self::TENANT_FREE_TABLES,
                true,
            ),
        ));
    }

    private function schemaHasColumn(string $table, string $column): bool
    {
        return Schema::hasColumn($table, $column);
    }

    /**
     * A file under `Models/` that is actually an Eloquent model.
     *
     * The directory also holds traits and enums, which have no table and no
     * tenant of their own.
     */
    private function isEloquentModel(string $source): bool
    {
        return preg_match('/^(final |abstract )?class \w+ extends \w*Model\b/m', $source) === 1;
    }

    private function moduleOf(string $relativePath): string
    {
        $parts = explode('/', str_replace('\\', '/', $relativePath));
        $index = array_search(self::MODULES_PATH, $parts, true);

        return $index === false ? 'Core' : ($parts[$index + 1] ?? 'Core');
    }

    private function relative(string $path): string
    {
        return str_replace('\\', '/', str_replace(base_path().DIRECTORY_SEPARATOR, '', $path));
    }

    /**
     * @return array<int, SplFileInfo>
     */
    private function phpFilesIn(string $directory): array
    {
        if (! is_dir($directory)) {
            return [];
        }

        $files = [];

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS),
        );

        foreach ($iterator as $file) {
            // Blade templates end in .php but are markup, not PHP source, and
            // are never subject to the rules applied here.
            if ($file instanceof SplFileInfo
                && $file->getExtension() === 'php'
                && ! str_ends_with($file->getFilename(), '.blade.php')) {
                $files[] = $file;
            }
        }

        return $files;
    }
}
