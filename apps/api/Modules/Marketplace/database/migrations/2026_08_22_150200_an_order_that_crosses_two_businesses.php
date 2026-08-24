<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One order, two owners, and the row has to serve both.
 *
 * A marketplace order is read by two people who must see different things. The
 * merchant sees their own queue and must never see the restaurant next door's —
 * that is `tenant_id` and the policy, exactly as everywhere else. The consumer
 * sees their own history across every restaurant they have ever ordered from —
 * that is `consumer_id`, and it cuts across tenancy by design.
 *
 * So the row is tenanted and the consumer-side reads are cross-tenant and say
 * so in code. `tenant_id` is the STORE's tenant, always, and it is stamped from
 * the store rather than from the request: the consumer placing the order has no
 * tenant of their own, and taking one from a header would let somebody file
 * their order into a restaurant that never received it.
 *
 * ---------------------------------------------------------------------------
 * Why `client_reference` is unique per consumer
 *
 * Every mutating endpoint on this platform carries `Idempotency-Key`, and this
 * one cannot: the middleware stores the key against a tenant, `idempotency_keys`
 * is itself behind row-level security, and a marketplace consumer has no tenant
 * to write. A key claimed with `tenant_id = null` on a fail-closed connection is
 * refused by the policy — the write does not happen and the guest is told the
 * platform is broken.
 *
 * The answer is the same one `finance.payment_invoices` reached for and for the
 * same reason: put the guarantee in the data. The app mints a reference when the
 * basket is created; this index is what makes a second POST return the first
 * order instead of cooking the meal twice. It is stronger than the header, not
 * weaker — it survives the app being killed and reopened, which a per-request
 * key does not — and `IdempotencyCoverageTest` records it as the reason.
 *
 * ---------------------------------------------------------------------------
 * Money, and which of these numbers is whose
 *
 *   subtotal      the food, at market prices — what the guest is buying
 *   discount      a promo code, funded by the platform
 *   service_fee   3% — what the platform charges the GUEST for running it
 *   delivery_fee  the courier; zero for a Plus subscriber
 *   total         what leaves the guest's card
 *
 *   commission    9% of the food — what the platform keeps from the MERCHANT
 *   merchant_due  subtotal − commission — what the settlement pays out
 *
 * Two percentages that are not the same percentage, and the whole reason both
 * are stored rather than derived: a guest who sees one "service" line and knows
 * their restaurant charges no delivery service concludes they are being charged
 * twice, and a merchant reading 9% on one screen and 3% on another concludes the
 * platform is lying. Both are snapshotted at placement, so changing a rate never
 * rewrites what somebody was already owed.
 *
 * ---------------------------------------------------------------------------
 * `bill_id`, and what does NOT happen here
 *
 * When the merchant accepts, a real bill is opened in Orders through
 * `BillRegistry` and fired at the kitchen through `TicketWriter`, on the
 * `aggregator` channel. That is not a compromise: from the restaurant's ledger a
 * MyPOS order IS an aggregator order — somebody else's platform took it,
 * somebody else's courier carries it, no table is occupied, no service charge
 * applies, and the delivery fee belongs to the platform rather than the till.
 * `OrderChannel::Aggregator` documents every one of those properties already.
 *
 * No money moves through `TillLedger` and none should: the guest paid the
 * marketplace, and the restaurant is paid weekly through
 * `marketplace.settlements`. A tender at the till would count the same meal
 * twice — once in the drawer that never opened, once in the payout.
 */
