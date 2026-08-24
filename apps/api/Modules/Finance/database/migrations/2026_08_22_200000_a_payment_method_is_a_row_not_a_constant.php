<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * How this restaurant takes money — configured, rather than compiled in.
 *
 * The settings screen has drawn a payment-method table since it was designed
 * and every control on it was inert, because there was nothing to write to.
 * The rows were two different kinds of thing wearing one shape: the TENDERS
 * (`Payment::METHODS` — cash, a card through the acquirer, a guest's tab) are a
 * closed set the till branches on, and the RAILS (Click, Payme, Uzum) are
 * drivers that either hold keys or do not.
 *
 * ---------------------------------------------------------------------------
 * What this table is, and the one thing it deliberately is not
 *
 * It is the restaurant's DECISION about a tender that already exists: is it
 * offered, in what order does it appear on the till, what does the bank keep,
 * does it produce a fiscal receipt, what is it called in three languages.
 *
 * It is **not** a way to invent a tender. `method` is checked against
 * `Payment::METHODS` by the request, and it has to be: a row naming
 * `bitcoin` would draw a button on a till that then cannot capture a payment
 * through it, because nothing downstream — not `Payment::METHODS`, not
 * `AcquirerFees`, not the Z-report's per-method split — has ever heard of it.
 * A label the till cannot take money through is worse than no row at all.
 *
 * ---------------------------------------------------------------------------
 * No card requisites here, and that is a rule rather than an omission
 *
 * There is no PAN column, no expiry, no CVV, no cardholder name, and none will
 * be added. This platform never holds a card: an acquirer's terminal takes the
 * card and hands back an approval code, and an online rail sends the guest to
 * the bank's own page. `payments.reference` holds that approval code and
 * nothing else.
 *
 * Storing requisites would put this platform inside PCI-DSS scope for every
 * restaurant on it — an audit, a scanned network, an encrypted store with key
 * rotation — in exchange for a capability nobody asked for. `gateway` names the
 * DRIVER that settles a rail; the driver's own credentials live in the
 * environment (`PAYME_MERCHANT_ID`, `CLICK_SECRET`), never in a tenant row, so
 * a leaked database is not a leaked merchant account.
 *
 * ---------------------------------------------------------------------------
 * `fee_bps`, and why it is nullable
 *
 * Basis points — hundredths of a percent — because 1.2% is not an integer
 * percent and the alternative is a float on a money path. The same unit
 * `App\Support\Finance\AcquirerFees` already uses.
 *
 * Null means "no negotiated rate", and the platform default applies. That is
 * not the same as zero: zero is a restaurant that genuinely pays nothing, and a
 * column that could not tell the two apart would silently zero the fee on every
 * rail the day this table was populated.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance.payment_methods', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * The tender this row configures — one of `Payment::METHODS`.
             *
             * Not a foreign key, because the set is a PHP constant rather than a
             * table, and it is right that it is one: `EloquentTillLedger` branches
             * on these values, `AcquirerFees` carries a default for each, and
             * `ShiftReporter` splits a Z-report by them. A row in a table cannot
             * teach any of those three what a new value means.
             */
            $table->string('method', 32);

            // What the manager sees on the till and on the receipt. jsonb
            // {uz,ru,en} like every other user-visible name on the platform.
            $table->jsonb('name');

            /*
             * Which of the three shapes this is: `cash` opens the drawer,
             * `card` settles through an acquirer, `online` sends the guest to a
             * bank's page, `credit` books a debt and moves no money tonight.
             *
             * The till already knows this per method; it is stored because the
             * settings screen groups by it and because a Z-report reconciles cash
             * against a drawer and everything else against a statement.
             */
            $table->string('kind', 16);

            /*
             * Whether a sale through this tender produces a fiscal receipt.
             *
             * True for everything a guest pays with in the room. False for a
             * corporate account settled by bank transfer and for a tab: no money
             * arrives at the moment of sale, and a fiscal receipt declaring cash
             * that has not been taken is a declaration of the wrong evening.
             */
            $table->boolean('is_fiscal')->default(true);

            // See the class docblock: null = the platform default, 0 = free.
            $table->unsignedSmallInteger('fee_bps')->nullable()
                ->comment('Acquirer share in basis points; null = platform default');

            /*
             * The driver that settles this row, when one does.
             *
             * `payme`, `click`, `uzum` — the names `GatewayRegistry` answers to.
             * Null for a tender the room settles by itself. Naming the driver
             * here is what lets a restaurant have two rows for one rail (a second
             * merchant account for a second brand) without the till guessing.
             */
            $table->string('gateway', 32)->nullable();

            $table->boolean('is_enabled')->default(true);

            // Where it sits on the till's tender sheet. A cashier's hand learns
            // positions, and a list that reordered itself alphabetically when a
            // rail was renamed would cost a mis-tendered bill a night.
            $table->unsignedSmallInteger('position')->default(0);

            $table->timestamps();

            $table->index(['tenant_id', 'is_enabled', 'position']);
        });

        /*
         * One row per tender per restaurant.
         *
         * `tenant_id` is nullable across this platform — a fixture row with no
         * restaurant is legal — and PostgreSQL does not consider two nulls equal,
         * so a plain unique index would enforce nothing on exactly those rows.
         * The partial pair says what was meant, the same way
         * `analytics.daily_facts` does for its roll-up rows.
         */
        DB::statement(
            'create unique index payment_methods_one_row_per_tender'
            .' on finance.payment_methods (tenant_id, method)'
            .' where tenant_id is not null',
        );

        RowLevelSecurity::guard('finance.payment_methods');
    }

    public function down(): void
    {
        // Dropping the table takes its indexes and its policy with it.
        Schema::dropIfExists('finance.payment_methods');
    }
};
