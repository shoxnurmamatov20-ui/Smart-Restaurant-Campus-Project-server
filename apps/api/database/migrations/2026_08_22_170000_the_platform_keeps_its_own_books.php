<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The platform console's own tables — what the operator sells, bills and answers.
 *
 * `(platform)/platform` draws twelve screens against `platform-data.ts`, and
 * every figure on them is invented: eight tenants, six invoices, four operators.
 * The screens are not the problem — the product genuinely has a plan, a monthly
 * invoice and a support queue, and none of them had anywhere to live.
 *
 * ---------------------------------------------------------------------------
 * Why `public` and not a `platform` schema
 *
 * Schema-per-module (ADR-0010) is about MODULES, and this is not one — it is
 * the core, the same place `tenants`, `branches` and `users` live. A thirteenth
 * schema would also have to be added to `search_path`, to `ModuleBoundaryTest`
 * and to the module registry, all of which say "a module lives here" about
 * something that is not a module. The `platform_` prefix does the naming work.
 *
 * ---------------------------------------------------------------------------
 * Row-level security, and the one table that has none
 *
 * `platform_invoices`, `platform_issues` and `impersonations` all carry
 * `tenant_id` and are guarded like everything else. That reads oddly for tables
 * only the operator queries — until you remember the operator's connection is
 * the one that BYPASSES, so the policy costs them nothing and protects the
 * other direction: a restaurant's own request can never read another's invoice,
 * whatever future endpoint gets pointed at these rows.
 *
 * `platform_plans` and `platform_settings` have no `tenant_id` because they
 * belong to nobody — a price list and four switches are the same for everyone
 * on the platform, which is what makes them the platform's.
 */
