<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The schedule sheet on `analytics/reports` had nowhere to write.
 *
 * Its own TODO listed three missing things and this is the first: *"the report,
 * the window, the cron expression, the recipients, who created it and when it
 * last ran. A schedule with no last-run column is a schedule nobody can tell has
 * stopped."* Every one of those is a column below, and `last_status` is there
 * for the same sentence — a schedule that has been failing for a fortnight
 * looks identical to one that is working until something records the refusal.
 *
 * ---------------------------------------------------------------------------
 * `next_run_at`, not a cron expression
 *
 * The TODO said "cron expression" and that is the thing not built, deliberately.
 * A cron string is a small language a manager cannot type and a server has to
 * parse; what the console offers is four choices — daily, weekly, monthly,
 * quarterly — and what a scheduler needs from any of them is one question:
 * *is anything due?* Storing the answer makes that question an index scan
 * rather than parsing every row's expression on every tick, and it makes a
 * schedule that was switched off for a month resume on its next slot rather
 * than firing thirty times to catch up.
 *
 * ---------------------------------------------------------------------------
 * `destinations` is jsonb, and that is not laziness
 *
 * A destination is a channel and an address — `{"channel":"mail","target":
 * "rustam@…"}` — and a restaurant sends one report to two people and a chat.
 * A child table would buy referential integrity over a value that has no
 * identity of its own: nothing joins to a destination, nothing references one,
 * and deleting a schedule deletes them all. What it would cost is a second
 * write on every save and a join on the one query the scheduler runs.
 *
 * `definition` is the same shape for the same reason: for a custom report it
 * holds the base, the chosen columns and the grouping, which is exactly the
 * body `POST /analytics/reports/custom` already takes. Storing it as the
 * request's own shape is what lets a saved schedule and a one-off run go
 * through the same whitelist rather than two.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('analytics.report_schedules', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            /*
             * Which venue's figures. Null is the platform's usual roll-up — the
             * whole business — and that is what an owner schedules; a branch
             * manager scheduling their own venue sets it.
             */
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('public.users')->nullOnDelete();

            $table->string('kind', 32)->comment('waiters|dishes|voids|stock|cashflow|custom');
            $table->string('period', 16)->default('week')->comment('today|week|month — the window the report covers');
            $table->string('frequency', 16)->comment('daily|weekly|monthly|quarter');

            $table->jsonb('destinations')->comment('[{channel: mail|telegram, target: …}]');
            $table->jsonb('definition')->nullable()->comment('base, columns, group_by — custom reports only');

            $table->boolean('is_active')->default(true);
            $table->datetime('next_run_at');
            $table->datetime('last_run_at')->nullable();
            $table->string('last_status', 16)->nullable()->comment('sent|failed|empty');
            $table->string('last_error', 255)->nullable();
            $table->timestamps();

            /*
             * The scheduler's only query: "what is due, anywhere on the
             * platform". It leads with `is_active` rather than `tenant_id`
             * because the command runs cross-tenant under bypass — this is the
             * one index in the module that is NOT read through the tenant
             * scope, and ordering it the usual way would leave it unused on the
             * single query it exists for.
             */
            $table->index(['is_active', 'next_run_at']);
            $table->index(['tenant_id', 'is_active']);
        });

        RowLevelSecurity::guard('analytics.report_schedules');
    }

    public function down(): void
    {
        Schema::dropIfExists('analytics.report_schedules');
    }
};
