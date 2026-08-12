<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Str;
use Symfony\Component\Process\ExecutableFinder;
use Symfony\Component\Process\Process;

/**
 * Scaffolds a module that already obeys every rule this platform enforces.
 *
 * `php artisan module:make` — nwidart's own generator — produces a generic
 * Laravel module: no schema, no tenant scoping, no permission middleware, no
 * registry metadata, no tests. Against this codebase that module fails the
 * architecture suite on the first run, and the six files that have to be edited
 * *outside* the module folder are not mentioned anywhere it would be noticed.
 *
 * This command produces a module that passes, and edits those six files itself:
 *
 *   1. the schemas migration          — the module's PostgreSQL schema
 *   2. config/database.php            — search_path
 *   3. ModuleBoundaryTest             — MODULE_SCHEMAS
 *   4. RolesAndPermissionsSeeder      — the module's five permissions
 *   5. modules_statuses.json          — nwidart's enabled list
 *   6. tests/                         — a starter test that fails until the
 *                                       module actually does something
 *
 * Usage:
 *   php artisan restaurant:make-module Delivery --icon=truck --group=operations \
 *       --uz="Yetkazib berish" --ru="Доставка" --en="Delivery"
 */
final class MakeModule extends Command
{
    protected $signature = 'restaurant:make-module
                            {name : StudlyCase module name, e.g. Delivery}
                            {--alias= : Route and config alias (default: lowercased name)}
                            {--schema= : PostgreSQL schema (default: the alias)}
                            {--permission= : RBAC prefix (default: the alias)}
                            {--icon=box : lucide icon name for the sidebar}
                            {--group=operations : operations|supply|back-office|growth}
                            {--order= : sidebar position (default: next free)}
                            {--uz= : Uzbek label}
                            {--ru= : Russian label}
                            {--en= : English label}
                            {--description= : One line, in Uzbek}';

    protected $description = 'Scaffold a module that satisfies the platform conventions and register it everywhere';

    private string $moduleName;

    private string $moduleAlias;

    private string $moduleSchema;

    private string $permissionPrefix;

    public function handle(): int
    {
        $this->moduleName = Str::studly((string) $this->argument('name'));
        $this->moduleAlias = Str::lower((string) ($this->option('alias') ?: $this->moduleName));
        $this->moduleSchema = (string) ($this->option('schema') ?: $this->moduleAlias);
        $this->permissionPrefix = (string) ($this->option('permission') ?: $this->moduleAlias);

        if (is_dir($this->modulePath())) {
            $this->error("Modules/{$this->moduleName} allaqachon mavjud.");

            return self::FAILURE;
        }

        $this->newLine();
        $this->info("  {$this->moduleName} moduli yaratilmoqda…");
        $this->line("  <fg=gray>alias={$this->moduleAlias}  schema={$this->moduleSchema}  permission={$this->permissionPrefix}.*</>");
        $this->newLine();

        $this->writeModule();
        $this->registerSchema();
        $this->registerSearchPath();
        $this->registerArchitectureTest();
        $this->registerPermissions();
        $this->registerStatus();
        $this->refreshAutoloader();

        $this->newLine();
        $this->info('  ✅ Modul yaratildi va ro\'yxatdan o\'tkazildi.');
        $this->newLine();
        $this->line('  Keyingi qadamlar:');
        $this->line('    <info>php artisan migrate</info>            <fg=gray>— schema yaratiladi</>');
        $this->line('    <info>php artisan db:seed --class=Database\\Seeders\\RolesAndPermissionsSeeder</info>');
        $this->line('    <info>php vendor/bin/phpunit --testsuite Architecture</info>  <fg=gray>— qoidalar tekshiriladi</>');
        $this->newLine();
        $this->line("  Jadval qo'shganda: <info>Schema::create('{$this->moduleSchema}.…')</info>, modelda ");
        $this->line("  <info>protected \$table = '{$this->moduleSchema}.…'</info> va <info>use BelongsToTenant</info>.");
        $this->newLine();

        return self::SUCCESS;
    }

    // ============ The module itself ============

