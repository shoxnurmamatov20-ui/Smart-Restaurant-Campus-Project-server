<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The opening checklist, recorded.
 *
 * A manager works down seven items every morning — count the float, log the
 * fridge temperatures, walk the dining room — and the console drew all seven
 * with working tick boxes that held their state in a browser tab. Refresh the
 * page and the morning never happened. That is worse than no checklist at all:
 * a list that looks recorded is one people believe there is a trail of, and the
 * whole reason a restaurant keeps one is the day an inspector asks.
 *
 * ---------------------------------------------------------------------------
 * A row per tick, not a row per day with seven booleans
 *
 * Because the interesting columns are WHO and WHEN, and a wide row can only
 * carry one of each. "The fridges were logged" is not the fact anybody wants at
 * eleven o'clock on a Thursday; "Sardor logged them at 07:12" is. Un-ticking
 * deletes the row rather than writing `false` — an item nobody has got to yet
 * and an item somebody undid are the same state, and inventing a difference
 * would need a third value the screen has no way to draw.
 *
 * ---------------------------------------------------------------------------
 * `business_day`, not `created_at::date`
 *
 * A date column, filled by the caller from the venue's own trading day. A bar
 * that closes at two in the morning opens its checklist before midnight and
 * finishes it after; grouping by the timestamp's calendar date would split one
 * opening across two days and show both as half done. It is also what lets the
 * screen ask for a day without `whereDate()`, which this codebase forbids by
 * name — the column is the value, so the index is usable.
 *
 * `branch_id` because opening is something that happens at an address: five
 * venues open five times, and one shared list would have the first manager to
 * arrive tick the box for everybody.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff.opening_checklist_ticks', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->cascadeOnDelete();

            $table->date('business_day');
            $table->string('item', 40)->comment('One of OpeningChecklistTick::ITEMS — the server owns the list');

            // Who ticked it. Nullable only so a person leaving the company does
            // not delete the fact that the fridges were logged in March.
            $table->foreignId('user_id')->nullable()->constrained('public.users')->nullOnDelete();
            $table->string('by_name', 120)->nullable()
                ->comment('The name as it read that morning; the account may be renamed or gone');

            $table->timestamps();

            /*
             * One tick per item per venue per day.
             *
             * Two managers pressing the same box within a second of each other
             * is the ordinary case on a busy opening, and without this the list
             * would show "9 / 7 done". The upsert in the controller leans on it.
             */
            $table->unique(['tenant_id', 'branch_id', 'business_day', 'item'], 'opening_checklist_one_tick_per_item');
            // "Today's list, here" — the only query this table has.
            $table->index(['tenant_id', 'business_day']);
        });

        /*
         * And the same rule for a restaurant with no venue in context.
         *
         * PostgreSQL treats NULLs as distinct, so the unique index above does
         * not constrain the single-venue case at all — `branch_id` is null
         * there, and two presses would make two rows and a list reading
         * "9 / 7 done". A partial index is the only way to say it.
         */
        DB::statement(
            'create unique index opening_checklist_one_tick_no_branch on staff.opening_checklist_ticks'
            .' (tenant_id, business_day, item) where branch_id is null',
        );

        RowLevelSecurity::guard('staff.opening_checklist_ticks');
    }

    public function down(): void
    {
        RowLevelSecurity::release('staff.opening_checklist_ticks');
        DB::statement('drop index if exists staff.opening_checklist_one_tick_no_branch');
        Schema::dropIfExists('staff.opening_checklist_ticks');
    }
};
