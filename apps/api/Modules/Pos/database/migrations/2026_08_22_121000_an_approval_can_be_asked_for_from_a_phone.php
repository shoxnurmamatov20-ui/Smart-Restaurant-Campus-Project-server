<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A waiter with a handset can ask, and the queue can still be read by venue.
 *
 * P9 solved half of this already, and said so: answering an approval was moved
 * out of the terminal session because *"a manager is not at the till — they are
 * in the office, in the car park, or at the other branch"*. Asking was left
 * behind. `POST /pos/approvals` sits inside `pos.session`, so the only thing on
 * the platform that can raise a request is a tablet with a PIN session open —
 * and the person who most often needs one is a waiter standing at a table with
 * a phone, apologising for a dessert.
 *
 * Two columns were in the way, and both were right when they were written:
 * `terminal_id` and `session_id` are NOT NULL, because until now every request
 * came from a till.
 *
 * ---------------------------------------------------------------------------
 * What replaces them as the scope
 *
 * `ApprovalController::index()` narrows the manager's queue to one venue
 * through `whereHas('terminal')`, and its own comment explains why: *"the
 * approval row itself has no branch of its own"*. A request raised from a phone
 * has no terminal, so under that query it would be invisible to every console
 * in the building — asked for, and never shown to anybody who could answer.
 *
 * So the row gets the branch it has always implicitly had. Backfilled from the
 * terminal, because that is exactly what the join was computing, and stamped by
 * `BelongsToBranch` from then on. CLAUDE.md's third rule says it plainly: a
 * thing that happens at an address carries `branch_id`. An approval is a person
 * in a room asking another person in the same building.
 *
 * The two columns stay non-null for everything raised at a till. A phone leaves
 * them empty, which is the honest record: there was no terminal.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pos.approvals', function (Blueprint $table): void {
            $table->foreignId('branch_id')->nullable()->after('tenant_id')
                ->constrained('public.branches')->nullOnDelete();
        });

        /*
         * What the old join answered, written down once.
         *
         * A single UPDATE rather than a loop: this has to work on a table with a
         * year of a busy restaurant's approvals in it and on a fresh install
         * with none.
         */
        DB::statement(<<<'SQL'
            update pos.approvals a
               set branch_id = t.branch_id
              from pos.terminals t
             where t.id = a.terminal_id
               and a.branch_id is null
        SQL);

        /*
         * `dropForeign` before the type change, and back after.
         *
         * PostgreSQL will alter a column that a constraint depends on, but
         * Laravel's `change()` rewrites the whole definition — including the
         * foreign key it does not know about — so the constraint has to be named
         * and re-declared rather than left to survive.
         */
        Schema::table('pos.approvals', function (Blueprint $table): void {
            $table->dropForeign(['terminal_id']);
            $table->dropForeign(['session_id']);
        });

        DB::statement('alter table pos.approvals alter column terminal_id drop not null');
        DB::statement('alter table pos.approvals alter column session_id drop not null');

        Schema::table('pos.approvals', function (Blueprint $table): void {
            $table->foreign('terminal_id')->references('id')->on('pos.terminals')->cascadeOnDelete();
            $table->foreign('session_id')->references('id')->on('pos.terminal_sessions')->cascadeOnDelete();
        });

        /*
         * The manager's queue, by venue: what is still pending here, oldest
         * first. The existing `(tenant_id, status, expires_at)` index cannot
         * answer it once the branch is the filter rather than a join.
         */
        DB::statement(
            'create index approvals_by_branch_status on pos.approvals (tenant_id, branch_id, status, requested_at)',
        );
    }

    public function down(): void
    {
        DB::statement('drop index if exists pos.approvals_by_branch_status');

        // Rows raised from a phone have no terminal, so putting NOT NULL back
        // would fail on exactly the data this migration exists to allow. They go
        // first; nothing else in the schema points at them.
        DB::table('pos.approvals')->whereNull('terminal_id')->delete();

        Schema::table('pos.approvals', function (Blueprint $table): void {
            $table->dropForeign(['terminal_id']);
            $table->dropForeign(['session_id']);
        });

        DB::statement('alter table pos.approvals alter column terminal_id set not null');
        DB::statement('alter table pos.approvals alter column session_id set not null');

        Schema::table('pos.approvals', function (Blueprint $table): void {
            $table->foreign('terminal_id')->references('id')->on('pos.terminals')->cascadeOnDelete();
            $table->foreign('session_id')->references('id')->on('pos.terminal_sessions')->cascadeOnDelete();
            $table->dropConstrainedForeignId('branch_id');
        });
    }
};