    private function writeModule(): void
    {
        foreach ([
            'app/Http/Controllers', 'app/Http/Requests', 'app/Http/Resources',
            'app/Models', 'app/Providers', 'app/Services', 'app/Events', 'app/Listeners',
            'config', 'database/migrations', 'database/factories', 'database/seeders',
            'routes', 'tests/Feature', 'tests/Unit',
        ] as $directory) {
            $this->makeDirectory($this->modulePath($directory));
        }

        $this->put('module.json', $this->moduleJson());
        $this->put('composer.json', $this->composerJson());
        $this->put('config/config.php', $this->configFile());
        $this->put("app/Providers/{$this->moduleName}ServiceProvider.php", $this->serviceProvider());
        $this->put('app/Providers/EventServiceProvider.php', $this->eventServiceProvider());
        $this->put('app/Providers/RouteServiceProvider.php', $this->routeServiceProvider());
        $this->put("app/Http/Controllers/{$this->moduleName}Controller.php", $this->infoController());
        $this->put('routes/api.php', $this->routes());
        $this->put('routes/web.php', "<?php\n\ndeclare(strict_types=1);\n");
        $this->put(
            'database/migrations/'.date('Y_m_d_His').'_create_'.$this->moduleSchema.'_schema.php',
            $this->schemaMigration(),
        );
        $this->put("database/seeders/{$this->moduleName}DatabaseSeeder.php", $this->seeder());
        $this->put("tests/Feature/{$this->moduleName}ModuleTest.php", $this->test());

        $this->line("  <fg=gray>✓</> Modules/{$this->moduleName}/");
    }

    private function moduleJson(): string
    {
        return $this->json([
            'name' => $this->moduleName,
            'alias' => $this->moduleAlias,
            'description' => $this->description(),
            'keywords' => ['restaurant', 'smart-restaurant-campus', $this->moduleAlias],
            'priority' => $this->order(),
            'providers' => ["Modules\\{$this->moduleName}\\Providers\\{$this->moduleName}ServiceProvider"],
            'files' => [],
        ]);
    }

    private function composerJson(): string
    {
        return $this->json([
            'name' => 'restaurant-campus/'.Str::kebab($this->moduleName),
            'description' => $this->description(),
            'autoload' => [
                'psr-4' => [
                    "Modules\\{$this->moduleName}\\" => 'app/',
                    "Modules\\{$this->moduleName}\\Database\\Factories\\" => 'database/factories/',
                    "Modules\\{$this->moduleName}\\Database\\Seeders\\" => 'database/seeders/',
                ],
            ],
        ]);
    }

    private function configFile(): string
    {
        return <<<PHP
        <?php

        declare(strict_types=1);

        return [
            'name' => '{$this->moduleName}',
            'alias' => '{$this->moduleAlias}',

            // Registry metadata — GET /api/v1/modules reads these.
            'icon' => '{$this->option('icon')}',
            'group' => '{$this->option('group')}',
            'order' => {$this->order()},
            'route' => 'v1/{$this->moduleAlias}',
            'permission_prefix' => '{$this->permissionPrefix}',

            /*
            |--------------------------------------------------------------------------
            | Module display names (uz / ru / en)
            |--------------------------------------------------------------------------
            */
            'labels' => [
                'uz' => '{$this->label('uz')}',
                'ru' => '{$this->label('ru')}',
                'en' => '{$this->label('en')}',
            ],

            'description' => '{$this->description()}',

            /*
            |--------------------------------------------------------------------------
            | Feature flag
            |--------------------------------------------------------------------------
            | Per-restaurant overrides live in tenants.settings.modules; this is the
            | platform-wide default.
            */
            'enabled' => env('MODULE_{$this->constantAlias()}_ENABLED', true),
        ];

        PHP;
    }

    private function serviceProvider(): string
    {
        return <<<PHP
        <?php

        declare(strict_types=1);

        namespace Modules\\{$this->moduleName}\\Providers;

        use Nwidart\\Modules\\Support\\ModuleServiceProvider;

        class {$this->moduleName}ServiceProvider extends ModuleServiceProvider
        {
            protected string \$name = '{$this->moduleName}';

            protected string \$nameLower = '{$this->moduleAlias}';

            /**
             * @var string[]
             */
            protected array \$providers = [
                EventServiceProvider::class,
                RouteServiceProvider::class,
            ];
        }

        PHP;
    }

