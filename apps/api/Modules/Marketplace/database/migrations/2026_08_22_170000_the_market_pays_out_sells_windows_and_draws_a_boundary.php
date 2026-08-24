<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The four things a marketplace needs before it can actually trade.
 *
 * Everything created in August let a guest order and a merchant cook. What was
 * missing is the commercial half — where the money is sent, what the platform
 * sells besides commission, how far a courier will ride, and what a customer
 * pays for a subscription. Each is a table here.
 *
 * ---------------------------------------------------------------------------
 * `stores.payout` — where a week's takings land
 *
 * A jsonb blob and NOT a set of columns, because the shape is a country's
 * banking convention rather than the platform's: an Uzbek payout needs an MFO
 * and a 20-digit account, a Kazakh one an IBAN and a BIN, and a second country
 * must not be a migration on every merchant's row. What IS a column is
 * `payout_state`, because the platform reviews a queue of them and a queue read
 * out of a jsonb key cannot use an index.
 *
 * There is deliberately no card number anywhere in it. A weekly payout goes to
 * a business account; a card PAN stored here would put this platform inside PCI
 * scope for a field nobody asked for.
 *
 * The state resets to `pending_review` on every write — see `Store::savePayout()`
 * — because an account that decides where a week's takings land is exactly the
 * field an attacker with a stolen session would change, and "verified" has to
 * mean a human looked at it after the last edit rather than before some earlier
 * one.
 *
 * ---------------------------------------------------------------------------
 * `placements` — the banner a merchant buys
 *
 * The one thing on the platform sold by the DAY rather than by the order, which
 * is why it has a table rather than a `Promotion` of kind `ad_slot`. A promotion
 * spends a budget as orders use a code; a placement is booked for a slot on a
 * date, is queued when somebody else has it, and is billed whether or not
 * anybody clicks. Those are different objects and folding them together makes
 * `spent_tiyin` mean two things.
 *
 * `settlement_id` is stamped by `marketplace:settle` for the same reason it is
 * stamped on an order: the weekly statement subtracts what the merchant bought
 * from what they earned, and a day billed twice is a day the merchant argues
 * about.
 *
 * ---------------------------------------------------------------------------
 * `delivery_zones` — a circle, not a polygon
 *
 * A drawn area is the honest shape of a delivery zone and drawing one needs a
 * basemap, a geocoder and a spatial store. None of those is in this build, so
 * the boundary is a centre and a radius — right in the middle, wrong at the
 * edges, and the edges are where a courier rings to say they cannot find the
 * block. `radius_m` in metres so no float is stored; the API talks in kilometres
 * because that is what a person types.
 *
 * ---------------------------------------------------------------------------
 * `subscriptions` — MyPOS Plus
 *
 * The FOURTH tenant-free table in this module, and the paragraph
 * `ModuleBoundaryTest` demands for one: a subscription belongs to a CONSUMER,
 * and a consumer belongs to the platform rather than to any restaurant on it.
 * Stamping it with a restaurant would mean a guest who subscribed after ordering
 * plov had free delivery from that one shop and paid full price at the other
 * thirty-nine — which is the opposite of what the subscription is sold as.
 *
 * `consumers.plus_until` stays where it is and remains the fast answer the
 * checkout reads. This table is the history behind it: when it started, what was
 * charged, which invoice paid for it, and when somebody cancelled. A checkout
 * that had to join a subscription table to price a delivery fee would be a join
 * on the hottest path in the module.
 */
