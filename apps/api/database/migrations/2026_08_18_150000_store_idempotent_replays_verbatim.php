<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * jsonb rewrites what it stores; a replay must not.
 *
 * The first replayed response came back with its keys in a different order
 * than the original — jsonb keeps documents in its own canonical key order,
 * which is fine for querying and wrong for a column whose one job is to
 * return the first response byte for byte. A till diffing the two would see
 * a change where none happened.
 *
 * `text`, then: the body is opaque here. Nothing queries into it, so nothing
 * is lost, and the replay becomes what it claims to be.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('alter table public.idempotency_keys alter column response_body type text using response_body::text');
    }

    public function down(): void
    {
        DB::statement('alter table public.idempotency_keys alter column response_body type jsonb using response_body::jsonb');
    }
};