    private function eventServiceProvider(): string
    {
        return <<<PHP
        <?php

        declare(strict_types=1);

        namespace Modules\\{$this->moduleName}\\Providers;

        use Illuminate\\Foundation\\Support\\Providers\\EventServiceProvider as ServiceProvider;
        use Illuminate\\Support\\Facades\\Event;

        class EventServiceProvider extends ServiceProvider
        {
            /**
             * @var array<string, array<int, string>>
             */
            protected \$listen = [];

            /**
             * @var bool
             */
            protected static \$shouldDiscoverEvents = true;

            /**
             * Cross-module subscriptions, keyed by event name.
             *
             * Names, not classes: this module must never import another module's
             * event class. See docs/architecture/events-and-analytics.md.
             *
             * @var array<string, array<int, class-string>>
             */
            private const DOMAIN_EVENTS = [
                // 'orders.paid' => [ReactToPaidOrder::class],
            ];

            public function boot(): void
            {
                parent::boot();

                foreach (self::DOMAIN_EVENTS as \$name => \$listeners) {
                    foreach (\$listeners as \$listener) {
                        Event::listen(\$name, \$listener);
                    }
                }
            }

            protected function configureEmailVerification(): void {}
        }

        PHP;
    }

    private function routeServiceProvider(): string
    {
        return <<<PHP
        <?php

        declare(strict_types=1);

        namespace Modules\\{$this->moduleName}\\Providers;

        use Illuminate\\Foundation\\Support\\Providers\\RouteServiceProvider as ServiceProvider;
        use Illuminate\\Support\\Facades\\Route;

        class RouteServiceProvider extends ServiceProvider
        {
            protected string \$name = '{$this->moduleName}';

            public function boot(): void
            {
                parent::boot();
            }

            public function map(): void
            {
                \$this->mapApiRoutes();
                \$this->mapWebRoutes();
            }

            protected function mapWebRoutes(): void
            {
                Route::middleware('web')->group(module_path(\$this->name, '/routes/web.php'));
            }

            /**
             * The route file declares the full path and name (v1/{$this->moduleAlias},
             * api.v1.{$this->moduleAlias}.), so this adds ONLY the /api prefix. Adding a
             * prefix here as well produces /api/v1/v1/… — a mistake this project
             * has already made once, across all eleven modules.
             */
            protected function mapApiRoutes(): void
            {
                Route::middleware('api')->prefix('api')->group(module_path(\$this->name, '/routes/api.php'));
            }
        }

        PHP;
    }

    private function infoController(): string
    {
        return <<<PHP
        <?php

        declare(strict_types=1);

        namespace Modules\\{$this->moduleName}\\Http\\Controllers;

        use App\\Http\\Controllers\\Controller;
        use Illuminate\\Http\\JsonResponse;

        /**
         * Module discovery endpoint — GET /api/v1/{$this->moduleAlias}/.
         *
         * Every module answers this so a client can find its way around without
         * hard-coding routes. Add real counts as the module gains tables.
         */
        final class {$this->moduleName}Controller extends Controller
        {
            public function index(): JsonResponse
            {
                return response()->json([
                    'module' => '{$this->moduleName}',
                    'alias' => '{$this->moduleAlias}',
                    'labels' => config('{$this->moduleAlias}.labels'),
                    'description' => config('{$this->moduleAlias}.description'),
                    'enabled' => (bool) config('{$this->moduleAlias}.enabled', true),
                    'endpoints' => [],
                    'counts' => [],
                ]);
            }
        }

        PHP;
    }

