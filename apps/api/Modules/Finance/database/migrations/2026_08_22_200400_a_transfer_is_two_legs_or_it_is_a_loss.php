<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Where the money sits when it is not in a till, and how it moves between.
 *
 * The cash book on the ledger screen draws rows across accounts — drawer, safe,
 * bank — with a running balance. Two things stopped it being real, and this
 * migration is both.
 *
 * ---------------------------------------------------------------------------
 * 1. There was nowhere for money to be
 *
 * `finance.cash_movements` hangs every row off a `cash_shift_id`, which means
 * every movement this platform can record is something that happened to a
 * DRAWER while a cashier had it open. Money in the safe overnight, a deposit
 * carried to the bank on Monday, petty cash held in the office — none of it
 * existed. `finance.cash_accounts` is where it does now.
 *
 * ---------------------------------------------------------------------------
 * 2. A transfer was one row, and one row is a loss
 *
 * 5 000 000 so'm leaving the till for the safe was recorded as an `out` and
 * nothing else. The ledger read that as money gone: a night that made a profit
 * showed a loss, and the only way to see otherwise was to know that the safe was
 * not in the system. `counterpart_id` is the fix — the two legs point at each
 * other, written in one transaction, and a reader can tell "moved" from "spent"
 * without being told which accounts exist.
 *
 * The self-reference is deliberately nullable and deliberately not a
 * composite: a collection paid to a courier IS one leg — the money genuinely
 * leaves the business — and forcing every movement into a pair would have
 * invented a destination for it.
 *
 * ---------------------------------------------------------------------------
 * Both anchors are nullable, and one of them must be present
 *
 * `cash_shift_id` was NOT NULL. It cannot stay that way: a safe-to-bank
 * transfer touches no till and no cashier, and there is no shift to name. So
 * both anchors are nullable and a CHECK enforces what was really meant — a
 * movement belongs to a drawer, or to an account, and a row that named neither
 * would be money that moved nowhere.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance.cash_accounts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * The venue that holds it. A safe stands in one building; a bank
             * account usually belongs to the business, so `branch_id` is null
             * for it — the platform's usual reading of an unset branch.
             */
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->nullOnDelete();

            $table->string('code', 32);
            $table->jsonb('name');

            // `safe` (the room's own), `bank` (a settlement account), `petty`
            // (the office float). Tills are NOT accounts: a drawer is a shift,
            // it opens and closes with a count, and modelling it twice would
            // give the same banknotes two balances.
            $table->string('kind', 16)->default('safe');

            /*
             * What was in it when the platform started counting, in tiyin.
             *
             * A running balance has to start somewhere, and the alternative —
             * assuming zero — tells a restaurant with 40 000 000 so'm in the
             * safe that its ledger is 40 000 000 short and always will be.
             */
            $table->bigInteger('opening_balance')->default(0);

            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['tenant_id', 'branch_id', 'is_active']);
        });

        DB::statement(
            'create unique index cash_accounts_one_code_per_restaurant'
            .' on finance.cash_accounts (tenant_id, code)'
            .' where tenant_id is not null',
        );

        RowLevelSecurity::guard('finance.cash_accounts');

        Schema::table('finance.cash_movements', function (Blueprint $table): void {
            $table->foreignId('cash_account_id')->nullable()->after('cash_shift_id')
                ->constrained('finance.cash_accounts')->nullOnDelete();

            // The other half of a transfer. Self-referencing, nullable, and set
            // on both rows so either can be read first.
            $table->unsignedBigInteger('counterpart_id')->nullable()->after('cash_account_id');

            $table->index(['tenant_id', 'cash_account_id', 'business_date'], 'cash_movements_by_account');
        });

        // Was NOT NULL. See the class docblock — a safe-to-bank transfer has no
        // drawer, and pretending it belongs to one would put a cashier's name on
        // money they never touched.
        DB::statement('alter table finance.cash_movements alter column cash_shift_id drop not null');

        DB::statement(
            'alter table finance.cash_movements add constraint cash_movements_have_somewhere_to_be'
            .' check (cash_shift_id is not null or cash_account_id is not null)',
        );
    }

    public function down(): void
    {
        DB::statement('alter table finance.cash_movements drop constraint if exists cash_movements_have_somewhere_to_be');

        Schema::table('finance.cash_movements', function (Blueprint $table): void {
            $table->dropIndex('cash_movements_by_account');
            $table->dropConstrainedForeignId('cash_account_id');
            $table->dropColumn('counterpart_id');
        });

        // Rolling forward left every existing row with a shift, so putting the
        // constraint back cannot fail on data this migration created.
        DB::statement('alter table finance.cash_movements alter column cash_shift_id set not null');

        Schema::dropIfExists('finance.cash_accounts');
    }
};
