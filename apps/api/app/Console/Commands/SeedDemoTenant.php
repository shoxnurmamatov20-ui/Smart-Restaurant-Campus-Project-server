<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Tenant;
use App\Support\Modules\ModuleRegistry;
use App\Support\Tenancy\TenantContext;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Seed the demo restaurant, on purpose, in production.
 *
 * `DatabaseSeeder` refuses to run in production so a live venue never gets
 * fake dishes in its reports — the right rule, and the reason `db:seed
 * --class=` of a single module seeder is the wrong workaround: run alone, a
 * module seeder has no tenant context, `BelongsToTenant` has nothing to stamp,
 * and every row lands with `tenant_id = null`. That happened on 2026-08-22 —
 * three promo codes and eight storefronts written under no restaurant, which
 * row-level security then hid from everyone.
 *
 * This does what `DatabaseSeeder` does for the demo tenant and nothing else:
 * resolves it by slug, sets the context, runs the seeders named, and first
 * deletes any tenantless rows those seeders' tables carry — the only rows
 * with `tenant_id IS NULL` in a tenant-scoped table are mistakes.
 *
 * Only ever the demo slug. Pointing it at a real restaurant is refused.
 */
final class SeedDemoTenant extends Command
{
    protected $signature = 'demo:seed
                            {--slug=demo-restaurant : The demo tenant; anything else is refused}
                            {--only= : Comma-separated seeder classes; default is the demo set}';

    protected $description = 'Seed the demo restaurant under its own tenant context, safely in production';

    /**
     * Every module's `demo` config block — seeders and the tenant-scoped
     * tables they fill — collected without this command naming any module.
     * A module that wants its fixtures on the demo tenant declares them in its
     * own `config.php`; one that does not is simply absent here.
     *
     * @return array<class-string, list<string>>
     */
    private function demoSeeders(): array
    {
        $found = [];

        foreach (app(ModuleRegistry::class)->all() as $module) {
            $key = $module->key;
            /** @var list<class-string> $seeders */
            $seeders = (array) config("{$key}.demo.seeders", []);
            /** @var list<string> $tables */
            $tables = (array) config("{$key}.demo.tables", []);

            foreach ($seeders as $seeder) {
                $found[$seeder] = $tables;
            }
        }

        return $found;
    }

    public function handle(): int
    {
        $slug = (string) $this->option('slug');

        if (! str_starts_with($slug, 'demo')) {
            $this->error("Refusing: '{$slug}' does not look like a demo tenant. This command fills a restaurant with fixtures.");

            return self::FAILURE;
        }

        $tenant = Tenant::query()->where('slug', $slug)->first();

        if ($tenant === null) {
            $this->error("No tenant with slug '{$slug}'.");

            return self::FAILURE;
        }

        $only = array_filter(array_map('trim', explode(',', (string) $this->option('only'))));
        $demo = $this->demoSeeders();
        $seeders = $only === [] ? array_keys($demo) : $only;

        app(TenantContext::class)->set($tenant);

        foreach ($seeders as $class) {
            foreach ($demo[$class] ?? [] as $table) {
                $orphans = DB::table($table)->whereNull('tenant_id')->delete();

                if ($orphans > 0) {
                    $this->warn("{$table}: removed {$orphans} row(s) that belonged to no tenant");
                }
            }

            $this->line("→ {$class}");
            $this->call('db:seed', ['--class' => $class, '--force' => true]);
        }

        $this->info("Seeded '{$slug}' (tenant {$tenant->id}).");

        return self::SUCCESS;
    }
}