    private function routes(): string
    {
        return <<<PHP
        <?php

        declare(strict_types=1);

        use Illuminate\\Support\\Facades\\Route;
        use Modules\\{$this->moduleName}\\Http\\Controllers\\{$this->moduleName}Controller;

        /*
        |--------------------------------------------------------------------------
        | {$this->moduleName} module API routes
        |--------------------------------------------------------------------------
        | Mounted at /api/v1/{$this->moduleAlias} by RouteServiceProvider.
        |
        | Every route sits behind `auth:sanctum` and `tenant`; every action that
        | touches data carries a Spatie permission:
        |
        |   ->middleware(PermissionMiddleware::using('{$this->permissionPrefix}.view'))
        |
        | Tables belong to the `{$this->moduleSchema}` schema:
        |   Schema::create('{$this->moduleSchema}.things', …)
        |   protected \$table = '{$this->moduleSchema}.things';
        */

        Route::middleware(['auth:sanctum', 'tenant'])
            ->prefix('v1/{$this->moduleAlias}')
            ->name('api.v1.{$this->moduleAlias}.')
            ->group(function (): void {
                // Module info — authenticated, no extra permission needed.
                Route::get('/', [{$this->moduleName}Controller::class, 'index'])->name('info');
            });

        PHP;
    }

    /**
     * The module creates its own schema.
     *
     * The shared `0000_01_01_000000_create_module_schemas` migration lists every
     * schema and builds them all on a fresh install — but it has already run on
     * any database that exists, and Laravel will not run it again just because a
     * line was added. Without this, a module generated against a live database
     * would have a `search_path` entry, an architecture-test entry and no schema,
     * and its first `Schema::create` would fail.
     *
     * `IF NOT EXISTS`, so a fresh install where the shared migration got there
     * first passes straight through.
     */
    private function schemaMigration(): string
    {
        return <<<PHP
        <?php

        declare(strict_types=1);

        use Illuminate\\Database\\Migrations\\Migration;
        use Illuminate\\Support\\Facades\\DB;

        /**
         * The `{$this->moduleSchema}` schema — {$this->moduleName}'s own corner of the database.
         *
         * Every table this module creates belongs here:
         *
         *     Schema::create('{$this->moduleSchema}.things', function (Blueprint \$table): void { … });
         *     protected \$table = '{$this->moduleSchema}.things';
         *
         * See docs/decisions/0010-schema-per-module.md.
         */
        return new class extends Migration
        {
            public function up(): void
            {
                DB::statement('CREATE SCHEMA IF NOT EXISTS "{$this->moduleSchema}"');
                DB::statement('COMMENT ON SCHEMA "{$this->moduleSchema}" IS \\'{$this->moduleName} — {$this->description()}\\'');

                \$role = DB::connection()->getConfig('username');

                if (is_string(\$role) && \$role !== '') {
                    DB::statement('ALTER SCHEMA "{$this->moduleSchema}" OWNER TO "'.\$role.'"');
                }
            }

            public function down(): void
            {
                // RESTRICT, never CASCADE: a rollback that goes one step too far
                // must not take a restaurant's data with it.
                DB::statement('DROP SCHEMA IF EXISTS "{$this->moduleSchema}" RESTRICT');
            }
        };

        PHP;
    }

    private function seeder(): string
    {
        return <<<PHP
        <?php

        declare(strict_types=1);

        namespace Modules\\{$this->moduleName}\\Database\\Seeders;

        use Illuminate\\Database\\Seeder;

        /**
         * Demo content for the {$this->moduleName} module.
         *
         * Runs inside DatabaseSeeder, which has already established the tenant
         * context — so BelongsToTenant stamps every row without this seeder
         * having to pass tenant_id. Keep it idempotent: `updateOrCreate`, or an
         * early return when the data is already there.
         */
        final class {$this->moduleName}DatabaseSeeder extends Seeder
        {
            public function run(): void
            {
                //
            }
        }

        PHP;
    }

