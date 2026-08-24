<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The tab itself: every line of what a guest was charged and what they paid back.
 *
 * `customers.account_balance` is the running total; this is the working. The
 * balance without the ledger is a number a guest can dispute and nobody can
 * defend — "you owe 340 000" is not an answer to "since when?".
 *
 * ---------------------------------------------------------------------------
 * Not soft-deleted, on purpose
 *
 * Every other table in this module carries `deleted_at`, and this one does not.
 * A ledger line is undone by a line that says so — a `reversal`, an
 * `adjustment`, a `writeoff` — never by disappearing, because the balance is
 * the sum of these rows and a row that can vanish is a balance that can change
 * with no trace of why. It is the same rule CLAUDE.md already states for orders
 * and payments, applied to the one table that IS the money owed.
 *
 * ---------------------------------------------------------------------------
 * One charge per bill, enforced by Postgres
 *
 * The till settles a bill inside a transaction and posts the tab charge in the
 * same one. Retries happen anyway — a tablet on a bad connection sends the
 * settlement twice, the offline queue replays a batch — and the failure mode is
 * the worst kind: the guest silently owes double, and nothing in the ledger
 * looks wrong because both rows are individually correct.
 *
 * The application checks first and this index is what makes the check true. It
 * is partial twice over: `charge` only, because a guest can legitimately pay the
 * same bill down in instalments; and bills only, because a charge with no
 * `order_id` is a manager typing an opening balance by hand and there is no key
 * to deduplicate it against. Constraining those on `(tenant_id, order_id)` would
 * have refused the restaurant's SECOND manual charge ever, for any guest.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm.account_entries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * A tab is the guest's, but signing for lunch happens at an address —
             * CLAUDE.md's third rule. Which branch extended the credit is the
             * first question an owner asks about a debt that grew, and it is
             * unanswerable after the fact if it was never written down.
             */
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->nullOnDelete();
            $table->foreignId('customer_id')->constrained('crm.customers')->cascadeOnDelete();
            $table->date('business_date')->nullable()->comment('The trading day, from occurred_at — Q3');

            $table->string('kind', 16)->comment('charge|settlement|reversal|adjustment|writeoff');
            $table->bigInteger('amount')
                ->comment('Tiyin, signed — what this line did to the balance. + = owes more');
            $table->bigInteger('balance_after')
                ->comment('Tiyin, signed — the balance once this line was posted');

            /*
             * Cross-module ids with no foreign key, the same way loyalty already
             * stores `order_id`: Orders, Finance and Pos live in other schemas and
             * a constraint across them would be a module boundary written in DDL.
             * `order_number` travels beside the id so a statement reads without
             * asking Orders anything — the number is what the guest sees on the
             * receipt they signed.
             */
            $table->unsignedBigInteger('order_id')->nullable();
            $table->string('order_number', 32)->nullable();
            $table->unsignedBigInteger('payment_id')->nullable()
                ->comment('The finance.payments row behind this line, when there is one');
            $table->unsignedBigInteger('approval_id')->nullable()
                ->comment('pos.approvals row that authorised going over the limit');

            $table->unsignedBigInteger('recorded_by_user_id')->nullable();
            $table->string('note', 255)->nullable();
            $table->datetime('occurred_at');
            $table->timestamps();

            // The statement: one guest, newest first.
            $table->index(['tenant_id', 'customer_id', 'id']);
            // What a branch put on tabs in a trading day — the Z-report's other half.
            $table->index(['tenant_id', 'branch_id', 'business_date']);
            $table->index(['tenant_id', 'order_id']);
        });

        DB::statement(
            'create unique index account_entries_one_charge_per_bill'
            .' on crm.account_entries (tenant_id, order_id)'
            ." where kind = 'charge' and order_id is not null",
        );

        RowLevelSecurity::guard('crm.account_entries');
    }

    public function down(): void
    {
        // Dropping the table takes the index and the policy with it.
        Schema::dropIfExists('crm.account_entries');
    }
};
