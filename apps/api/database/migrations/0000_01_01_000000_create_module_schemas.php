<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One PostgreSQL schema per module.
 *
 * The platform is a modular monolith heading for thirty modules and a very
 * large number of restaurants. Keeping every table in `public` works, but it
 * puts sixty-odd tables in one flat list where nothing says which module owns
 * what, and it leaves no place to hang per-module database grants when the time
 * comes to give the analytics worker read-only access to Orders and nothing else.
 *
 * A schema costs nothing at runtime — it is a namespace, not a database — and it
 * makes the boundary the architecture tests enforce in code visible in the
 * database as well.
 *
 * `public` keeps the platform's own tables: identity, tenancy, the event outbox,
 * the audit trail, and everything the framework and its packages create. It is
 * also first in `search_path`, so any package migration that creates a table
 * without qualifying it lands somewhere sensible rather than inside a module.
 *
 * Runs before every other migration — hence the 0000 timestamp.
 */
return new class extends Migration
{
    /**
     * Schema per module, keyed by the module that owns it.
     *
     * `analytics` owns no tables today: Analytics is a read-only module that
     * reports across the others. The schema exists because that is where its
     * materialised views and projections belong the moment reporting outgrows
     * querying the live tables — which, at scale, it will.
     *
     * @var array<string, string>
     */
    private const SCHEMAS = [
        'menu' => 'Menu — kategoriyalar, taomlar, narxlar, stop-list',
        'orders' => 'Orders — buyurtmalar va ularning satrlari',
        'kitchen' => 'Kitchen — oshxona sexlari va chiptalari (KDS)',
        'tables' => 'Tables — zallar, stollar, bronlar',
        'inventory' => 'Inventory — ingredientlar va ombor harakati',
        'suppliers' => 'Suppliers — yetkazib beruvchilar va xaridlar',
        'staff' => 'Staff — xodimlar, smenalar, davomat',
        'finance' => 'Finance — kassa smenasi, to\'lovlar, xarajatlar',
        'crm' => 'Crm — mijozlar, sodiqlik, fikr-mulohaza',
        'telegram' => 'TelegramBots — botlar, obunalar, xabarlar',
        'analytics' => 'Analytics — hisobot proyeksiyalari uchun zaxirada',
        'pos' => 'Pos — kassa terminali, sotuv, chek, fiskal',
    ];

    public function up(): void
    {
        $this->guardDriver();

        foreach (self::SCHEMAS as $schema => $comment) {
            DB::statement(sprintf('CREATE SCHEMA IF NOT EXISTS %s', $this->quote($schema)));
            DB::statement(sprintf(
                'COMMENT ON SCHEMA %s IS %s',
                $this->quote($schema),
                $this->literal($comment),
            ));

            // The application role owns the schema, so migrations can create,
            // alter and drop inside it without a separate grant.
            $this->grantTo($schema);
        }

        DB::statement(sprintf(
            'COMMENT ON SCHEMA %s IS %s',
            $this->quote('public'),
            $this->literal('Core — identity, tenancy, event outbox, audit, framework'),
        ));
    }

    public function down(): void
    {
        $this->guardDriver();

        // RESTRICT, never CASCADE: dropping a schema that still holds a
        // restaurant's orders because a rollback went one step too far is not a
        // mistake anyone recovers from.
        foreach (array_reverse(array_keys(self::SCHEMAS)) as $schema) {
            DB::statement(sprintf('DROP SCHEMA IF EXISTS %s RESTRICT', $this->quote($schema)));
        }
    }

    private function guardDriver(): void
    {
        $driver = DB::connection()->getDriverName();

        if ($driver !== 'pgsql') {
            // Deliberately fatal. The whole platform — tests included — runs on
            // PostgreSQL precisely so the schema layout is the same everywhere;
            // silently skipping would recreate the divergence this removes.
            throw new RuntimeException(
                "Smart Restaurant Campus requires PostgreSQL; got [{$driver}]. ".
                'The schema-per-module layout has no equivalent on other engines.',
            );
        }
    }

    private function grantTo(string $schema): void
    {
        $role = DB::connection()->getConfig('username');

        if (! is_string($role) || $role === '') {
            return;
        }

        DB::statement(sprintf(
            'ALTER SCHEMA %s OWNER TO %s',
            $this->quote($schema),
            $this->quote($role),
        ));
    }

    /** Identifier quoting — schema and role names are never user input, but still. */
    private function quote(string $identifier): string
    {
        return '"'.str_replace('"', '""', $identifier).'"';
    }

    private function literal(string $value): string
    {
        return "'".str_replace("'", "''", $value)."'";
    }
};
