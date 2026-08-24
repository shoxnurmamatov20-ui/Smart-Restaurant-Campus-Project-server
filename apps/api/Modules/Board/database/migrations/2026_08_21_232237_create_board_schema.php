<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The `board` schema — Board's own corner of the database.
 *
 * Every table this module creates belongs here:
 *
 *     Schema::create('board.things', function (Blueprint $table): void { … });
 *     protected $table = 'board.things';
 *
 * See docs/decisions/0010-schema-per-module.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('CREATE SCHEMA IF NOT EXISTS "board"');

        /*
         * The apostrophes are doubled, because COMMENT ON takes no
         * placeholders and an Uzbek sentence is full of them: "ko'p",
         * "iste'molchi", "ro'yxat". Without this the string ends early
         * and the module's very first migration is a syntax error that
         * stops every other migration behind it.
         */
        $comment = str_replace("'", "''", 'Board — Peshtaxta ustidagi ekran: ustunlar, rotatsiya va bannerlar — narx va stop-list menyudan o\'qiladi.');

        DB::statement('COMMENT ON SCHEMA "board" IS \''.$comment.'\'');

        $role = DB::connection()->getConfig('username');

        if (is_string($role) && $role !== '') {
            DB::statement('ALTER SCHEMA "board" OWNER TO "'.$role.'"');
        }
    }

    public function down(): void
    {
        // RESTRICT, never CASCADE: a rollback that goes one step too far
        // must not take a restaurant's data with it.
        DB::statement('DROP SCHEMA IF EXISTS "board" RESTRICT');
    }
};
