<?php

declare(strict_types=1);

use App\Support\Modules\TableOwnership;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Relocates module tables that were created before the schemas existed.
 *
 * Every create-migration now names its schema outright — `Schema::create(
 * 'menu.menu_items')` — so a database built from scratch already has each table
 * in the right place and this migration finds nothing to do. It exists for the
 * databases that do not get rebuilt: the ones with a restaurant's real orders in
 * them, where `migrate:fresh` is not an option.
 *
 * `ALTER TABLE … SET SCHEMA` moves the table with its indexes, constraints and
 * owned sequences, in place, without copying a row. Foreign keys pointing at it
 * follow automatically, because PostgreSQL tracks them by object id rather than
 * by name.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->requirePostgres();

        $moved = [];

        foreach (app(TableOwnership::class)->map() as $qualified => $module) {
            if (! str_contains($qualified, '.')) {
                continue;
            }

            [$schema, $table] = explode('.', $qualified, 2);

            if ($schema === 'public') {
                continue;
            }

            // Already home — the normal case on a fresh database.
            if ($this->tableExistsIn($schema, $table)) {
                continue;
            }

            if (! $this->tableExistsIn('public', $table)) {
                // Neither here nor there: the module's migration has not run
                // yet, which is fine — it will create the table in place.
                continue;
            }

            DB::statement(sprintf(
                'ALTER TABLE %s SET SCHEMA %s',
                $this->quote('public').'.'.$this->quote($table),
                $this->quote($schema),
            ));

            $moved[] = "{$table} → {$schema}";
        }

        if ($moved !== []) {
            // Loud on purpose: an operator running this against a live database
            // should see exactly what changed place.
            echo '  Ko\'chirildi: '.implode(', ', $moved).PHP_EOL;
        }
    }

    public function down(): void
    {
        $this->requirePostgres();

        foreach (app(TableOwnership::class)->map() as $qualified => $module) {
            if (! str_contains($qualified, '.')) {
                continue;
            }

            [$schema, $table] = explode('.', $qualified, 2);

            if ($schema === 'public' || ! $this->tableExistsIn($schema, $table)) {
                continue;
            }

            DB::statement(sprintf(
                'ALTER TABLE %s SET SCHEMA %s',
                $this->quote($schema).'.'.$this->quote($table),
                $this->quote('public'),
            ));
        }
    }

    private function tableExistsIn(string $schema, string $table): bool
    {
        return DB::selectOne(
            'select 1 as found from pg_tables where schemaname = ? and tablename = ?',
            [$schema, $table],
        ) !== null;
    }

    private function requirePostgres(): void
    {
        $driver = DB::connection()->getDriverName();

        if ($driver !== 'pgsql') {
            throw new RuntimeException(
                "Smart Restaurant Campus requires PostgreSQL; got [{$driver}].",
            );
        }
    }

    private function quote(string $identifier): string
    {
        return '"'.str_replace('"', '""', $identifier).'"';
    }
};
