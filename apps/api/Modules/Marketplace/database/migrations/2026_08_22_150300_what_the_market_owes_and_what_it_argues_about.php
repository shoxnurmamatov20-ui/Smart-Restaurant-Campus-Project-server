<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The three back-office tables of the merchant panel: payouts, complaints, ads.
 *
 * ---------------------------------------------------------------------------
 * Settlements
 *
 * The marketplace takes the guest's money and owes the restaurant most of it a
 * week later. That gap is the single most trust-sensitive thing this module
 * does, so a settlement is a ROW rather than a report: it is issued once, it
 * carries an invoice number a merchant can quote on the phone, and the figures
 * in it are frozen. Recomputing a payout from live orders would mean a refund
 * granted on Friday silently changing what Monday's statement said.
 *
 * `orders.settlement_id` is the join back, and it is what makes "which orders
 * am I being paid for" answerable — the question every merchant asks first.
 *
 * ---------------------------------------------------------------------------
 * Disputes
 *
 * Four kinds, and two of them settle themselves: a delivery more than half an
 * hour late refunds its own fee, and a missing item under twenty thousand is
 * refunded without a photograph. That is `automatic`, and it is a column rather
 * than a rule in code because it decides whether the merchant is being told or
 * being asked — a different screen and a different clock.
 *
 * `deadline_at` is that clock. A complaint the merchant never answers has to
 * resolve in the guest's favour on its own, or "we are looking into it" becomes
 * the answer forever.
 *
 * ---------------------------------------------------------------------------
 * Promotions
 *
 * A merchant's own offer, with a budget that runs down. `spent_tiyin` is
 * incremented as orders use it rather than derived, for the same reason a
 * settlement is frozen: an offer whose remaining budget changes when an old
 * order is refunded is an offer nobody can plan against.
 */
return new class extends Migration
{
    private const SETTLEMENTS = 'marketplace.settlements';

    private const DISPUTES = 'marketplace.disputes';

    private const PROMOTIONS = 'marketplace.promotions';

    private const RULE = "current_setting('app.bypass_tenancy', true) = 'on'"
        ." or tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint";

    public function up(): void
    {
        Schema::create(self::SETTLEMENTS, function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained('marketplace.stores')->cascadeOnDelete();

            $table->string('invoice_number', 32)->comment('MP-INV-2026-0833 — what a merchant quotes');

            $table->date('period_start');
            $table->date('period_end');

            $table->unsignedInteger('orders_count')->default(0);
            $table->unsignedBigInteger('gross_tiyin')->default(0)->comment('Food sold, at market prices');
            $table->unsignedBigInteger('commission_tiyin')->default(0);
            $table->unsignedBigInteger('adjustments_tiyin')->default(0)
                ->comment('Refunds and dispute credits, subtracted');
            $table->unsignedBigInteger('payable_tiyin')->default(0);

            $table->string('state', 12)->default('due')->comment('due | paid');
            $table->datetime('paid_at')->nullable();
            $table->string('payment_reference', 64)->nullable();

            $table->timestamps();

            // One statement per storefront per week. Issued once, quoted forever.
            $table->unique(['tenant_id', 'store_id', 'period_start'], 'marketplace_settlements_period_unique');
            $table->unique(['tenant_id', 'invoice_number'], 'marketplace_settlements_invoice_unique');
            $table->index(['tenant_id', 'state', 'period_start']);
        });

        Schema::create(self::DISPUTES, function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('order_id')->constrained('marketplace.orders')->cascadeOnDelete();

            // Not a foreign key across to `consumers`: the complaint outlives an
            // account that closes, and a settlement six months later still has
            // to itemise the credit it caused.
            $table->unsignedBigInteger('consumer_id');

            $table->string('kind', 16)->comment('late | missing | cold | wrong');
            $table->unsignedBigInteger('amount_tiyin')->default(0)->comment('What is being asked for');

            $table->text('body')->nullable()->comment("The guest's own words");
            $table->boolean('automatic')->default(false)
                ->comment('Settled by rule, not by the merchant answering');

            $table->string('state', 16)->default('open')
                ->comment('open | accepted | contested | resolved');
            $table->string('resolution', 255)->nullable();

            $table->datetime('deadline_at')->nullable()->comment('When silence becomes a refund');
            $table->datetime('resolved_at')->nullable();

            $table->timestamps();

            // One complaint per order. A guest with a second problem adds to the
            // first rather than opening a race between two refunds.
            $table->unique(['tenant_id', 'order_id'], 'marketplace_disputes_order_unique');
            $table->index(['tenant_id', 'state', 'deadline_at']);
        });

        Schema::create(self::PROMOTIONS, function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained('marketplace.stores')->cascadeOnDelete();

            $table->string('code', 32)->nullable()->comment('OSH2026 — null for an offer with no code');
            $table->jsonb('title');
            $table->jsonb('body')->nullable();

            $table->string('kind', 20)->default('discount')
                ->comment('discount | free_delivery | ad_slot');
            $table->string('state', 16)->default('scheduled')
                ->comment('running | scheduled | ended | paused | cancelled');

            $table->unsignedBigInteger('discount_tiyin')->default(0);
            $table->unsignedBigInteger('budget_tiyin')->default(0);
            $table->unsignedBigInteger('spent_tiyin')->default(0);

            $table->date('starts_on')->nullable();
            $table->date('ends_on')->nullable();

            $table->timestamps();

            // A code is typed by a guest, so it has to be unambiguous across the
            // whole marketplace rather than only inside one restaurant.
            $table->unique('code');
            $table->index(['tenant_id', 'store_id', 'state']);
        });

        foreach ([self::SETTLEMENTS, self::DISPUTES, self::PROMOTIONS] as $table) {
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
        foreach ([self::PROMOTIONS, self::DISPUTES, self::SETTLEMENTS] as $table) {
            DB::statement("drop policy if exists tenant_isolation on {$table}");
            Schema::dropIfExists($table);
        }
    }
};
