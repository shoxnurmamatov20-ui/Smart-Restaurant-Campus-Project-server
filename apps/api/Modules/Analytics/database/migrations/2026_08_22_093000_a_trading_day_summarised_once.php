<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One row per venue per trading day: the read model this module was promised.
 *
 * `ModuleBoundaryTest` has reserved the `analytics` schema since it was written
 * — *"Analytics reports across the others and creates no tables of its own; its
 * schema is reserved for projections"* — and this is the first projection.
 *
 * ---------------------------------------------------------------------------
 * Why a table at all, when everything was derived on read
 *
 * `AnalyticsController` says it plainly: *"Every figure is derived on read.
 * Nothing is cached or denormalised yet — at Phase-1 volumes a few aggregate
 * queries are far cheaper than a summary table that can silently drift."* That
 * argument is still correct for revenue, and it is why revenue is STILL derived
 * on read and this table is not what the dashboard reads for it.
 *
 * It stops being correct for exactly two figures, and for a reason that is not
 * about volume: **labour cost** and **waste** live in Staff and Inventory,
 * which Analytics may not read. They arrive through
 * `App\Contracts\Staff\Roster` and `App\Contracts\Inventory\StockReport`, and a
 * contract call cannot be joined, grouped by branch, or compared against the
 * same window last month. A month of labour share is thirty contract calls made
 * one at a time — or one scan of this table.
 *
 * So the split is deliberate: what Analytics can compute, it computes live;
 * what has to come across a boundary is projected here nightly by
 * `analytics:rollup`. A figure in this table is at most a day old and says so
 * through `computed_at`.
 *
 * ---------------------------------------------------------------------------
 * Idempotent by key, not by "insert if missing"
 *
 * `(tenant_id, branch_id, business_date)` is unique, and the rollup upserts on
 * it. Running the command twice for the same day — a retry, a backfill, a
 * scheduler that fired on both sides of a deploy — must produce the same row
 * rather than a second one, because a dashboard summing two rows for one
 * Tuesday would report a restaurant that earned twice.
 *
 * `branch_id` is part of the key and nullable, which is the platform's usual
 * meaning: a null branch is the roll-up across the business. The rollup writes
 * one row per venue AND one for the whole restaurant, because an owner
 * comparing five branches and an owner reading the group total are asking
 * different questions and neither should have to sum the other.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('analytics.daily_facts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->cascadeOnDelete();

            /*
             * The trading day, not the calendar day. A restaurant's day runs
             * 06:00 → 06:00, so the 01:30 bill belongs to the evening that is
             * still finishing — the same column every other report on this
             * platform groups by, and the reason `whereDate()` is banned.
             */
            $table->date('business_date');

            // Money, all of it integer tiyin. Named for what it is: revenue is
            // what the bills totalled, takings is what actually arrived, and a
            // credit sale is the first without the second.
            $table->bigInteger('revenue_tiyin')->default(0);
            $table->bigInteger('takings_tiyin')->default(0);
            $table->bigInteger('discounts_tiyin')->default(0);
            $table->bigInteger('expenses_tiyin')->default(0);

            /*
             * Cost of goods, over the dishes that HAVE a costed recipe.
             *
             * `cogs_coverage_percent` is beside it and is not decoration: a
             * gross profit derived from a partial cost base overstates itself
             * by exactly the share of the menu nobody has costed, which is the
             * number an owner is least able to check. Storing the coverage is
             * what lets a screen decide whether to draw the figure at all —
             * `overview-server.ts` currently refuses to, and says why.
             */
            $table->bigInteger('cogs_tiyin')->default(0);
            $table->unsignedSmallInteger('cogs_coverage_percent')->default(0);

            // The two that had to cross a module boundary to get here.
            $table->bigInteger('labour_tiyin')->default(0);
            $table->bigInteger('waste_tiyin')->default(0);

            $table->unsignedInteger('orders_count')->default(0);
            $table->unsignedInteger('guests_count')->default(0);

            /*
             * When this row was last built.
             *
             * A projection with no staleness marker is a projection nobody can
             * tell from live data — and this one IS stale by design, by up to a
             * day. The dashboard prints it rather than pretending.
             */
            $table->datetime('computed_at');
            $table->timestamps();

            // "This venue, over this window" — the only query shape that reads
            // this table, and the reason the key is ordered the way it is.
            $table->index(['tenant_id', 'branch_id', 'business_date'], 'daily_facts_by_window');
        });

        /*
         * Uniqueness in two halves, because PostgreSQL does not think two NULLs
         * are equal.
         *
         * A plain `unique(tenant_id, branch_id, business_date)` would enforce
         * nothing at all on the roll-up rows — the ones whose `branch_id` is
         * null and which are exactly the ones a second run would duplicate,
         * because they are written once per restaurant rather than once per
         * venue. The partial pair says what was meant: one row per venue per
         * day, and one roll-up per restaurant per day.
         */
        DB::statement(
            'create unique index daily_facts_one_row_per_venue'
            .' on analytics.daily_facts (tenant_id, branch_id, business_date)'
            .' where branch_id is not null',
        );

        DB::statement(
            'create unique index daily_facts_one_rollup_per_day'
            .' on analytics.daily_facts (tenant_id, business_date)'
            .' where branch_id is null',
        );

        RowLevelSecurity::guard('analytics.daily_facts');
    }

    public function down(): void
    {
        // Dropping the table takes its indexes and its policy with it.
        Schema::dropIfExists('analytics.daily_facts');
    }
};
