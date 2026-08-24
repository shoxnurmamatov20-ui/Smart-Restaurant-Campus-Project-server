<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The automation tab's four switches, and the thing behind them.
 *
 * `marketing-panels.tsx` was blunt about what the switch was worth without
 * this: "the flag is also the smallest part … turning the flag on with none of
 * that would be a switch that reports 'sending' and sends nothing — which is
 * worse than a switch that says it is a demonstration."
 *
 * Four things had nowhere to live, and each is a column here: the rule
 * ("three days before the birthday", "sixty days since the last visit"), the
 * message, the repeat guard ("not again for three months"), and the two
 * counters the card reports.
 *
 * ---------------------------------------------------------------------------
 * `kind` is a closed set, and the offsets are what vary
 *
 *   `birthday`     `offset_days` before it — the coupon needs to arrive early
 *                  enough to be usable, which is why this is not "on the day"
 *   `win_back`     `offset_days` since the last visit
 *   `first_visit`  `offset_hours` after the first bill settled
 *   `points_expiry` `offset_days` before points lapse
 *
 * A closed set rather than a rule language for the same reason `crm.promotions`
 * has four rule kinds: each of these is a different *query* over the guest
 * list, and a query language stored in a column is a query nobody can index.
 *
 * ---------------------------------------------------------------------------
 * `crm.trigger_sends` is the repeat guard, and it is the whole point
 *
 * A win-back that fires every night is not a win-back, it is a reason to block
 * the number. The table is one row per person per trigger per firing, and
 * `cooldown_days` is checked against the newest of them. Kept separate from
 * `campaign_deliveries` on purpose: a campaign is a thing somebody pressed
 * send on and wants a report about, and folding an automation's daily trickle
 * into that list would bury the four real campaigns of a month under nine
 * hundred birthday messages.
 *
 * ---------------------------------------------------------------------------
 * `sent_this_month` and `converted_this_month` are not stored
 *
 * The card draws both, and both are counted from `trigger_sends` per request.
 * A stored counter would need resetting on the first of the month by something,
 * and the something is a job that has to be right about timezones for forty
 * restaurants — for two numbers on one card. Counting rows in a month-bounded
 * index is cheaper than being wrong.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm.triggers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * The stable handle the console addresses a row by.
             *
             * The screen's ids — `bday`, `back`, `first`, `sleep` — were the
             * fixture's own, and its comment said "a real row would be addressed
             * by key". This is that key: unique per restaurant, so the seeded
             * four keep the names the console already knows and a fifth invented
             * by a marketer cannot collide with them.
             */
            $table->string('key', 32);
            $table->string('kind', 24)->comment('birthday|win_back|first_visit|points_expiry');

            $table->jsonb('name')->comment('{uz,ru,en}');
            $table->jsonb('rule_text')->nullable()->comment('{uz,ru,en} — the rule in words, as the card prints it');
            $table->text('body')->comment('The message itself. One language: a segment is not multilingual.');

            $table->integer('offset_days')->default(0)->comment('Before or since, per kind');
            $table->integer('offset_hours')->default(0)->comment('Used by first_visit only');
            $table->integer('cooldown_days')->default(90)->comment('Never twice inside this window');
            $table->bigInteger('min_tiyin')->default(0)->comment('points_expiry: only balances above this');

            $table->boolean('is_active')->default(false);
            $table->datetime('last_run_at')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'is_active']);
        });

        DB::statement(
            'create unique index triggers_one_key_per_restaurant'
            .' on crm.triggers (tenant_id, key) where deleted_at is null',
        );

        Schema::create('crm.trigger_sends', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('trigger_id')->constrained('crm.triggers')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('crm.customers')->cascadeOnDelete();

            /*
             * Which campaign carried it. A trigger does not send SMS itself — it
             * creates a campaign and lets the one dispatch path do the work, so
             * there is exactly one place that talks to a gateway, counts parts
             * and records what it cost.
             */
            $table->foreignId('campaign_id')->nullable()->constrained('crm.campaigns')->nullOnDelete();

            /*
             * Whether they came in afterwards. Written by the visit listener when
             * a bill settles inside the attribution window, which is the only
             * honest definition available: a guest who ate three weeks later did
             * not come because of a birthday message.
             */
            $table->boolean('converted')->default(false);
            $table->datetime('converted_at')->nullable();

            $table->timestamps();

            // "Has this person had this one lately" — the cooldown check.
            $table->index(['tenant_id', 'trigger_id', 'customer_id', 'created_at']);
            // "How many went out this month, how many came in" — the two counters.
            $table->index(['tenant_id', 'trigger_id', 'created_at']);
        });

        RowLevelSecurity::guard('crm.triggers', 'crm.trigger_sends');
    }

    public function down(): void
    {
        Schema::dropIfExists('crm.trigger_sends');
        Schema::dropIfExists('crm.triggers');
    }
};
