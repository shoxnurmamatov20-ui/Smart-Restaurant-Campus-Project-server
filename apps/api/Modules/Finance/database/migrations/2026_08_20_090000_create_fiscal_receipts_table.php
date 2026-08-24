<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The document that makes a bill legal.
 *
 * A fiscal receipt is not a copy of the cheque — it is a separate declaration
 * the restaurant makes to the tax authority, and the guest's proof that it was
 * made. It has its own life: it is created when money is taken, it may be
 * accepted minutes later, it may fail all evening and be accepted at midnight,
 * and it may never be accepted at all. That is why it is a row rather than four
 * columns on `payments` — a state machine with retries does not fit beside an
 * amount.
 *
 * ---------------------------------------------------------------------------
 * The rule this table is shaped by
 *
 * **A dead fiscal module never blocks a sale.** The plan states it and it is the
 * only defensible reading: a receipt is a legal requirement, and refusing to
 * serve food because a government endpoint is down closes the restaurant. So the
 * row is written locally and synchronously — cheap, always succeeds — and the
 * conversation with the OFD happens afterwards, retried with backoff. Nothing on
 * the selling path waits for it.
 *
 * The cost of that choice is what `expires_at` measures. There is a window in
 * which the declaration must arrive, and a receipt that misses it is a real
 * liability rather than a retry queue item. So the window is a column, the
 * relay marks anything past it `expired`, and expiring is loud.
 *
 * ---------------------------------------------------------------------------
 * Why the totals are here rather than read from the order
 *
 * The same reason `payments.fee_bps` is a snapshot: a document already filed
 * must not restate itself because somebody edited a price afterwards. What was
 * declared is what was declared, and a dispute is settled by reading the row,
 * not by recomputing it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance.fiscal_receipts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->nullOnDelete();
            $table->foreignId('cash_shift_id')->nullable()->constrained('finance.cash_shifts')->nullOnDelete();

            // No foreign key on purpose: Orders owns that table and this module
            // may not reach into it — the same arrangement `payments` already
            // has. The number rides along so a receipt can be read without one.
            $table->unsignedBigInteger('order_id')->nullable()->comment('Orders module id, no FK on purpose');
            $table->string('order_number', 24)->nullable();

            $table->date('business_date')->nullable()->comment('The trading day, from created_at — Q3');

            $table->string('kind', 16)->default('sale')->comment('sale|refund|correction');

            // A refund document points at the sale it reverses. Self-referencing
            // because a correction is a fiscal document in its own right — it
            // gets its own sign from the OFD and its own place in the day.
            $table->unsignedBigInteger('parent_id')->nullable()
                ->comment('The sale this document corrects');

            $table->string('status', 16)->default('pending')
                ->comment('pending|sent|registered|expired|void');

            $table->unsignedBigInteger('total')->default(0)->comment('Tiyin declared on this document');
            $table->unsignedBigInteger('cash_total')->default(0)->comment('Tiyin declared as cash');
            $table->unsignedBigInteger('card_total')->default(0)->comment('Tiyin declared as non-cash');
            $table->unsignedBigInteger('vat_total')->default(0)->comment('Tiyin of VAT inside the total');

            // ---- The conversation with the OFD ----
            $table->unsignedInteger('attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->datetime('next_attempt_at')->nullable()->comment('Backoff — when to try again');
            $table->datetime('expires_at')->nullable()->comment('The window closes here; past it, a liability');
            $table->string('provider', 32)->nullable()->comment('Which driver produced the marks');

            // ---- What came back ----
            $table->string('fiscal_sign', 64)->nullable()->comment('Fiskal belgi — what the guest verifies');
            $table->string('receipt_seq', 64)->nullable()->comment("The OFD's own receipt number");
            $table->string('module_no', 32)->nullable()->comment('The fiscal module, ≥ 8 digits');
            $table->string('qr_url', 400)->nullable()->comment('Where the guest checks it');
            $table->datetime('registered_at')->nullable();

            /*
             * How many NUSXA copies have been printed.
             *
             * A duplicate is not a new fiscal document and must never look like
             * one — it is the same declaration, reprinted, stamped so nobody can
             * present it as a second sale. Counting them is what makes "this
             * receipt was printed four times" answerable.
             */
            $table->unsignedInteger('duplicates_printed')->default(0);

            // Exactly what was sent, for a dispute. A document argued about
            // months later is settled by reading this, not by rebuilding it.
            $table->jsonb('payload')->nullable();

            $table->timestamps();

            $table->index(['tenant_id', 'status', 'next_attempt_at'], 'fiscal_receipts_queue_index');
            $table->index(['tenant_id', 'cash_shift_id', 'status'], 'fiscal_receipts_shift_index');
            $table->index(['tenant_id', 'branch_id', 'business_date'], 'fiscal_receipts_day_index');
            $table->index(['tenant_id', 'fiscal_sign']);

            $table->foreign('parent_id')->references('id')->on('finance.fiscal_receipts')->nullOnDelete();
        });

        /*
         * One sale document per bill.
         *
         * A table of four paying with two cards and cash is three payment rows
         * and ONE declaration — the tax authority is told what was sold, not how
         * many times the card machine was used. Without this, settling a bill in
         * three tenders would file three receipts for one meal, and the
         * restaurant would have declared triple its revenue.
         *
         * Partial: corrections and duplicates are repeatable by nature, and rows
         * with no order behind them (money recorded straight into Finance) have
         * nothing to be unique on.
         */
        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX fiscal_receipts_one_sale_per_bill
                ON finance.fiscal_receipts (tenant_id, order_id)
                WHERE kind = 'sale' AND order_id IS NOT NULL
        SQL);

        RowLevelSecurity::guard('finance.fiscal_receipts');
    }

    public function down(): void
    {
        // Dropping the table takes the policy with it.
        Schema::dropIfExists('finance.fiscal_receipts');
    }
};