    private function test(): string
    {
        return <<<PHP
        <?php

        declare(strict_types=1);

        namespace Modules\\{$this->moduleName}\\Tests\\Feature;

        use App\\Models\\Tenant;
        use App\\Models\\User;
        use Database\\Seeders\\RolesAndPermissionsSeeder;
        use Illuminate\\Foundation\\Testing\\RefreshDatabase;
        use Tests\\TestCase;

        /**
         * {$this->moduleName} module.
         *
         * The platform's minimum for every module: it is reachable, it is behind
         * authentication, and it never leaks across restaurants. Add the module's
         * own domain invariants below as it grows — the arithmetic a restaurant
         * would actually notice being wrong.
         */
        final class {$this->moduleName}ModuleTest extends TestCase
        {
            use RefreshDatabase;

            protected function setUp(): void
            {
                parent::setUp();
                \$this->seed(RolesAndPermissionsSeeder::class);
            }

            public function test_the_module_is_not_reachable_without_signing_in(): void
            {
                \$this->getJson('/api/v1/{$this->moduleAlias}/')->assertStatus(401);
            }

            public function test_the_module_answers_for_a_signed_in_user(): void
            {
                \$user = User::factory()->create();
                \$user->assignRole('owner');
                \$this->actingAs(\$user);

                \$this->getJson('/api/v1/{$this->moduleAlias}/')
                    ->assertOk()
                    ->assertJsonPath('module', '{$this->moduleName}')
                    ->assertJsonPath('alias', '{$this->moduleAlias}');
            }

            public function test_the_module_appears_in_the_capability_manifest(): void
            {
                \$user = User::factory()->create();
                \$user->assignRole('owner');
                \$this->actingAs(\$user);

                \$modules = collect(\$this->getJson('/api/v1/modules')->assertOk()->json('data'))
                    ->keyBy('key');

                \$this->assertTrue(\$modules->has('{$this->moduleAlias}'), 'The module is missing from GET /api/v1/modules.');
                \$this->assertTrue(\$modules['{$this->moduleAlias}']['available']);
            }

            public function test_switching_the_module_off_closes_its_routes(): void
            {
                \$tenant = Tenant::query()->create([
                    'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
                    'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
                ]);

                \$user = User::factory()->create(['tenant_id' => \$tenant->id]);
                \$user->assignRole('owner');
                \$this->actingAs(\$user);

                \$this->patchJson('/api/v1/modules/{$this->moduleAlias}', ['enabled' => false])->assertOk();

                \$this->getJson('/api/v1/{$this->moduleAlias}/')
                    ->assertStatus(403)
                    ->assertJsonPath('code', 'MODULE_DISABLED');
            }
        }

        PHP;
    }

    // ============ Registration outside the module ============

    private function registerSchema(): void
    {
        $file = database_path('migrations/0000_01_01_000000_create_module_schemas.php');
        $source = (string) file_get_contents($file);
        $entry = "        '{$this->moduleSchema}' => '{$this->moduleName} — {$this->description()}',";

        if (str_contains($source, "'{$this->moduleSchema}' =>")) {
            $this->line("  <fg=gray>✓</> schema '{$this->moduleSchema}' allaqachon ro'yxatda");

            return;
        }

        $source = str_replace(
            "    ];\n\n    public function up(): void",
            "{$entry}\n    ];\n\n    public function up(): void",
            $source,
        );

        file_put_contents($file, $source);
        $this->line("  <fg=gray>✓</> schemas migration → '{$this->moduleSchema}'");
    }

    private function registerSearchPath(): void
    {
        $file = config_path('database.php');
        $source = (string) file_get_contents($file);

        if (str_contains($source, ",{$this->moduleSchema}")) {
            return;
        }

        // Appended, never prepended: `public` must stay first so an unqualified
        // create lands in the platform's space.
        $source = preg_replace(
            "/('public,[a-z,]+)'/",
            "$1,{$this->moduleSchema}'",
            $source,
            1,
        );

        file_put_contents($file, (string) $source);
        $this->line('  <fg=gray>✓</> config/database.php → search_path');
    }

    private function registerArchitectureTest(): void
    {
        $file = base_path('tests/Architecture/ModuleBoundaryTest.php');
        $source = (string) file_get_contents($file);

        if (str_contains($source, "'{$this->moduleName}' => '")) {
            return;
        }

        $source = preg_replace(
            "/(private const MODULE_SCHEMAS = \[\n)/",
            "$1        '{$this->moduleName}' => '{$this->moduleSchema}',\n",
            $source,
            1,
        );

        file_put_contents($file, (string) $source);
        $this->line('  <fg=gray>✓</> ModuleBoundaryTest → MODULE_SCHEMAS');
    }

