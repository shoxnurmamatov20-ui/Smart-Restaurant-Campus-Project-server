<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a shift needs to remember about how it ended.
 *
 * Closing a till used to be one integer and an optional note, and everything a
 * restaurant argues about the next morning was absent from the row: whether the
 * drawer was locked before it was counted, who counted it, who authorised the
 * gap, what the gap was blamed on, and whether the notes stayed in the till for
 * the next person or went to the safe.
 *
 *   `locked_at`   The moment the drawer stopped taking money. Counting a till
 *                 that is still selling produces a difference that grows while
 *                 you count it, and the cashier is the one who gets asked about
 *                 it. `status = 'counting'` is the state; this is when it began.
 *
 *   `closed_by_user_id`  Who counted, which is not always who opened — a shift
 *                 that runs past a handover is closed by the person who took it
 *                 over, and "the cashier was short" then names the wrong person.
 *
 *   `approved_by_user_id` The manager who signed off a difference past the
 *                 threshold. The one column that makes a variance an authorised
 *                 event rather than an unexplained one.
 *
 *   `difference_reason`  Why. A gap with no reason is the record an
 *                 investigation cannot use, and the reason has to be attached to
 *                 the shift rather than folded into the free-text note, because
 *                 a report has to be able to list every unexplained till in a
 *                 month.
 *
 *   `handed_over_to_shift_id`  The next shift, when the drawer was passed over
 *                 rather than emptied. This is what makes a handover provable:
 *                 the successor's opening float is this shift's counted total,
 *                 in the same notes, and the link says so rather than leaving
 *                 two unrelated figures that happen to match.
 *
 * `status` gains `counting` between `open` and `closed`. Everything that already
 * refuses a closed shift refuses a counting one for free — the checks read
 * `status !== 'open'` — which is precisely the lock this needs.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('finance.cash_shifts', function (Blueprint $table): void {
            $table->datetime('locked_at')->nullable()->after('closed_at')
                ->comment('When counting began and the drawer stopped selling');

            $table->unsignedBigInteger('closed_by_user_id')->nullable()->after('opened_by_user_id')
                ->comment('Who counted — not always who opened');

            $table->unsignedBigInteger('approved_by_user_id')->nullable()->after('closed_by_user_id')
                ->comment('The manager who authorised a difference past the threshold');

            $table->string('difference_reason', 255)->nullable()->after('difference')
                ->comment('Why the drawer did not agree');

            // Column and constraint stated separately: `constrained()` returns a
            // ForeignKeyDefinition, which has no `comment()` — and a self-
            // referencing key on a table this important deserves the sentence.
            $table->unsignedBigInteger('handed_over_to_shift_id')->nullable()->after('difference_reason')
                ->comment('The shift that took the drawer over, notes and all');

            $table->foreign('handed_over_to_shift_id')
                ->references('id')->on('finance.cash_shifts')->nullOnDelete();

            /*
             * The Z-report as it was printed, frozen.
             *
             * A Z is a document: it gets two signatures and goes in a folder. So
             * it cannot be a live query, and it was one — the takings, the split
             * by method and the payment count were all recomputed from the
             * payment rows every time anybody opened a closed shift. Refund one
             * of yesterday's bills this afternoon and yesterday's Z quietly
             * reports a different figure from the sheet in the folder, with
             * nothing to say it changed or when.
             *
             * `expected_cash`, `counted_cash` and `difference` were already
             * stored for exactly this reason. This is the rest of the same page.
             */
            $table->jsonb('z_report')->nullable()->after('handed_over_to_shift_id')
                ->comment('The Z as it was printed — never recomputed');
        });

        Schema::table('finance.cash_shifts', function (Blueprint $table): void {
            // "Every till in this branch that closed with an unexplained gap
            // this month" is the report a manager actually runs, and without
            // this it is a sequential scan of every shift ever opened.
            $table->index(['tenant_id', 'branch_id', 'status', 'closed_at'], 'cash_shifts_branch_close_index');
        });
    }

    public function down(): void
    {
        Schema::table('finance.cash_shifts', function (Blueprint $table): void {
            $table->dropIndex('cash_shifts_branch_close_index');
            $table->dropForeign(['handed_over_to_shift_id']);
            $table->dropColumn([
                'locked_at',
                'closed_by_user_id',
                'approved_by_user_id',
                'difference_reason',
                'handed_over_to_shift_id',
                'z_report',
            ]);
        });
    }
};
