<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The loyalty shelf — what a guest may spend their points on.
 *
 * `COUPONS` in `packages/surfaces/src/customer/data.ts` draws three of these
 * and the loyalty screen has been listing them since it was built. What it
 * could not do is take one: the button had nothing to call, so a balance of
 * 2 480 points was a number with no verb attached to it.
 *
 * ---------------------------------------------------------------------------
 * Two tables, and the second is the one that holds the money
 *
 * `coupons` is the shelf: one row per offer, per restaurant. `coupon_reservations`
 * is a guest holding one, and it is where the points went. The split matters
 * because the shelf is edited by a marketer and the reservation is a receipt —
 * a marketer lowering a coupon's price must not change what somebody already
 * paid for theirs, which is why `points_spent` is copied onto the reservation
 * rather than read back through the coupon.
 *
 * ---------------------------------------------------------------------------
 * One live reservation per guest per coupon, enforced by PostgreSQL
 *
 * This is the whole reason the index below exists. Reserving costs points, the
 * button is on a phone, and a phone on one bar sends the request twice — so
 * without it, a double tap is a guest charged twice for one coupon and a support
 * conversation the restaurant cannot win. The application checks first; the
 * index is what makes the check true under a retry.
 *
 * Partial on `redeemed_at is null`: a guest who used last month's free delivery
 * may buy another one, and a unique index over all history would refuse them
 * forever.
 *
 * ---------------------------------------------------------------------------
 * `code` is what the guest actually holds
 *
 * Not the coupon's id. A reservation is personal, single-use, and travels to the
 * cart as a string exactly like a promo code does, so the two paths through
 * checkout stay one path. Unique per restaurant so it can be looked up by
 * itself.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm.coupons', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            $table->string('key', 40)->comment('Stable id the design names: pickup-5, free-delivery');
            $table->jsonb('name')->comment('{uz,ru,en}');
            $table->jsonb('note')->nullable()->comment('{uz,ru,en} — the condition line under the name');

            /*
             * What it costs, in loyalty points.
             *
             * Zero is legal and means an offer the restaurant simply gives away
             * — a birthday coupon, a "sorry about tonight" from a manager. The
             * reserve endpoint still writes a reservation for those, because the
             * guest still has to be holding one before it can be redeemed.
             */
            $table->unsignedInteger('points_cost')->default(0);

            $table->string('kind', 16)->default('percent')->comment('percent|fixed|free_delivery');
            $table->integer('value')->default(0)->comment('Whole percents when kind=percent, tiyin when kind=fixed');
            $table->bigInteger('min_tiyin')->default(0);

            /*
             * The rail colour down the left edge — one of the design's four
             * accents. A presentation concern in a database table, and it is
             * here deliberately: a marketer adding a fourth coupon decides how
             * it looks, and the alternative is a hard-coded map in three
             * client apps that has to grow every time they do.
             */
            $table->string('tone', 16)->default('accent')->comment('accent|brand|warning');

            $table->datetime('starts_at')->nullable();
            $table->datetime('ends_at')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'is_active', 'sort_order']);
        });

        DB::statement(
            'create unique index coupons_one_key_per_restaurant'
            .' on crm.coupons (tenant_id, key) where deleted_at is null',
        );

        Schema::create('crm.coupon_reservations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('coupon_id')->constrained('crm.coupons')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('crm.customers')->cascadeOnDelete();

            $table->string('code', 24)->comment('What the guest holds and types at checkout');
            $table->unsignedInteger('points_spent')->comment('Copied, not read back — the shelf price may change');
            $table->datetime('expires_at')->nullable();
            $table->datetime('redeemed_at')->nullable();
            $table->unsignedBigInteger('order_id')->nullable()->comment('Set when it is actually used; no FK across schemas');
            $table->timestamps();

            $table->index(['tenant_id', 'customer_id', 'id']);
        });

        DB::statement(
            'create unique index coupon_reservations_code'
            .' on crm.coupon_reservations (tenant_id, code)',
        );

        DB::statement(
            'create unique index coupon_reservations_one_live_per_guest'
            .' on crm.coupon_reservations (tenant_id, coupon_id, customer_id)'
            .' where redeemed_at is null',
        );

        RowLevelSecurity::guard('crm.coupons', 'crm.coupon_reservations');
    }

    public function down(): void
    {
        Schema::dropIfExists('crm.coupon_reservations');
        Schema::dropIfExists('crm.coupons');
    }
};