    private function registerPermissions(): void
    {
        $file = database_path('seeders/RolesAndPermissionsSeeder.php');
        $source = (string) file_get_contents($file);

        if (str_contains($source, "'{$this->permissionPrefix}',")) {
            return;
        }

        $source = preg_replace(
            "/(\n    \];\n\n    \/\*\* @var array<int, string> \*\/\n    private const ACTIONS)/",
            "\n        '{$this->permissionPrefix}',$1",
            $source,
            1,
        );

        file_put_contents($file, (string) $source);
        $this->line("  <fg=gray>✓</> RolesAndPermissionsSeeder → {$this->permissionPrefix}.*");
    }

    private function registerStatus(): void
    {
        $file = base_path('modules_statuses.json');
        /** @var array<string, bool> $statuses */
        $statuses = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);

        $statuses[$this->moduleName] = true;

        file_put_contents($file, $this->json($statuses));
        $this->line('  <fg=gray>✓</> modules_statuses.json');
    }

    /**
     * Teach Composer about the new module.
     *
     * Module classes live under `Modules/{Name}/app/` but the namespace is
     * `Modules\{Name}\` — the mapping comes from the module's own composer.json,
     * merged in by wikimedia/composer-merge-plugin. Until the autoloader is
     * rebuilt, Laravel cannot even boot: it tries to instantiate a service
     * provider whose class does not exist yet, and every artisan command dies.
     */
    private function refreshAutoloader(): void
    {
        // Windows and Unix both, without assuming composer is a shell builtin.
        $composer = (new ExecutableFinder)->find('composer')
            ?? (new ExecutableFinder)->find('composer.bat');

        if ($composer === null) {
            $this->warn('  ⚠️  composer topilmadi — qo\'lda ishga tushiring: composer dump-autoload');

            return;
        }

        $process = new Process(
            [$composer, 'dump-autoload', '--quiet'],
            base_path(),
        );
        $process->setTimeout(120);
        $process->run();

        $this->line($process->isSuccessful()
            ? '  <fg=gray>✓</> composer dump-autoload'
            : '  ⚠️  composer dump-autoload muvaffaqiyatsiz — qo\'lda ishga tushiring');
    }

    // ============ Helpers ============

    private function modulePath(string $sub = ''): string
    {
        return base_path("Modules/{$this->moduleName}".($sub === '' ? '' : "/{$sub}"));
    }

    private function makeDirectory(string $path): void
    {
        if (! is_dir($path)) {
            mkdir($path, 0o755, true);
        }
    }

    private function put(string $relative, string $contents): void
    {
        $path = $this->modulePath($relative);
        $this->makeDirectory(dirname($path));
        file_put_contents($path, $contents);
    }

    /**
     * @param array<string, mixed> $data
     */
    private function json(array $data): string
    {
        return json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n";
    }

    private function label(string $locale): string
    {
        $given = $this->option($locale);

        return is_string($given) && $given !== ''
            ? str_replace("'", "\\'", $given)
            : $this->moduleName;
    }

    private function description(): string
    {
        $given = $this->option('description');

        return is_string($given) && $given !== ''
            ? str_replace("'", "\\'", $given)
            : "{$this->moduleName} moduli.";
    }

    private function constantAlias(): string
    {
        return Str::upper($this->moduleAlias);
    }

    /** Next free sidebar position, unless one was given. */
    private function order(): int
    {
        $given = $this->option('order');

        if (is_numeric($given)) {
            return (int) $given;
        }

        $highest = 0;

        foreach (glob(base_path('Modules/*/config/config.php')) ?: [] as $config) {
            if (preg_match("/'order' => (\d+)/", (string) file_get_contents($config), $match) === 1) {
                $highest = max($highest, (int) $match[1]);
            }
        }

        return $highest + 1;
    }
}
