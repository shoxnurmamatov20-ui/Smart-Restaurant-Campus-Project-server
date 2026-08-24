<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The spool: what still has to come out of a printer, and what already did.
 *
 * This table is the entire point of P8. Printing straight to a device from the
 * request that fired a bill has one failure mode and it is the bad one — the
 * printer is out of paper, the socket times out, and the docket is gone. Not
 * delayed: gone, with the bill showing `placed` and a kitchen that never heard
 * about the table. A row survives that. The printer coming back is enough to
 * make the paper appear, minutes later, without anyone re-keying an order.
 *
 * The row is written **inside the caller's transaction**, next to the ticket it
 * is for. Both or neither, for the same reason `TicketWriter::fire()` is inside
 * `BillRegistry::send()`: a spool entry for a bill that rolled back would print
 * food nobody ordered.
 *
 * **`document` is the rendered docket, not a pointer to one.** A job that stored
 * `ticket_id` and rendered at print time would print whatever the ticket says
 * when the printer finally answers — so a line voided in the meantime silently
 * rewrites paper that was fired before the void. The same snapshot rule the
 * tickets and the receipt lines already follow.
 *
 * **`fingerprint` is what stops a double print.** Re-firing an edited bill is
 * normal and must reach the pass; re-firing an unchanged one (a tablet
 * retrying, an idempotent replay) must not put a second identical docket on the
 * rail. The fingerprint hashes what is being printed, so identical content is
 * refused by the unique index and changed content is a new job.
 */
return new class extends Migration
{
    private const TABLE = 'kitchen.print_jobs';

    private const RULE = "current_setting('app.bypass_tenancy', true) = 'on'"
        ." or tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint";

    public function up(): void
    {
        Schema::create(self::TABLE, function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->cascadeOnDelete();
            $table->foreignId('printer_id')->constrained('kitchen.printers')->cascadeOnDelete();

            $table->string('kind', 16)->comment('docket | receipt | drawer | test');
            // Free text rather than a polymorphic pair: the spool must not need
            // a join into Orders to say what a job was for, and "ticket:412" is
            // what a support call actually asks about.
            $table->string('reference', 64)->nullable()->comment('ticket:412, order:118');
            $table->string('title', 120)->nullable()->comment('What the status bar calls it');

            $table->json('document')->comment('The rendered document, frozen at spool time');
            $table->unsignedTinyInteger('copies')->default(1);

            $table->string('status', 16)->default('queued')->comment('queued | claimed | printed | failed');
            $table->unsignedSmallInteger('attempts')->default(0);
            // Backoff lives here rather than in a queue worker: the thing that
            // retries is an agent on a shop floor, and it asks "what is due"
            // every couple of seconds. A due time is the only state it needs.
            $table->timestamp('available_at')->useCurrent();
            $table->timestamp('claimed_at')->nullable();
            $table->string('claimed_by', 64)->nullable()->comment('Agent instance that holds it');
            $table->timestamp('printed_at')->nullable();
            $table->string('last_error', 255)->nullable();

            $table->string('fingerprint', 80)->nullable();

            $table->timestamps();

            /*
             * One identical document per RESTAURANT, ever. Null fingerprints are
             * exempt in PostgreSQL, which is what lets a manual reprint say
             * "yes, again, on purpose".
             *
             * The scope is worth reading twice, because the till's other
             * idempotency key looks the same and is not: `pos.sync_entries` is
             * unique per (terminal, local_id), and this is unique per (tenant,
             * fingerprint). The POS passes the same `X-Pos-Local-Id` into both.
             * That is safe — the id is a device-generated uuid — but the two
             * scopes are different questions. "Has this terminal already sent
             * me this write" is not "has this restaurant already printed this
             * document", and a future change that assumes they are one thing
             * would either print a receipt twice or refuse to print it at all.
             */
            $table->unique(['tenant_id', 'fingerprint']);
            // The agent's poll: everything due at this venue, oldest first.
            $table->index(['tenant_id', 'branch_id', 'status', 'available_at']);
            // The status bar's count, per device.
            $table->index(['tenant_id', 'printer_id', 'status']);
            // Pruning printed paper, which is most of the table within a week.
            $table->index(['tenant_id', 'status', 'printed_at']);
        });

        DB::statement('alter table '.self::TABLE.' enable row level security');
        DB::statement('alter table '.self::TABLE.' force row level security');
        DB::statement('drop policy if exists tenant_isolation on '.self::TABLE);
        DB::statement(
            'create policy tenant_isolation on '.self::TABLE.' for all'
            .' using ('.self::RULE.') with check ('.self::RULE.')',
        );
    }

    public function down(): void
    {
        DB::statement('drop policy if exists tenant_isolation on '.self::TABLE);
        Schema::dropIfExists(self::TABLE);
    }
};
