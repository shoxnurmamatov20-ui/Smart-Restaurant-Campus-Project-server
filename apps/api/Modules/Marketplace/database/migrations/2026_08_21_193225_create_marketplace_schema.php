<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The `marketplace` schema — Marketplace's own corner of the database.
 *
 * Every table this module creates belongs here:
 *
 *     Schema::create('marketplace.things', function (Blueprint $table): void { … });
 *     protected $table = 'marketplace.things';
 *
 * See docs/decisions/0010-schema-per-module.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('CREATE SCHEMA IF NOT EXISTS "marketplace"');

        /*
         * The comment is a bound literal, not a concatenated one.
         *
         * COMMENT ON does not accept placeholders, so the text has to be
         * escaped by hand — and the generator's template did not: an Uzbek
         * sentence carries apostrophes ("ko'p", "iste'molchi"), each of which
         * closes the SQL string early and makes the whole migration a syntax
         * error. Doubling them is what PostgreSQL asks for, and it is the same
         * thing the core schemas migration does in its own literal() helper.
         */
        $comment = str_replace("'", "''", 'Marketplace — MyPOS bozori — ko\'p restoranli iste\'molchi vitrinasi');

        DB::statement('COMMENT ON SCHEMA "marketplace" IS \''.$comment.'\'');

        $role = DB::connection()->getConfig('username');

        if (is_string($role) && $role !== '') {
            DB::statement('ALTER SCHEMA "marketplace" OWNER TO "'.$role.'"');
        }
    }

    public function down(): void
    {
        // RESTRICT, never CASCADE: a rollback that goes one step too far
        // must not take a restaurant's data with it.
        DB::statement('DROP SCHEMA IF EXISTS "marketplace" RESTRICT');
    }
};
