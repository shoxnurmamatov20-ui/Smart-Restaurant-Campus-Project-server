<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A till's code is unique inside its branch, not across the whole chain.
 *
 * The index was (tenant_id, code), which makes the design impossible to build:
 * it draws POS-1 at Chilonzor, POS-1 at Yunusobod and POS-1 at Sergeli, three
 * separate rows in one terminal-health table. Under a tenant-wide index only
 * one of them can exist.
 *
 * It is also the wrong model on its own merits. A terminal code is a thing
 * people say out loud inside one venue — "the receipt is stuck on POS-2". Force
 * it to be unique across fifty branches and the fortieth till is called POS-40,
 * which nobody says and nobody remembers. The existing test
 * `two_restaurants_may_both_have_a_terminal_called_kassa_1` makes precisely
 * this argument one level up; it holds one level down too.
 *
 * NULLS NOT DISTINCT, for the same reason `branch_counters` needed it: a
 * terminal not yet assigned to a branch has branch_id NULL, and without the
 * clause every such row counts as unique — so a restaurant could hold ten
 * unassigned tills all called POS-1, which is the collision the index exists to
 * prevent.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Written as raw SQL rather than through the Blueprint because Laravel's
        // schema builder cannot express NULLS NOT DISTINCT, and this index is
        // wrong without it.
        //
        // The names carry the `pos_` prefix because the model's table is
        // `pos.terminals` and Laravel builds index names from the whole string.
        //
        // DROP CONSTRAINT, not DROP INDEX: `$table->unique()` creates a UNIQUE
        // constraint whose backing index cannot be dropped on its own —
        // PostgreSQL refuses with "dependent objects still exist" and names the
        // constraint that owns it.
        DB::statement('alter table pos.terminals drop constraint if exists pos_terminals_tenant_id_code_unique');

        // A plain unique index rather than a constraint, because ADD CONSTRAINT
        // is the only form that cannot carry NULLS NOT DISTINCT in every
        // supported version. Enforcement is identical; the difference is that an
        // index cannot be the target of a foreign key, and nothing points here.
        DB::statement(<<<'SQL'
            create unique index pos_terminals_tenant_id_branch_id_code_unique
                on pos.terminals (tenant_id, branch_id, code)
                nulls not distinct
        SQL);
    }

    public function down(): void
    {
        DB::statement('drop index if exists pos.pos_terminals_tenant_id_branch_id_code_unique');

        // Restoring the narrower index can fail where per-branch codes have
        // since been reused — which is the point of the change. Say so rather
        // than half-succeeding: a rollback that silently leaves no unique index
        // at all is worse than one that refuses.
        // Recreated as a constraint, which is the shape the original migration
        // left behind — a rollback should land exactly where it started.
        DB::statement('alter table pos.terminals add constraint pos_terminals_tenant_id_code_unique unique (tenant_id, code)');
    }
};
