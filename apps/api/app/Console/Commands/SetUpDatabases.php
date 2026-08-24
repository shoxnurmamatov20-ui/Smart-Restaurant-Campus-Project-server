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
                            {--fresh : Migrate and seed the working database once it exists}
                            {--lanes= : Also create N numbered test databases, for parallel sessions}';

    protected $description = 'Create the working and test databases if they do not exist yet';

    /**
     * How many parallel lanes this command will make.
     *
     * A ceiling rather than a limit anybody is expected to reach. Each lane is a
     * full copy of a 54-table schema that `migrate:fresh` rebuilds on every run, so
     * they are cheap to create and not free to keep; twenty-six is the alphabet and
     * far more sessions than a person can read the output of.
     */
    private const MAX_LANES = 26;

    public function handle(): int
    {
        $working = (string) Config::get('database.connections.pgsql.database');

        /*
         * The test database's name comes from phpunit.xml, not from `$working.'_test'`.
         *
         * They are not the same string and assuming they were left this command
         * creating a database nothing read. The working database was renamed to
         * `srcp`; phpunit.xml still names `restaurant_campus_test`, deliberately, so
         * a suite run is deterministic and cannot be pointed at production by an
         * exported variable. Deriving the test name from the working one therefore
         * produced `srcp_test` — created, migrated by nobody, read by nothing, while
         * the database the suite actually uses was absent on a fresh machine and the
         * first `phpunit` failed with a connection error nothing explained.
         *
         * phpunit.xml is the authority because it is what the suite reads. One
         * source, so the two cannot drift again.
         */
        $test = $this->testEnv('DB_DATABASE') ?? $working.'_test';

        // Everything is read from the pgsql connection, so this works against a
        // local install, a Docker container or a managed instance without any
        // extra configuration.
        if ($working === '') {
            $this->error('DB_DATABASE sozlanmagan.');

            return self::INVALID;
        }

        /*
         * One test database per working session.
         *
         * The suite begins with `migrate:fresh`, which DROPs 54 tables CASCADE. Two
         * processes sharing one database therefore do not merely interleave — they
         * drop each other's tables mid-run, and the symptom is a test that fails
         * with something unrelated and passes when you run it again. That has cost
         * this project real time already, and it gets worse with every extra person
         * or agent working in parallel.
         *
         * So a lane is a whole database: `restaurant_campus_test_a`, `_b`, `_c`. A
         * session claims one by exporting DB_DATABASE, which PHPUnit's `<env>`
         * deliberately does not override — see the note in phpunit.xml.
         */
        $lanes = $this->laneNames($test);

        $this->newLine();

        /*
         * Whose the test databases are, which is not who is creating them.
         *
         * PostgreSQL 15 revoked CREATE on `public` from PUBLIC, so a database owned
         * by one role is unusable by another — and the suite connects as
         * `restaurant_campus` while this command runs as the application's `srcp`.
         * Created without an explicit owner, every lane came up looking correct and
         * refused the very first `create table migrations` with "permission denied
         * for schema public".
         *
         * Null leaves the owner as the creating role, which is right for the
         * application's own database and harmless when the two roles are the same.
         */
        $testOwner = $this->testEnv('DB_USERNAME');

        foreach ([$working, $test, ...$lanes] as $database) {
            try {
                $this->ensure($database, $database === $working ? null : $testOwner);
            } catch (Throwable $e) {
                $this->error("  ❌ {$database}: ".$e->getMessage());
                $this->line('     Foydalanuvchida CREATEDB huquqi bormi?');

                return self::FAILURE;
            }
        }

        $this->newLine();

        if ($lanes !== []) {
            $user = $this->testEnv('DB_USERNAME');

            $this->line('  Parallel seans uchun:');
            $this->line('    <info>DB_DATABASE='.$lanes[0].' php vendor/bin/phpunit</info>');

            /*
             * The user and password are printed too, and that is not verbosity.
             *
             * `phpunit` supplies them from phpunit.xml, so overriding DB_DATABASE
             * alone is enough there. `artisan` does not: it reads .env, where the
             * user is the application's own. So `DB_DATABASE=..._c php artisan
             * migrate:fresh` connects to the right database as the WRONG role, and
             * every schema it creates ends up owned by that role — after which
             * phpunit on that lane fails with "permission denied for schema crm"
             * and nothing says why. It has already happened once, to a lane that
             * then had to be repaired by hand.
             */
            if ($user !== null) {
                $this->line('    <info>DB_DATABASE='.$lanes[0].' DB_USERNAME='.$user
                    .' DB_PASSWORD=… php artisan …</info>');
                $this->line('  <fg=gray>artisan uchun foydalanuvchini ham bering — u .env dan oladi,');
                $this->line('  va noto\'g\'ri rol schema egaligini buzadi.</>');
            }

            $this->line('  <fg=gray>Har bir seans o\'z yo\'lagini oladi: bitta bazada ikkita');
            $this->line('  migrate:fresh bir-birining jadvallarini o\'chiradi.</>');
            $this->newLine();
        }

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
     * Make sure the right role owns this database.
     *
     * Separate and idempotent because it runs on both paths — a database just
     * created and one that was already there. A no-op when the owner already
     * matches, and quiet when it cannot be changed: on a managed instance the
     * application's role may not be a member of the suite's, and reporting that as a
     * fatal would stop a command whose real job — creating what is missing — has
     * already succeeded.
     */
    private function reown(string $connection, string $database, ?string $owner): void
    {
        if ($owner === null || $owner === '') {
            return;
        }

        $current = DB::connection($connection)->selectOne(
            'select pg_get_userbyid(datdba) as owner from pg_database where datname = ?',
            [$database],
        );

        if ($current !== null && $current->owner === $owner) {
            return;
        }

        try {
            DB::connection($connection)->statement(sprintf(
                'ALTER DATABASE "%s" OWNER TO "%s"',
                str_replace('"', '""', $database),
                str_replace('"', '""', $owner),
            ));
        } catch (Throwable $e) {
            $this->warn("  ⚠ {$database}: egasini {$owner} ga o'zgartirib bo'lmadi — ".$e->getMessage());
        }
    }

    /**
     * One of the suite's own `<env>` values, read out of phpunit.xml.
     *
     * Read from the file rather than from config, because those entries are not in
     * scope for a running artisan command — that is the whole point of them. Null
     * when the file is missing or silent, and every caller falls back rather than
     * refusing: a project that has moved its phpunit config should still be able to
     * create its databases.
     *
     * Two values are read this way and they are read for the same reason. The suite
     * connects as a different role, to a differently-named database, than the
     * application does — `restaurant_campus` / `restaurant_campus_test` against
     * `srcp` / `srcp`. Guessing either from the application's own connection is how
     * this command came to create a database nothing read, owned by a role that
     * could not use it.
     */
    private function testEnv(string $name): ?string
    {
        static $xml = null;

        if ($xml === null) {
            $path = base_path('phpunit.xml');
            $xml = is_file($path) ? @simplexml_load_file($path) : false;
        }

        if ($xml === false) {
            return null;
        }

        foreach ($xml->xpath('//php/env[@name="'.$name.'"]') ?: [] as $env) {
            $value = (string) $env['value'];

            if ($value !== '') {
                return $value;
            }
        }

        return null;
    }

    /**
     * The lane databases to create, named after their letter.
     *
     * @return array<int, string>
     */
    private function laneNames(string $test): array
    {
        $requested = (int) $this->option('lanes');

        if ($requested < 1) {
            return [];
        }

        $lanes = [];

        foreach (range(0, min($requested, self::MAX_LANES) - 1) as $index) {
            $lanes[] = $test.'_'.chr(ord('a') + $index);
        }

        return $lanes;
    }

    /**
     * Create one database unless it is already there.
     *
     * `CREATE DATABASE` cannot run inside a transaction and cannot be written as
     * `IF NOT EXISTS` in PostgreSQL, so existence is checked first — and the
     * check runs against the `postgres` maintenance database, because connecting
     * to the one being created is exactly what is impossible.
     */
    private function ensure(string $database, ?string $owner = null): void
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
            /*
             * Ownership is repaired on an existing database, not only set on a new
             * one. A setup command that could not fix what it got wrong last time is
             * a command you have to work around by hand, and the failure it leaves
             * behind — "permission denied for schema public" on the first migration
             * — reads like a broken suite rather than a misowned database.
             */
            $this->reown($connection, $database, $owner);
            $this->line("  <fg=gray>✓</> {$database} <fg=gray>— allaqachon bor</>");

            return;
        }

        DB::connection($connection)->statement(
            'CREATE DATABASE "'.str_replace('"', '""', $database).'"',
        );

        $this->reown($connection, $database, $owner);

        $this->info("  ✅ {$database} yaratildi".($owner === null ? '' : " (egasi: {$owner})"));
    }
}
