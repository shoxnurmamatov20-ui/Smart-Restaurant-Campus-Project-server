<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * `OSH15` in a text field, and everything that has to be true for it to work.
 *
 * The customer app has been deciding this in the browser. `PROMO_CODES` in
 * `packages/surfaces/src/customer/data.ts` is a map of three codes to three
 * percentages, and its own docblock says what that is for: "A real code is
 * validated by the server against the tenant's campaign — a client that decides
 * its own discount decides its own price." This is that server side.
 *
 * ---------------------------------------------------------------------------
 * Two tables, because a code has a budget
 *
 * `promo_codes` is the campaign. `promo_redemptions` is who used it, and it is
 * not bookkeeping — it is the only way `max_uses` and `per_customer_limit` can
 * mean anything. A counter column alone answers "how many" and never "which
 * ones", so a restaurant querying a campaign that went wrong has a number and
 * no way to find the orders behind it.
 *
 * `used_count` is kept anyway, denormalised on purpose: the check runs on every
 * keystroke in the promo field of a cart, and counting a redemptions table per
 * keystroke is a table scan per keystroke on the busiest write path this module
 * has.
 *
 * ---------------------------------------------------------------------------
 * Percent and fixed, never a float either way
 *
 * `kind = percent` stores whole percents (`15`), `kind = fixed` stores tiyin.
 * One integer column serves both because the platform's first rule is that no
 * money is a float, and `0.15` in a money path is exactly the thing that rule
 * exists to keep out. `pricing.ts` takes a percent discount through
 * `percentOf()`, which is integer arithmetic the server's calculator matches
 * line for line.
 *
 * ---------------------------------------------------------------------------
 * The code is unique per restaurant, case-folded
 *
 * `OSH15`, `osh15` and `Osh15` are one campaign — a guest reading a code off a
 * poster types whichever their keyboard offers. The column stores upper case and
 * the unique index is on `(tenant_id, code)`, which also says the other half:
 * two restaurants may both run `OSH15`, and neither may redeem the other's.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm.promo_codes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            $table->string('code', 32)->comment('Stored upper case; matched case-insensitively');
            $table->jsonb('title')->nullable()->comment('{uz,ru,en} — what the guest sees on the receipt line');

            $table->string('kind', 16)->default('percent')->comment('percent|fixed');
            $table->integer('value')->comment('Whole percents when kind=percent, tiyin when kind=fixed');
            $table->bigInteger('min_tiyin')->default(0)->comment('Basket floor before the code applies');

            /*
             * A ceiling on a percentage discount, in tiyin.
             *
             * "20% off" on a 4 000 000 so'm corporate order is not what anybody
             * meant by a lunch promotion, and the campaign that discovers this
             * discovers it once. Nullable because most campaigns do not need it.
             */
            $table->bigInteger('max_discount_tiyin')->nullable();

            $table->datetime('starts_at')->nullable();
            $table->datetime('ends_at')->nullable();

            $table->unsignedInteger('max_uses')->nullable()->comment('null = unlimited');
            $table->unsignedInteger('used_count')->default(0);
            $table->unsignedInteger('per_customer_limit')->default(1)->comment('0 = unlimited');

            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'is_active']);
        });

        DB::statement(
            'create unique index promo_codes_one_per_restaurant'
            .' on crm.promo_codes (tenant_id, code) where deleted_at is null',
        );

        Schema::create('crm.promo_redemptions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('promo_code_id')->constrained('crm.promo_codes')->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('crm.customers')->nullOnDelete();

            /*
             * The bill, with no foreign key — Orders lives in another schema and
             * a constraint across it would be a module boundary written in DDL.
             * The same shape `crm.account_entries` already uses.
             */
            $table->unsignedBigInteger('order_id')->nullable();
            $table->bigInteger('discount_tiyin')->comment('What the guest actually saved, tiyin');
            $table->timestamps();

            // "Has this guest used this code before" — the per-customer limit.
            $table->index(['tenant_id', 'promo_code_id', 'customer_id']);
        });

        /*
         * One redemption per bill, so a settlement retried out of an offline
         * queue does not spend a campaign twice. Partial because a redemption
         * with no order is a check that never became a sale.
         */
        DB::statement(
            'create unique index promo_redemptions_one_per_bill'
            .' on crm.promo_redemptions (tenant_id, promo_code_id, order_id)'
            .' where order_id is not null',
        );

        RowLevelSecurity::guard('crm.promo_codes', 'crm.promo_redemptions');
    }

    public function down(): void
    {
        Schema::dropIfExists('crm.promo_redemptions');
        Schema::dropIfExists('crm.promo_codes');
    }
};
