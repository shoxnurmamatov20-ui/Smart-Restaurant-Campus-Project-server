<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A terminal is an identity, and authentication has to read it before tenancy.
 *
 * `public.users` was exempted from row-level security for one precise reason:
 * `auth:sanctum` resolves a token's owner before any middleware has worked out
 * which restaurant the request is for, so a guarded users table makes every
 * sign-in on the platform fail. Terminals are the other half of that sentence
 * and were missed.
 *
 * A till authenticates as itself. Sanctum resolves the device token's
 * `tokenable` — a Terminal — at exactly the same point in the stack, with the
 * connection still closed, so the policies hid the row and every request from
 * every paired tablet answered `auth.unauthenticated`. Measured, not inferred:
 * terminal 634 existed with tenant_id 1, was invisible to a closed connection,
 * and its freshly minted token 401'd on the idle screen.
 *
 * What is given up is small and the same trade already accepted for users: the
 * Eloquent `BelongsToTenant` scope still filters every terminal query the
 * application makes, and the table holds no money, no guest data and no
 * personal data — a code, a name, a mode, and a hash of a pairing code that
 * dies in ten minutes.
 *
 * The rule this leaves behind, worth stating because a third case will come:
 * a table that AUTHENTICATION ITSELF must read cannot be guarded by a policy
 * that authentication is what establishes.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('drop policy if exists tenant_isolation on pos.terminals');
        DB::statement('alter table pos.terminals no force row level security');
        DB::statement('alter table pos.terminals disable row level security');
    }

    public function down(): void
    {
        $rule = "current_setting('app.bypass_tenancy', true) = 'on'"
            ." or tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint";

        DB::statement('alter table pos.terminals enable row level security');
        DB::statement('alter table pos.terminals force row level security');
        DB::statement(
            'create policy tenant_isolation on pos.terminals for all'
            ." using ({$rule}) with check ({$rule})",
        );
    }
};
