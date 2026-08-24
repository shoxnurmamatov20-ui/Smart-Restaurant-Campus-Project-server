<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What a payment actually was, beyond its amount.
 *
 * Five columns, and each one is a number a restaurant currently cannot answer:
 *
 *   `reference`   The card authorisation code, the Payme transaction id. The
 *                 Tender DTO has carried it since the till was written and
 *                 `capture()` dropped it on the floor — so a disputed card
 *                 payment had nothing to look up at the bank.
 *
 *   `tip`         DECISIONS Q6. Part of what the guest handed over and *not*
 *                 part of the bill: it must not reach revenue, it must not be
 *                 taxed as a sale, and it must still be in the drawer at
 *                 counting time. A tip folded into `amount` is all three wrong.
 *
 *   `rounding`    DECISIONS Q7. Cash is rounded to 1 000 so'm, so the drawer can
 *                 be paid out in notes that exist; the difference is a real
 *                 gain or loss and belongs on the row that caused it. Signed,
 *                 because rounding to nearest goes both ways — a column that
 *                 could not hold a negative would silently turn every loss into
 *                 a gain, and the Z-report would balance while the drawer did
 *                 not.
 *
 *   `fee_amount`  The acquirer's cut: Uzcard and Humo 1.2%, Visa and Mastercard
 *                 2.4%, Click and Payme 1.5%. Taken by the bank, not by the
 *                 restaurant — so takings and *net* takings are different
 *                 numbers, and an owner comparing card revenue against a bank
 *                 statement is comparing two figures that should differ by
 *                 exactly this.
 *
 *   `fee_bps`     The rate as basis points, snapshotted. A contract renegotiated
 *                 in March must not restate February's margins, which is the
 *                 same reason a bill line keeps its own copy of the price.
 *
 * `branch_id` comes with them. A payment happens at an address — CLAUDE.md's
 * third rule — and a Z-report is per venue. It was derivable through the cash
 * shift, which is one join every report has to remember, and the one report that
 * forgets it reports the whole chain's takings as one restaurant's.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('finance.payments', function (Blueprint $table): void {
            $table->foreignId('branch_id')->nullable()->after('tenant_id')
                ->constrained('public.branches')->nullOnDelete();

            $table->string('reference', 120)->nullable()->after('amount')
                ->comment('Acquirer authorisation code or gateway transaction id');

            $table->unsignedBigInteger('tip')->default(0)->after('reference')
                ->comment('Tiyin handed over on top of the bill — never revenue');

            /*
             * Signed, and `bigInteger` rather than `unsignedBigInteger` for that
             * reason alone. Rounding to nearest produces a negative as often as a
             * positive; an unsigned column would take `-30000` and store
             * something else entirely, and nothing downstream would look wrong.
             */
            $table->bigInteger('rounding')->default(0)->after('tip')
                ->comment('Tiyin added by cash rounding — signed, see DECISIONS Q7');

            $table->unsignedBigInteger('fee_amount')->default(0)->after('rounding')
                ->comment("Tiyin the acquirer keeps — not the restaurant's");

            $table->unsignedInteger('fee_bps')->default(0)->after('fee_amount')
                ->comment('Fee rate in basis points, snapshotted at capture');
        });

        Schema::table('finance.payments', function (Blueprint $table): void {
            $table->index(['tenant_id', 'branch_id', 'business_date'], 'payments_tenant_branch_day_index');
        });

        /*
         * Backfill the branch from the shift that took the money.
         *
         * The only place it could have come from, and the reason the column is
         * worth having: every existing row already belongs to a venue, and the
         * knowledge was one join away in a table nobody was joining.
         */
        DB::statement(<<<'SQL'
            UPDATE finance.payments AS p
               SET branch_id = s.branch_id
              FROM finance.cash_shifts AS s
             WHERE s.id = p.cash_shift_id
               AND p.branch_id IS NULL
        SQL);
    }

    public function down(): void
    {
        Schema::table('finance.payments', function (Blueprint $table): void {
            $table->dropIndex('payments_tenant_branch_day_index');
            $table->dropConstrainedForeignId('branch_id');
            $table->dropColumn(['reference', 'tip', 'rounding', 'fee_amount', 'fee_bps']);
        });
    }
};