return new class extends Migration
{
    private const STORES = 'marketplace.stores';

    private const CONSUMERS = 'marketplace.consumers';

    private const PLACEMENTS = 'marketplace.placements';

    private const ZONES = 'marketplace.delivery_zones';

    private const SUBSCRIPTIONS = 'marketplace.subscriptions';

    private const RULE = "current_setting('app.bypass_tenancy', true) = 'on'"
        ." or tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint";

    public function up(): void
    {
        Schema::table(self::STORES, function (Blueprint $table): void {
            $table->jsonb('payout')->nullable()
                ->comment('Bank details for the weekly payout. Never a card number.');

            // A column rather than a jsonb key: the platform reads a review
            // queue off this, and `payout->>'state'` cannot use an index.
            $table->string('payout_state', 16)->nullable()
                ->comment('incomplete | pending_review | verified');
            $table->datetime('payout_verified_at')->nullable();

            /*
             * Which of the platform's messages this shop wants.
             *
             * jsonb rather than five booleans because the list grows with the
             * product — a sixth kind of notice must not be a migration on every
             * storefront — and because a missing key is a sensible default,
             * which a NOT NULL boolean column cannot express.
             */
            $table->jsonb('notification_prefs')->nullable();

            $table->index(['payout_state', 'tenant_id'], 'marketplace_stores_payout_review_index');
        });

        Schema::table(self::CONSUMERS, function (Blueprint $table): void {
            // The guest's own half of the same switch.
            $table->jsonb('notification_prefs')->nullable();
        });

        Schema::create(self::PLACEMENTS, function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained('marketplace.stores')->cascadeOnDelete();

            $table->string('slot', 24)->comment('home_top | category_top');

            $table->date('starts_on');
            $table->date('ends_on');
            $table->unsignedSmallInteger('days');

            /*
             * The rate is snapshotted on the row, like a store's commission is
             * snapshotted on an order. A platform that raises the price of the
             * home banner in March must not change what a merchant was charged
             * in February — and a merchant who can no longer reproduce last
             * month's invoice stops trusting all of them.
             */
            $table->unsignedBigInteger('day_rate_tiyin');
            $table->unsignedBigInteger('total_tiyin');

            // What has actually been taken so far. A placement is billed by the
            // day inside `marketplace:settle`, so a banner cancelled on
            // Wednesday costs three days rather than seven.
            $table->unsignedBigInteger('billed_tiyin')->default(0);

            $table->string('state', 16)->default('booked')
                ->comment('booked | running | finished | cancelled');

            $table->unsignedBigInteger('settlement_id')->nullable()
                ->comment('Stamped when a weekly statement has charged for it');

            $table->timestamps();

            /*
             * One shop, one slot, one start date. Not a unique on
             * `(slot, starts_on)` across the platform — that is the QUEUE, and a
             * queue is a fact about a date rather than a constraint on a row:
             * two merchants may both hold Friday, one of them second in line,
             * and the controller works out which by counting.
             */
            $table->unique(['tenant_id', 'store_id', 'slot', 'starts_on'], 'marketplace_placements_booking_unique');
            $table->index(['slot', 'starts_on', 'ends_on'], 'marketplace_placements_slot_index');
            $table->index(['tenant_id', 'state']);
        });

        Schema::create(self::ZONES, function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained('marketplace.stores')->cascadeOnDelete();

            $table->string('label', 60)->comment("The merchant's own word: Markaz, Chilonzor");

            // Metres, so no float is stored. The API talks in kilometres.
            $table->unsignedInteger('radius_m');

            // Microdegrees, the same unit `stores` uses for its own position.
            $table->integer('latitude_e6');
            $table->integer('longitude_e6');

            /*
             * A zone may charge its own fee and set its own minimum, and both
             * fall back to the storefront's when they are null. A ring three
             * kilometres out costs more to serve than the block outside the
             * door, and a platform that could not express that would have every
             * merchant draw one small circle instead.
             */
            $table->unsignedBigInteger('fee_tiyin')->nullable();
            $table->unsignedBigInteger('min_order_tiyin')->nullable();

            $table->unsignedSmallInteger('sort_order')->default(0);

            $table->timestamps();

            $table->index(['tenant_id', 'store_id', 'sort_order']);
        });

        Schema::create(self::SUBSCRIPTIONS, function (Blueprint $table): void {
            $table->id();

            // No tenant_id. See the docblock — this belongs to the platform's
            // customer, not to a restaurant.
            $table->foreignId('consumer_id')->constrained('marketplace.consumers')->cascadeOnDelete();

            $table->string('plan', 24)->default('plus')->comment('The only plan today; a column so the second is not a migration');
            $table->string('state', 16)->default('active')->comment('active | cancelled | lapsed');

            $table->unsignedBigInteger('monthly_tiyin');

            $table->datetime('started_at');
            $table->datetime('renews_at')->comment('When the next invoice is due — see the command that raises it');
            $table->datetime('cancelled_at')->nullable();

            /*
             * The handle Finance minted for the month currently paid for.
             *
             * A token rather than a provider reference: the provider's own id
             * lives on `finance.payment_invoices`, and a subscription that
             * stored it would be a second place to look when a card is charged
             * twice.
             */
            $table->string('payment_token', 64)->nullable();
            $table->string('pay_rail', 16)->nullable()->comment('click | payme | uzum');

            $table->timestamps();

            /*
             * One live subscription per person, enforced rather than checked.
             *
             * A partial unique index: cancelled and lapsed rows stay for the
             * history, and a guest who subscribes, cancels and subscribes again
             * has three rows and one active one. A plain unique on `consumer_id`
             * would make the second subscription impossible.
             */
            $table->index(['consumer_id', 'state']);
        });

        DB::statement(
            'create unique index marketplace_subscriptions_one_live'
            .' on '.self::SUBSCRIPTIONS.' (consumer_id)'
            ." where state = 'active'",
        );

        foreach ([self::PLACEMENTS, self::ZONES] as $table) {
            $this->guard($table);
        }
    }

    public function down(): void
    {
        DB::statement('drop index if exists marketplace.marketplace_subscriptions_one_live');
        Schema::dropIfExists(self::SUBSCRIPTIONS);

        foreach ([self::ZONES, self::PLACEMENTS] as $table) {
            DB::statement("drop policy if exists tenant_isolation on {$table}");
            Schema::dropIfExists($table);
        }

        Schema::table(self::CONSUMERS, function (Blueprint $table): void {
            $table->dropColumn('notification_prefs');
        });

        Schema::table(self::STORES, function (Blueprint $table): void {
            $table->dropIndex('marketplace_stores_payout_review_index');
            $table->dropColumn(['payout', 'payout_state', 'payout_verified_at', 'notification_prefs']);
        });
    }

    /**
     * Enable, force, and the tenant policy — the same four statements every
     * table carrying `tenant_id` on this platform arms itself with.
     * `RowLevelSecurityTest` fails on any that does not.
     */
    private function guard(string $table): void
    {
        DB::statement("alter table {$table} enable row level security");
        DB::statement("alter table {$table} force row level security");
        DB::statement("drop policy if exists tenant_isolation on {$table}");
        DB::statement(
            "create policy tenant_isolation on {$table} for all"
            .' using ('.self::RULE.') with check ('.self::RULE.')',
        );
    }
};
