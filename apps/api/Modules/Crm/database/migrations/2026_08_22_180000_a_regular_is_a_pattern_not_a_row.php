<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The three things the console draws about a guest that nothing stored.
 *
 * `crm.customers` has always answered who somebody is and what they have spent.
 * Two screens ask it a different question — *how are they doing* — and neither
 * could be wired because of it:
 *
 *   - the CRM guest list draws a segment chip and "last seen five weeks ago",
 *     and its own file says so: wiring it would have taken two things off the
 *     card to put four on, and those two are the ones a marketer opens the
 *     screen for.
 *   - the order operator's caller card draws the last visit and the usual
 *     order while somebody is on the telephone. Without them a known regular
 *     looks exactly like a stranger, which is the one moment recognition is
 *     worth anything.
 *
 * ---------------------------------------------------------------------------
 * `segment` is stored, not derived on read
 *
 * It could be a `case` expression over `visits_count` and `last_visit_at`, and
 * that was the first shape. Two things killed it. A campaign sends to a
 * segment, so the segment has to be a value a row can be *filtered and indexed*
 * by — `where segment = 'at_risk'` over two hundred thousand guests is an index
 * scan when it is a column and a full table scan when it is arithmetic. And one
 * of the four is not derivable at all: `corporate` is somebody's decision about
 * a company account, and a nightly job that recomputed it would quietly wipe it
 * every night.
 *
 * So: three of the four are written by `crm:segment` overnight, `corporate` is
 * set by hand and the command never touches it. The thresholds live in
 * `config/crm.php` — one place, because the console draws the same words.
 *
 * ---------------------------------------------------------------------------
 * `last_visit_at` is not `updated_at`
 *
 * A guest row is touched when somebody edits a note, when points move, when a
 * tab is settled. None of those is a visit, and "last seen" computed from
 * `updated_at` would report that everybody came in this week — which is exactly
 * the failure that makes an at-risk list useless: it never has anybody on it.
 * The column is written in one place, by the listener that hears `orders.paid`.
 *
 * ---------------------------------------------------------------------------
 * `usual_order` is denormalised, and `crm.customer_dishes` is the working
 *
 * The tally table is what makes the answer honest — "what do they usually
 * order" is a count over a history, and a single column could only ever hold
 * the *last* thing they ordered, which is a different and much less useful
 * fact. The column beside it is the top row of that tally, written in the same
 * transaction as the tally itself.
 *
 * Denormalised on purpose, and for a specific read rather than for tidiness:
 * the guest list draws this for a page of a hundred at a time, and the caller
 * card draws it with somebody holding a telephone. A lateral "top dish per
 * customer" is one aggregate per row on the only read in this module that has a
 * person waiting on it.
 *
 * The title is stored rather than only the id because a dish can be renamed or
 * retired, and "usually orders dish #418" is not something an operator can say
 * out loud. The id is kept alongside it so the tally survives a rename.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('crm.customers', function (Blueprint $table): void {
            /*
             * Nullable, and that is the honest state for a guest nobody has
             * classified yet. A default of `occasional` would put every row
             * created before the first nightly run into a bucket it was never
             * measured for, and a segment nobody computed reads exactly like
             * one somebody did.
             */
            $table->string('segment', 16)->nullable()
                ->comment('regular|corporate|occasional|at_risk — three derived nightly, corporate set by hand');

            $table->timestamp('last_visit_at')->nullable()
                ->comment('When a bill of theirs was last settled. Never updated_at.');

            $table->string('usual_order', 160)->nullable()
                ->comment('Top row of crm.customer_dishes, denormalised for the list and the caller card');
            $table->unsignedBigInteger('usual_order_item_id')->nullable()
                ->comment('The dish behind the title, so a rename does not lose the tally');
        });

        /*
         * "Who is at risk" and "who is a regular" are the two reads this
         * column exists for, and both are per restaurant.
         */
        DB::statement('create index customers_by_segment on crm.customers (tenant_id, segment)');

        /*
         * The win-back trigger's whole query: guests whose last visit is older
         * than N days. Descending because the other reader — the console list
         * sorted by "last seen" — wants the recent end first, and one index
         * cannot be walked backwards cheaply on a partial.
         */
        DB::statement('create index customers_by_last_visit on crm.customers (tenant_id, last_visit_at desc)');

        Schema::create('crm.customer_dishes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('crm.customers')->cascadeOnDelete();

            /*
             * The dish, with no foreign key — Menu lives in another schema and
             * a constraint across it would be a module boundary written in DDL.
             * The same shape `crm.promo_redemptions` already uses for orders.
             */
            $table->unsignedBigInteger('menu_item_id');
            $table->string('title', 160)->comment('As it was called when they ordered it');
            $table->unsignedInteger('times')->default(0)->comment('Bills containing it, not portions');
            $table->timestamp('last_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'customer_id', 'menu_item_id']);
            // "Their top dish", which is the only read.
            $table->index(['tenant_id', 'customer_id', 'times']);
        });

        RowLevelSecurity::guard('crm.customer_dishes');
    }

    public function down(): void
    {
        Schema::dropIfExists('crm.customer_dishes');

        DB::statement('drop index if exists crm.customers_by_last_visit');
        DB::statement('drop index if exists crm.customers_by_segment');

        Schema::table('crm.customers', function (Blueprint $table): void {
            $table->dropColumn(['segment', 'last_visit_at', 'usual_order', 'usual_order_item_id']);
        });
    }
};