return new class extends Migration
{
    private const ORDERS = 'marketplace.orders';

    private const LINES = 'marketplace.order_lines';

    private const RULE = "current_setting('app.bypass_tenancy', true) = 'on'"
        ." or tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint";

    public function up(): void
    {
        Schema::create(self::ORDERS, function (Blueprint $table): void {
            $table->id();

            // The STORE's restaurant, never the request's. See the docblock.
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->nullOnDelete();

            // Every report on this platform groups by the trading day, never by
            // created_at — DECISIONS Q3. Stamped by HasBusinessDate.
            $table->date('business_date')->nullable();

            $table->string('number', 24)->unique()->comment('MP-8421 — printed on the guest’s screen');

            $table->foreignId('consumer_id')->constrained('marketplace.consumers')->restrictOnDelete();
            $table->foreignId('store_id')->constrained('marketplace.stores')->restrictOnDelete();
            $table->foreignId('courier_id')->nullable()->constrained('marketplace.couriers')->nullOnDelete();

            $table->string('client_reference', 64)->nullable()
                ->comment('The basket id the app minted — what makes a replay one order');

            $table->string('state', 24)->default('placed')
                ->comment('placed|accepted|cooking|ready|courier_assigned|enroute|delivered|cancelled|rejected');

            $table->unsignedBigInteger('subtotal_tiyin')->default(0);
            $table->unsignedBigInteger('discount_tiyin')->default(0);
            $table->unsignedBigInteger('service_fee_tiyin')->default(0);
            $table->unsignedBigInteger('delivery_fee_tiyin')->default(0);
            $table->unsignedBigInteger('total_tiyin')->default(0);

            $table->unsignedBigInteger('commission_tiyin')->default(0);
            $table->unsignedBigInteger('merchant_due_tiyin')->default(0);
            $table->unsignedTinyInteger('commission_percent')->default(9);
            $table->unsignedTinyInteger('service_percent')->default(3);

            $table->string('promo_code', 32)->nullable();

            $table->string('pay_rail', 16)->default('cash')->comment('click | payme | uzum | cash');
            $table->datetime('paid_at')->nullable();

            // Copied onto the order, not joined from the address book: a guest
            // who renames "Uy" next month must not rewrite where last week's
            // courier was sent.
            $table->string('address', 255);
            $table->string('address_note', 255)->nullable();
            $table->integer('latitude_e6')->nullable();
            $table->integer('longitude_e6')->nullable();

            // Orders module id. No foreign key, on purpose — a constraint here
            // is the module boundary being crossed where nothing can see it.
            $table->unsignedBigInteger('bill_id')->nullable();

            $table->unsignedBigInteger('settlement_id')->nullable()
                ->comment('Which payout this order was included in');

            $table->unsignedTinyInteger('rating')->nullable()->comment('1..5, once, after delivery');
            $table->string('rating_comment', 500)->nullable();
            $table->datetime('rated_at')->nullable();

            $table->unsignedSmallInteger('eta_minutes')->nullable();

            /*
             * A stamp per rung rather than one `state_changed_at`.
             *
             * The tracking screen prints five times down the left of the ladder
             * and the merchant's performance screen measures the gap between two
             * of them. A single column answers "when did it last move", which is
             * neither question.
             */
            $table->datetime('placed_at')->nullable();
            $table->datetime('accepted_at')->nullable();
            $table->datetime('cooking_at')->nullable();
            $table->datetime('ready_at')->nullable();
            $table->datetime('courier_assigned_at')->nullable();
            $table->datetime('enroute_at')->nullable();
            $table->datetime('delivered_at')->nullable();
            $table->datetime('cancelled_at')->nullable();

            $table->string('cancel_reason', 255)->nullable();
            $table->string('reject_reason', 255)->nullable();

            $table->timestamps();

            // Convention 7 — an order is never hard-deleted.
            $table->softDeletes();

            // What makes a replayed POST one order. NULLs are distinct in
            // PostgreSQL, so an order placed without a reference never collides.
            $table->unique(['consumer_id', 'client_reference'], 'marketplace_orders_client_reference_unique');

            // The merchant's 90-second queue: one tenant, the new ones, oldest first.
            $table->index(['tenant_id', 'state', 'placed_at']);
            $table->index(['tenant_id', 'store_id', 'business_date']);
            // The consumer's own history, which crosses every tenant there is.
            $table->index(['consumer_id', 'created_at']);
            $table->index(['tenant_id', 'settlement_id']);
        });

        Schema::create(self::LINES, function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('order_id')->constrained('marketplace.orders')->cascadeOnDelete();

            // Menu module id, no foreign key — same reason as `bill_id` above.
            $table->unsignedBigInteger('menu_item_id');

            /*
             * The name is copied, not joined.
             *
             * A dish renamed or withdrawn next month must not change what a
             * guest was shown, what a dispute is about, or what a settlement
             * itemises. This is the same snapshot rule `orders.order_items`
             * follows one module over.
             */
            $table->jsonb('name')->comment('{uz,ru,en} frozen at the moment of ordering');

            $table->unsignedBigInteger('unit_price_tiyin')->comment('Market price: catalogue + markup');
            $table->unsignedSmallInteger('quantity');
            $table->unsignedBigInteger('line_total_tiyin');

            $table->string('note', 255)->nullable();

            $table->timestamps();

            $table->index(['tenant_id', 'order_id']);
        });

        foreach ([self::ORDERS, self::LINES] as $table) {
            DB::statement("alter table {$table} enable row level security");
            DB::statement("alter table {$table} force row level security");
            DB::statement("drop policy if exists tenant_isolation on {$table}");
            DB::statement(
                "create policy tenant_isolation on {$table} for all"
                .' using ('.self::RULE.') with check ('.self::RULE.')',
            );
        }
    }

    public function down(): void
    {
        foreach ([self::LINES, self::ORDERS] as $table) {
            DB::statement("drop policy if exists tenant_isolation on {$table}");
            Schema::dropIfExists($table);
        }
    }
};
