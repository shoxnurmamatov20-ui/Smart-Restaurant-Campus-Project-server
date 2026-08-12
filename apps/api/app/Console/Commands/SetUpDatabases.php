<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Creates the databases a fresh clone needs, before anything can migrate.
 *
 * The platform runs on PostgreSQL — tests included, because the schema-per-module
 * layout has no equivalent on any other engine (ADR-0010). That means a new
 * developer cannot run the suite until `restaurant_campus_test` exists, and the
 * error they get instead is a connection failure that says nothing about what to
 * do next.
 *
 *   php artisan db:setup            # create both databases if missing
 *   php artisan db:setup --fresh    # …and migrate + seed the working one
 */
final class SetUpDatabases extends Command
{
    protected $signature = 'db:setup
                            {--fresh : Migrate and seed the working database once it exists}';

    protected $description = 'Create the working and test databases if they do not exist yet';

    public function handle(): int
    {
        $working = (string) Config::get('database.connections.pgsql.database');
        $test = $working.'_test';

        // Everything is read from the pgsql connection, so this works against a
        // local install, a Docker container or a managed instance without any
        // extra configuration.
        if ($working === '') {
            $this->error('DB_DATABASE sozlanmagan.');

            return self::INVALID;
        }

        $this->newLine();

        foreach ([$working, $test] as $database) {
            try {
                $this->ensure($database);
            } catch (Throwable $e) {
                $this->error("  ❌ {$database}: ".$e->getMessage());
                $this->line('     Foydalanuvchida CREATEDB huquqi bormi?');

                return self::FAILURE;
            }
        }

        $this->newLine();

        if (! $this->option('fresh')) {
            $this->line('  Keyingi qadam: <info>php artisan migrate --seed</info>');
            $this->newLine();

            return self::SUCCESS;
        }

        $this->call('migrate', ['--force' => true]);
        $this->call('db:seed', ['--force' => true]);
        $this->call('db:annotate');

        return self::SUCCESS;
    }

    /**
     * Create one database unless it is already there.
     *
     * `CREATE DATABASE` cannot run inside a transaction and cannot be written as
     * `IF NOT EXISTS` in PostgreSQL, so existence is checked first — and the
     * check runs against the `postgres` maintenance database, because connecting
     * to the one being created is exactly what is impossible.
     */
    private function ensure(string $database): void
    {
        $connection = 'pgsql_maintenance';

        Config::set("database.connections.{$connection}", array_merge(
            (array) Config::get('database.connections.pgsql'),
            ['database' => 'postgres', 'search_path' => 'public'],
        ));

        DB::purge($connection);

        $exists = DB::connection($connection)
            ->selectOne('select 1 as found from pg_database where datname = ?', [$database]) !== null;

        if ($exists) {
            $this->line("  <fg=gray>✓</> {$database} <fg=gray>— allaqachon bor</>");

            return;
        }

        DB::connection($connection)->statement(
            'CREATE DATABASE "'.str_replace('"', '""', $database).'"',
        );

        $this->info("  ✅ {$database} yaratildi");
    }
}
