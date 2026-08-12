<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The `pos` schema — home of the twelfth module.
 *
 * A separate migration rather than a line added to
 * `0000_01_01_000000_create_module_schemas.php`, because that one has already
 * run on every existing database: editing it would create the schema on fresh
 * installs and silently skip it everywhere else, which is the worst of both.
 * Adding a schema is additive by nature, so it costs nothing to give it its own
 * file and it works identically on a new machine and on one that is three
 * months old.
 *
 * Runs before the Pos module's own migrations: `2026_08_12_000000` sorts ahead
 * of the `2026_08_12_01xxxx` timestamps its tables use.
 */
return new class extends Migration
{
    private const SCHEMA = 'pos';

    private const COMMENT = 'Pos — terminallar, sessiyalar, tasdiqlar, kassa qutisi, cheklar, fiskal';

    public function up(): void
    {
        $this->guardDriver();

        DB::statement(sprintf('CREATE SCHEMA IF NOT EXISTS %s', $this->quote(self::SCHEMA)));
        DB::statement(sprintf(
            'COMMENT ON SCHEMA %s IS %s',
            $this->quote(self::SCHEMA),
            $this->literal(self::COMMENT),
        ));

        $this->grantToApplicationRole();
    }

    public function down(): void
    {
        $this->guardDriver();

        // RESTRICT, never CASCADE — the same rule the module schemas migration
        // follows. A rollback that goes one step too far must fail loudly
        // rather than take a day of takings with it.
        DB::statement(sprintf('DROP SCHEMA IF EXISTS %s RESTRICT', $this->quote(self::SCHEMA)));
    }

    private function guardDriver(): void
    {
        $driver = DB::connection()->getDriverName();

        if ($driver !== 'pgsql') {
            throw new RuntimeException(
                "Smart Restaurant Campus requires PostgreSQL; got [{$driver}]. ".
                'The schema-per-module layout has no equivalent on other engines.',
            );
        }
    }

    private function grantToApplicationRole(): void
    {
        $role = DB::connection()->getConfig('username');

        if (! is_string($role) || $role === '') {
            return;
        }

        DB::statement(sprintf(
            'ALTER SCHEMA %s OWNER TO %s',
            $this->quote(self::SCHEMA),
            $this->quote($role),
        ));
    }

    private function quote(string $identifier): string
    {
        return '"'.str_replace('"', '""', $identifier).'"';
    }

    private function literal(string $value): string
    {
        return "'".str_replace("'", "''", $value)."'";
    }
};
