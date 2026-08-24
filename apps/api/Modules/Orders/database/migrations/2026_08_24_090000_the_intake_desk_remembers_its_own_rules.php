<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The four automation switches and the prep-time picker, given somewhere to write.
 *
 * `calls-panels.tsx` drew both and neither left the browser: the switches set
 * React state and the prep picker set a number that lived until the next
 * reload. That is the worst version of a control on this screen, because an
 * operator who has "switched on" auto-accept believes prepaid tickets are
 * reaching the kitchen without them.
 *
 * ---------------------------------------------------------------------------
 * A table rather than a key on `tenants.settings`, and it is not the same
 * argument the doors made
 *
 * `orders.channel_settings` needed a table because a pause has a clock. These
 * have no clock. What they have is a permission problem: `PATCH /v1/settings`
 * sits on `system.settings`, which by the RBAC seeder is the owner's alone —
 * and this screen is `/calls`, the ORDER OPERATOR'S home. An operator setting
 * the quoted prep time is the single most ordinary thing that happens on that
 * desk, and routing it through the owner's settings document would have meant
 * either a 403 every evening or handing the intake desk the restaurant's legal
 * identity and tax rates. It sits on `orders.manage` beside the door switches
 * it is drawn next to.
 *
 * It is also per venue, for the reason the doors are: one branch's kitchen
 * being under water is not a reason for the other four to quote forty minutes.
 * A null `branch_id` is the platform's usual roll-up and means "everywhere".
 *
 * ---------------------------------------------------------------------------
 * Columns rather than a jsonb blob
 *
 * Five typed columns with database defaults, because the whole failure this
 * table exists to end was a value that meant nothing to anything downstream. A
 * jsonb document would accept `prep_minutes: "soon"`, store it forever, and be
 * read back as the default by the one place that quotes a time to a guest.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders.intake_policies', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->cascadeOnDelete();

            $table->boolean('auto_accept_prepaid')->default(true)
                ->comment('Money cleared, so no operator confirmation is needed');
            $table->boolean('hide_stopped_online')->default(true)
                ->comment("An 86'd dish dims on the site and in Telegram at once");
            $table->boolean('pause_at_peak')->default(true)
                ->comment('Stop taking online orders while the line is buried');
            $table->unsignedSmallInteger('peak_ticket_limit')->default(12)
                ->comment('How many open dockets counts as buried');
            $table->boolean('call_on_cash')->default(false)
                ->comment('An operator rings back to confirm address and total');

            /*
             * The time a guest is quoted, in minutes.
             *
             * Bounded in the request rather than here — a check constraint
             * would answer a 500 with no error envelope, and the console reads
             * `error.code` on everything else. The default is the design's own
             * 25, which is the figure `calls-data.ts` ships.
             */
            $table->unsignedSmallInteger('prep_minutes')->default(25);

            $table->foreignId('updated_by')->nullable()->constrained('public.users')->nullOnDelete();
            $table->timestamps();

            /*
             * One row per venue, in two halves — PostgreSQL does not consider
             * two NULLs equal, so the roll-up rows (exactly the ones a second
             * write would duplicate) would otherwise be constrained by nothing.
             * The same shape `orders.channel_settings` needed.
             */
            $table->unique(['tenant_id', 'branch_id'], 'intake_policies_one_per_venue');
        });

        DB::statement(
            'create unique index intake_policies_one_per_business'
            .' on orders.intake_policies (tenant_id) where branch_id is null',
        );

        RowLevelSecurity::guard('orders.intake_policies');
    }

    public function down(): void
    {
        Schema::dropIfExists('orders.intake_policies');
    }
};
