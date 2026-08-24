<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A drawer, counted note by note, at one moment, by one named person.
 *
 * The figure a Z-report is reconciled against was until now a single integer a
 * client sent — `counted_cash`. Anybody can type 480 000 without opening the
 * drawer at all, and nothing downstream could tell that apart from somebody who
 * stood there and counted. This table is the difference: the notes are the
 * record, and the total is derived from them.
 *
 *   `breakdown`  jsonb, denomination in tiyin => how many of that note. Keys are
 *                the notes actually in circulation here (200 000 down to 1 000,
 *                no coin row); a key outside that ladder is refused rather than
 *                stored, because a count of 37 of a note that does not exist is
 *                a typo that would otherwise become a shortfall.
 *
 *   `total`      Derived from the breakdown at write time and STORED. Not a
 *                convenience: the ladder is configuration, and a country that
 *                withdraws a note next year must not restate last year's Z. Same
 *                reason `payments.fee_bps` is a snapshot.
 *
 *   `kind`       Why the drawer was open. `open` is the float, `close` the count
 *                that ends the shift, `handover` the one that ends it and floats
 *                the next person in the same notes, `collection` the money that
 *                left for the safe mid-service, `x` a manager's spot check that
 *                decides nothing.
 *
 *   two people   `counted_by_user_id` and `witnessed_by_user_id` — the two
 *                signature lines the plan asks the Z to print. The witness is
 *                nullable because a single-till café at midnight has one person
 *                in the building, and a column that forced a second name would
 *                be filled in with the first.
 *
 * No soft deletes and no delete route. A count is evidence about a drawer at a
 * moment; there is no version of it that is wrong enough to remove and not
 * serious enough to keep.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance.cash_counts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->nullOnDelete();
            $table->foreignId('cash_shift_id')->constrained('finance.cash_shifts')->cascadeOnDelete();
            $table->date('business_date')->nullable()->comment('The trading day, from counted_at — Q3');
            $table->string('kind', 16)->comment('open|close|handover|collection|x');
            $table->jsonb('breakdown')->comment('Denomination in tiyin => how many notes');
            $table->unsignedBigInteger('total')->comment('Derived from the breakdown at write time, in tiyin');
            $table->unsignedBigInteger('counted_by_user_id')->nullable();
            $table->unsignedBigInteger('witnessed_by_user_id')->nullable()->comment('The second signature on the Z');
            $table->string('note', 255)->nullable();
            $table->datetime('counted_at');
            $table->timestamps();

            $table->index(['tenant_id', 'cash_shift_id', 'kind']);
            $table->index(['tenant_id', 'branch_id', 'business_date']);
        });

        /*
         * One opening float, one closing count, one handover per shift.
         *
         * Partial, because the kinds it leaves out are genuinely repeatable: a
         * manager may spot-check the drawer four times in an evening and the
         * takings may go to the safe twice. The three it covers each mark a
         * moment that happens once, and a second row for any of them would mean
         * two answers to "what was in the drawer when this shift ended".
         */
        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX cash_counts_one_per_shift_moment
                ON finance.cash_counts (cash_shift_id, kind)
                WHERE kind IN ('open', 'close', 'handover')
        SQL);

        // The sweep in 2026_08_18_170000 ran before this table existed, so it
        // has to claim the policy itself or it is readable across restaurants.
        RowLevelSecurity::guard('finance.cash_counts');
    }

    public function down(): void
    {
        // Dropping the table takes the policy with it.
        Schema::dropIfExists('finance.cash_counts');
    }
};
