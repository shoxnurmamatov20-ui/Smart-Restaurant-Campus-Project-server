<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Everything a waiter's phone did while it could not reach us.
 *
 * `apps/mobile/src/crew/queue.ts` holds the other half: a phone with no signal
 * queues what its owner did — clocked in, claimed a table, resolved a call,
 * submitted a count — and drains the queue when the network comes back. Until
 * now `retryAll()` marked every entry failed and fetched nothing, because there
 * was no door on this side.
 *
 * ---------------------------------------------------------------------------
 * Why a journal and not just eight endpoints
 *
 * Four of the eight kinds land somewhere real the moment they arrive: two are
 * this module's own attendance rows, two go into Inventory through
 * `App\Contracts\Inventory\StockLedger`. The other four have no home yet —
 * claiming a table, resolving a call, confirming a delivery and moving a
 * courier along are Tables', Calls' and Suppliers' business, and Staff may not
 * reach into any of them.
 *
 * The tempting answer is to refuse the four. It is the wrong one: the waiter
 * has already claimed the table, in the real world, an hour ago. Refusing tells
 * their phone to drop the entry and the fact disappears — which is precisely
 * the failure `queue.ts` was written to prevent.
 *
 * So every entry lands here first, and the ones with somewhere to go go there
 * as well. The row is the receipt: `applied` with the module that took it, or
 * `rejected` with a code the phone can show its owner. Nothing is answered
 * "fine" and then dropped.
 *
 * ---------------------------------------------------------------------------
 * Idempotency, and why the header is not enough
 *
 * `EnsureIdempotency` guards the *request*, so a batch sent twice is one batch.
 * It cannot guard the *entry*, and that is the case a queue actually produces:
 * the phone sends twelve, the connection dies after nine are written, and the
 * retry is a different request carrying a different, overlapping twelve.
 *
 * `local_id` is the phone's own id for an entry and never changes across
 * retries, so the unique index below is what makes a resend cost nothing. Keyed
 * by the person rather than by the device: somebody who lost their phone and
 * was re-enrolled is still the same person, and their unsent queue is restored
 * from the same account.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff.actions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * The trading day, stamped from `happened_at` rather than from the
             * moment the row appeared — DECISIONS Q3. A clock-in at 05:40 for
             * the morning prep belongs to the day that is starting; an entry
             * queued at 23:50 and drained at 00:10 belongs to the evening it
             * was worked, not to the one it synced in.
             */
            $table->date('business_date')->nullable()->after('tenant_id');

            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->cascadeOnDelete();

            /** Who did it. The PIN established this; the device only said whose phone it was. */
            $table->foreignId('user_id')->constrained('public.users')->cascadeOnDelete();

            /*
             * Their roster row, when they have one.
             *
             * Nullable because the two are not the same thing and never have
             * been: `public.users` is who may sign in, `staff.staff_members` is
             * who is employed, and an owner covering a shift has the first
             * without the second. An action from such a person is still an
             * action.
             */
            $table->foreignId('staff_member_id')->nullable()->constrained('staff.staff_members')->nullOnDelete();

            /** The phone's own id for this entry. Stable across every retry. */
            $table->string('local_id', 64);

            $table->string('kind', 24)
                ->comment('clock_in | clock_out | table_claim | call_resolve | count_submit | receive_confirm | waste_log | delivery_status');

            /*
             * What the entry carried, verbatim.
             *
             * jsonb rather than columns: the eight kinds have almost nothing in
             * common — a table number, an ingredient and a quantity, a delivery
             * id — and eight sets of nullable columns would be a table that is
             * mostly empty and still cannot hold the ninth kind. Kept even for
             * entries that were applied elsewhere, because it is the evidence a
             * dispute is settled from.
             */
            $table->jsonb('payload')->default('{}');

            $table->string('status', 16)->comment('applied | rejected');

            /*
             * Why, as a code rather than a sentence.
             *
             * The phone renders it in its owner's language. A stored Uzbek
             * string reaches a Russian waiter in Uzbek — the same reason every
             * refusal in this platform is a catalogue code.
             */
            $table->string('reason', 64)->nullable();

            /** Where the entry actually landed: `staff.attendances`, `inventory`, or nothing. */
            $table->string('applied_to', 32)->nullable();

            /** When the person did it, not when we heard about it. */
            $table->timestamp('happened_at');

            $table->timestamps();

            /*
             * The whole point of the table. A resend of the same entry finds
             * this row and writes nothing.
             *
             * No soft deletes on this table, so no partial predicate is needed:
             * a journal that can be deleted from is not a journal.
             */
            $table->unique(['tenant_id', 'user_id', 'local_id']);

            $table->index(['tenant_id', 'kind', 'happened_at']);
            $table->index(['tenant_id', 'business_date']);
        });

        RowLevelSecurity::guard('staff.actions');
    }

    public function down(): void
    {
        RowLevelSecurity::release('staff.actions');
        Schema::dropIfExists('staff.actions');
    }
};
