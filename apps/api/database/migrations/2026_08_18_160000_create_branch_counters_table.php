<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One row per thing a restaurant counts: a named, scoped, atomic counter.
 *
 * The bill number was `max(id) + 1`, which is wrong three separate ways. Two
 * waiters opening bills in the same second both read the same max and one of
 * them dies on the unique index. The id sequence is global, so a busy tenant
 * makes a quiet tenant's numbers jump — one restaurant's volume leaking into
 * another's paperwork. And ids never reset, so nothing here could ever hand a
 * Z-report its per-branch daily sequence, which is the next thing that needs
 * numbering.
 *
 * A counter row is (tenant, branch, key, period): `branch_id` null when the
 * count is restaurant-wide, `period` empty when it never resets, a date when
 * it resets daily. The increment is a single INSERT ... ON CONFLICT DO UPDATE
 * RETURNING — the database serialises concurrent takers on the row lock, so
 * two simultaneous opens get consecutive values and neither gets a duplicate.
 * PostgreSQL, not the application, is what makes this safe.
 *
 * NULLS NOT DISTINCT matters: without it every (tenant, NULL, key, '') insert
 * is "unique" and ON CONFLICT never fires — the counter would reset to 1 on
 * every take.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('public.branch_counters', function ($table): void {
            $table->id();

            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->cascadeOnDelete();

            // What is being counted, dotted like event names: `order.number`,
            // later `zreport.number`, `kitchen.docket`.
            $table->string('key', 48);

            // '' = never resets; a Y-m-d business date = resets with the day.
            // A string rather than a nullable date so the unique index has a
            // real value to compare — and so a counter's identity is readable
            // in a psql session without decoding sentinels.
            $table->string('period', 10)->default('');

            $table->unsignedBigInteger('value')->default(0);

            $table->timestamps();

            $table->unique(['tenant_id', 'branch_id', 'key', 'period'])->nullsNotDistinct();
        });

        // Seed `order.number` from what each restaurant has already issued —
        // soft-deleted bills included, because their numbers are spent too.
        // Without this the first bill after deploy would repeat a number the
        // printer already put in a guest's hand.
        if (DB::selectOne("select to_regclass('orders.orders') as t")->t !== null) {
            DB::statement(<<<'SQL'
                insert into public.branch_counters (tenant_id, branch_id, "key", period, value, created_at, updated_at)
                select tenant_id, null, 'order.number', '',
                       max(coalesce((regexp_match(number, '(\d+)'))[1]::bigint, 0)),
                       now(), now()
                from orders.orders
                group by tenant_id
            SQL);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('public.branch_counters');
    }
};