return new class extends Migration
{
    public function up(): void
    {
        /*
         * ---- What the platform sells ----
         *
         * Prices in tiyin like all money, and the ceilings nullable rather than
         * zero or a large number: `enterprise` has no branch limit, and "no
         * limit" written as 999999 is a limit somebody eventually hits at three
         * in the morning.
         */
        Schema::create('public.platform_plans', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 32)->unique()->comment('start|growth|enterprise');
            $table->unsignedBigInteger('price_tiyin')->comment('Per month. 1 UZS = 100 tiyin');
            $table->unsignedInteger('branch_limit')->nullable()->comment('null = no ceiling');
            $table->unsignedInteger('user_limit')->nullable();
            $table->unsignedInteger('terminal_limit')->nullable();
            $table->unsignedInteger('order_limit')->nullable()->comment('Per month');
            $table->json('features')->nullable()->comment('kds|delivery|loyalty|multiBranch');
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        /*
         * ---- What a restaurant owes ----
         *
         * One row per restaurant per month. `paid_at` rather than a paid flag,
         * because the date is the thing an operator is actually asked about,
         * and a boolean loses it.
         *
         * There is no automatic collection here and that is honest rather than
         * unfinished: nobody's card is on file, an operator marks an invoice
         * paid when the bank statement shows it, and a system that pretended
         * otherwise would show "failing" for a restaurant that paid last week.
         */
        Schema::create('public.platform_invoices', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->constrained('public.tenants')->cascadeOnDelete();
            $table->string('number', 32)->comment('INV-2026-814 — what both sides quote');
            $table->date('period')->comment('First day of the month billed');
            $table->unsignedBigInteger('amount_tiyin');
            $table->string('status', 16)->default('due')->comment('due|paid|overdue');
            $table->date('issued_on');
            $table->date('due_on');
            $table->datetime('paid_at')->nullable();
            /*
             * How many times collection has been tried.
             *
             * On the screen because it decides the next move: a first failure
             * is usually a bank, a fourth is a customer who has left.
             */
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->string('plan_key', 32)->nullable();
            $table->unsignedInteger('branches')->default(1)->comment('What the price was multiplied by');
            $table->string('note', 500)->nullable();
            $table->timestamps();

            $table->unique('number');
            // One invoice per restaurant per month — the constraint is the
            // dedupe, so a retried "issue this month" does not bill twice.
            $table->unique(['tenant_id', 'period']);
            $table->index(['status', 'due_on']);
        });

        /*
         * ---- What is going wrong ----
         *
         * The support screen's queue, and the overview's "open problems" count.
         * `tenant_id` nullable because some of them are the platform's own —
         * a queue backing up, a Reverb node down — and belong to nobody.
         */
        Schema::create('public.platform_issues', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->nullOnDelete();
            $table->string('title', 200);
            $table->text('body')->nullable();
            $table->string('severity', 16)->default('warning')->comment('info|warning|error');
            $table->string('status', 16)->default('open')->comment('open|acknowledged|closed');
            $table->string('source', 32)->default('platform')->comment('sync|queue|billing|fiscal|auth|backup');
            $table->unsignedBigInteger('assigned_to_user_id')->nullable();
            $table->datetime('closed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'severity', 'id']);
            $table->index(['tenant_id', 'status']);
        });

        /*
         * ---- Who stood inside somebody else's restaurant ----
         *
         * The most powerful thing this product can do, so it is a table rather
         * than a log line. `tenant-list.tsx` says why in one sentence: "an
         * untraceable impersonation is worse than none".
         *
         * `reason` is NOT NULL and has no default. That is the whole design:
         * the operator has to write down why before the token is minted, and a
         * column that could be empty is a column that always is.
         */
        Schema::create('public.impersonations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->constrained('public.tenants')->cascadeOnDelete();
            $table->unsignedBigInteger('operator_user_id')->comment('The platform person');
            $table->unsignedBigInteger('target_user_id')->comment('Whose seat they took');
            $table->string('reason', 500);
            // Which token this session was, so revoking it is possible and so
            // an audit can tie a request back to the row that authorised it.
            $table->unsignedBigInteger('token_id')->nullable();
            $table->datetime('expires_at');
            $table->datetime('ended_at')->nullable();
            $table->string('ip', 45)->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'id']);
            $table->index(['operator_user_id', 'id']);
        });

        /*
         * ---- The four switches the operator owns ----
         *
         * A table rather than config, because they change while the process is
         * running: `maintenance` is flipped during an incident and a config file
         * would need a deploy to say so.
         */
        Schema::create('public.platform_settings', function (Blueprint $table): void {
            $table->string('key', 64)->primary();
            $table->json('value');
            $table->timestamps();
        });

        /*
         * ---- What a restaurant is on ----
         *
         * `status` already says active/suspended/archived; these three say what
         * the operator sells them and until when. On the tenant row rather than
         * in `settings` because the platform console filters and sorts by them,
         * and a jsonb key is not an index.
         */
        Schema::table('public.tenants', function (Blueprint $table): void {
            $table->string('plan_key', 32)->nullable()->after('status');
            $table->datetime('trial_ends_at')->nullable()->after('plan_key');
            $table->string('operator_note', 500)->nullable()->after('trial_ends_at');
        });

        DB::table('public.platform_settings')->insert([
            // The defaults are the design's own (`PLATFORM_SETTINGS`).
            ['key' => 'signups', 'value' => 'true', 'created_at' => now(), 'updated_at' => now()],
            ['key' => 'trialDays', 'value' => '14', 'created_at' => now(), 'updated_at' => now()],
            ['key' => 'impersonation', 'value' => 'true', 'created_at' => now(), 'updated_at' => now()],
            ['key' => 'maintenance', 'value' => 'false', 'created_at' => now(), 'updated_at' => now()],
        ]);

        RowLevelSecurity::guard(
            'public.platform_invoices',
            'public.platform_issues',
            'public.impersonations',
        );
    }

    public function down(): void
    {
        Schema::table('public.tenants', function (Blueprint $table): void {
            $table->dropColumn(['plan_key', 'trial_ends_at', 'operator_note']);
        });

        Schema::dropIfExists('public.platform_settings');
        Schema::dropIfExists('public.impersonations');
        Schema::dropIfExists('public.platform_issues');
        Schema::dropIfExists('public.platform_invoices');
        Schema::dropIfExists('public.platform_plans');
    }
};
