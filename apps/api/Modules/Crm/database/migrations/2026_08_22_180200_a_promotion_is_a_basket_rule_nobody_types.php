<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Offers a guest never types, which is what makes them not promo codes.
 *
 * `marketing-panels.tsx` put it precisely: a promo code is A WORD A GUEST TYPES
 * with a percent or an amount behind it, and every row on the promotions tab is
 * a basket rule nobody types — "starter + main + tea for 48 000 between 12:00
 * and 15:00, dine-in, Monday to Friday". `crm.promo_codes` has `kind` of
 * `percent|fixed` and no column for the rule, the day window, the hour window
 * or the channel, and it has no id these rows could be addressed by at all:
 * the pause button was keyed by array position because there was no table.
 *
 * ---------------------------------------------------------------------------
 * Four rule kinds, and why they are an enum rather than an expression
 *
 *   `bundle`      a fixed price for a named set of dishes — the business lunch
 *   `nth_off`     buy N, the cheapest is X% off — "second pizza 50%"
 *   `gift`        a free dish once the basket clears a floor
 *   `basket_off`  a percent or an amount off the whole basket
 *
 * A rule engine would be more general and would be the wrong trade here. Every
 * one of these has to be evaluated by the till on the ticket a cashier is
 * holding, and a general expression evaluated per line is both slower and
 * unauditable: "why was this bill 12 000 cheaper" has to have an answer a
 * manager can read. Four kinds cover every offer the design draws, and a fifth
 * is a migration rather than a debugging session.
 *
 * `dishes` is a jsonb array of menu item ids and NOT a foreign key — Menu lives
 * in another schema and a constraint across it would be a module boundary
 * written in DDL, the same shape `crm.promo_redemptions` already uses.
 *
 * ---------------------------------------------------------------------------
 * The windows are two columns each, and neither is a datetime
 *
 * `days` is a jsonb array of ISO weekday numbers and `starts_minute`/
 * `ends_minute` are minutes past midnight in the venue's own clock. Storing
 * "12:00–15:00, Mon–Fri" as datetimes would mean one row per week forever, and
 * storing it as a string would mean parsing it on every bill.
 *
 * Minutes rather than a `time` column because the window may cross midnight —
 * a bar's happy hour ends at 01:00 — and `ends_minute < starts_minute` says so
 * in a way one integer comparison can act on.
 *
 * ---------------------------------------------------------------------------
 * `used_count` and `revenue_tiyin` are counters, `margin` is not stored
 *
 * The screen draws three figures per offer: used, revenue and margin impact.
 * The first two are counted as bills are settled — they are facts about the
 * past and cannot be recomputed once a dish is repriced. The third is
 * deliberately absent: margin is revenue against food cost, food cost lives in
 * Inventory's recipes, and a margin column written here would be right on the
 * day it was written and wrong every morning after with nothing on the screen
 * to say which. The API computes it per request from the two stored figures and
 * the cost the caller supplies.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm.promotions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * Nullable branch, and the null is the useful case: a promotion with
             * no branch runs at every venue, which is what a chain's marketing
             * department means by an offer. One venue trialling something is the
             * exception and gets an id.
             */
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->cascadeOnDelete();

            $table->jsonb('name')->comment('{uz,ru,en} — a guest reads this on the receipt line');
            $table->jsonb('rule_text')->nullable()->comment('{uz,ru,en} — the offer in words, for the console and the board');

            $table->string('kind', 16)->comment('bundle|nth_off|gift|basket_off');

            /*
             * What the rule is worth, in the unit its kind implies: tiyin for a
             * `bundle` price and a `gift`'s basket floor, whole percents for
             * `nth_off` and a percentage `basket_off`. One integer column serves
             * all four because the platform's first rule is that no money is a
             * float — `0.5` in a money path is exactly what that rule keeps out.
             */
            $table->integer('value')->default(0);
            $table->bigInteger('min_tiyin')->default(0)->comment('Basket floor before the offer applies');
            $table->unsignedSmallInteger('quantity')->default(0)->comment('N for nth_off; 0 otherwise');

            $table->jsonb('dishes')->nullable()->comment('menu_item ids the rule covers; null = the whole menu');

            $table->jsonb('days')->nullable()->comment('ISO weekdays 1..7; null = every day');
            $table->unsignedSmallInteger('starts_minute')->nullable()->comment('Minutes past midnight, venue clock');
            $table->unsignedSmallInteger('ends_minute')->nullable()->comment('< starts_minute means it crosses midnight');

            /*
             * Where the offer is honoured. The four fulfilment channels an order
             * row can hold, as an array — "dine-in and takeaway but not delivery"
             * is the second most common shape after "everywhere", and a single
             * column could not say it.
             */
            $table->jsonb('channels')->nullable()->comment('dine_in|takeaway|delivery|aggregator; null = all');

            $table->date('starts_on')->nullable();
            $table->date('ends_on')->nullable();

            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('used_count')->default(0);
            $table->bigInteger('revenue_tiyin')->default(0)->comment('Bills the offer touched, at what they settled for');
            $table->bigInteger('discount_tiyin')->default(0)->comment('What the offer gave away, tiyin');

            $table->timestamps();
            $table->softDeletes();

            // "What is live right now", which is every read this table has.
            $table->index(['tenant_id', 'is_active']);
            $table->index(['tenant_id', 'branch_id', 'is_active']);
        });

        /*
         * A promotion is attributed to a bill exactly once.
         *
         * Same shape and same reason as `promo_redemptions_one_per_bill`: a
         * settlement replayed out of an offline queue must not count one lunch
         * twice against one offer, because `used_count` is what the marketer
         * decides to keep it or kill it on.
         */
        Schema::create('crm.promotion_uses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('promotion_id')->constrained('crm.promotions')->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('crm.customers')->nullOnDelete();
            $table->unsignedBigInteger('order_id')->nullable()->comment('Orders lives in another schema; no FK across it');
            $table->bigInteger('discount_tiyin')->default(0);
            $table->bigInteger('total_tiyin')->default(0)->comment('What the bill settled for, tiyin');
            $table->timestamps();

            $table->index(['tenant_id', 'promotion_id']);
        });

        DB::statement(
            'create unique index promotion_uses_one_per_bill'
            .' on crm.promotion_uses (tenant_id, promotion_id, order_id)'
            .' where order_id is not null',
        );

        RowLevelSecurity::guard('crm.promotions', 'crm.promotion_uses');
    }

    public function down(): void
    {
        Schema::dropIfExists('crm.promotion_uses');
        Schema::dropIfExists('crm.promotions');
    }
};
