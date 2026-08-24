<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The marketing composer's other half: somewhere for a campaign to live.
 *
 * `marketing-panels.tsx` estimated a cost while the marketer typed and then had
 * nowhere to send anything, and its own comment named the reason: `crm` holds
 * customers, loyalty, feedback, leads, promo codes and redemptions, and no
 * campaign. The composer was "a calculator that runs while you type".
 *
 * ---------------------------------------------------------------------------
 * Two tables, because the estimate has to be reconcilable
 *
 * `campaigns` is the decision — who, what, when. `campaign_deliveries` is one
 * row per person, and it is not bookkeeping: it is the only thing that turns
 * the composer's estimate into a fact. The screen prints "taxminiy xarajat"
 * before the send; an estimate nobody ever checks against the invoice is a
 * number a marketer stops trusting by the third month, and the difference
 * between the two is always the same thing — parts. A body that gained one
 * Cyrillic character between drafting and sending doubled the bill.
 *
 * So `parts` and `cost_tiyin` are stored per delivery, from what the gateway
 * was actually asked to send, and the campaign's own `cost_tiyin` is their sum
 * rather than the estimate. `estimated_cost_tiyin` is kept beside it precisely
 * so the two can be compared.
 *
 * ---------------------------------------------------------------------------
 * Why the recipient list is frozen at send time
 *
 * A delivery row carries `phone` as well as `customer_id`. Copied, not joined,
 * and deliberately: a guest changes their number, and a campaign report that
 * joined live would afterwards claim the message went to a number it never went
 * to. The same reason a receipt stores the price it charged rather than the
 * price the dish has now.
 *
 * ---------------------------------------------------------------------------
 * `status` is the ladder, and `sending` is a real rung
 *
 * `draft → scheduled → sending → sent`, with `failed` off the side. `sending`
 * exists because dispatch is one queued job per recipient — two thousand
 * messages is two thousand jobs — and a campaign that showed `scheduled` for
 * the twenty minutes that takes is a campaign somebody presses send on twice.
 * The unique index on `(campaign_id, customer_id)` is the belt under that: the
 * second press writes nothing.
 *
 * ---------------------------------------------------------------------------
 * What is outside
 *
 * The gateway. `App\Contracts\Messaging\SmsSender` already exists with a log
 * driver for a laptop and an Eskiz driver for production, so the code here is
 * complete and what is missing is an account — `SMS_ESKIZ_EMAIL`, one key.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm.campaigns', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * A campaign belongs to the business, not to a venue. One restaurant
             * with four branches sends one message to one guest — the guest has
             * one phone, and four branches each sending "we miss you" is how a
             * marketing list unsubscribes itself.
             */
            $table->string('name', 160);
            $table->text('body')->comment('The message as it will be sent. Not translated: one segment, one language.');

            /*
             * Which guests. A segment name rather than a saved query: the four
             * the console draws are `crm.customers.segment` values plus `all`,
             * and a stored query language is a second thing to keep correct on
             * the day the segmentation rules change.
             */
            $table->string('segment', 32)->default('all');

            $table->string('status', 16)->default('draft')->comment('draft|scheduled|sending|sent|failed');
            $table->datetime('scheduled_for')->nullable()->comment('null = send on the press');
            $table->datetime('started_at')->nullable();
            $table->datetime('finished_at')->nullable();

            /*
             * The three counters the console's table draws, and one it does not.
             *
             * Denormalised rather than counted from the deliveries table, for the
             * read they serve: the campaigns tab lists every campaign a restaurant
             * has ever run, and counting two thousand delivery rows per listed row
             * is a scan per row on a screen that opens with all of them on it.
             */
            $table->unsignedInteger('recipients')->default(0);
            $table->unsignedInteger('delivered')->default(0);
            $table->unsignedInteger('failed')->default(0);

            $table->bigInteger('estimated_cost_tiyin')->default(0)->comment('What the composer said before the send');
            $table->bigInteger('cost_tiyin')->default(0)->comment('The sum of what was actually charged, tiyin');

            /*
             * Attribution. Nullable because it is only knowable when the campaign
             * carries a promo code — "who came in because of the message" is
             * otherwise a guess, and a guess printed next to a real cost is how a
             * campaign is judged on a number nobody can defend.
             */
            $table->foreignId('promo_code_id')->nullable()->constrained('crm.promo_codes')->nullOnDelete();
            $table->unsignedInteger('redeemed')->default(0);
            $table->bigInteger('revenue_tiyin')->default(0);

            $table->foreignId('created_by_user_id')->nullable()->constrained('public.users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'scheduled_for']);
        });

        Schema::create('crm.campaign_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('campaign_id')->constrained('crm.campaigns')->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('crm.customers')->nullOnDelete();

            $table->string('phone', 32)->comment('E.164, as it was at send time — not joined live');
            $table->string('status', 16)->default('queued')->comment('queued|sent|failed');

            /*
             * The gateway's own id, and the only thing that makes a support
             * conversation possible three days later: "we sent it at 19:42" is
             * not something a mobile operator can look anything up by.
             */
            $table->string('reference', 64)->nullable();
            $table->string('reason', 120)->nullable()->comment('Why it was refused. Never the message body.');

            $table->unsignedSmallInteger('parts')->default(1)->comment('SMS parts actually billed');
            $table->bigInteger('cost_tiyin')->default(0);
            $table->datetime('sent_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'campaign_id', 'status']);
        });

        /*
         * One message per guest per campaign.
         *
         * The belt under a double press of "send" and under a queue that
         * redelivers: the second insert loses. Partial on `customer_id is not
         * null` because a delivery aimed at a bare number — a list imported from
         * elsewhere — has no guest to be unique against.
         */
        DB::statement(
            'create unique index campaign_deliveries_one_per_guest'
            .' on crm.campaign_deliveries (campaign_id, customer_id)'
            .' where customer_id is not null',
        );

        RowLevelSecurity::guard('crm.campaigns', 'crm.campaign_deliveries');
    }

    public function down(): void
    {
        Schema::dropIfExists('crm.campaign_deliveries');
        Schema::dropIfExists('crm.campaigns');
    }
};
