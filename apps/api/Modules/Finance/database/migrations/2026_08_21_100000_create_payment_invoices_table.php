<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * An attempt to pay a bill through somebody else's rails.
 *
 * Not a payment. `finance.payments` is money the restaurant HAS; this is a
 * conversation with Payme, Click or Uzum that may end in one and very often
 * does not — a guest opens the app, sees the amount, and closes it. Folding the
 * two together would put those abandoned attempts into the day's takings, which
 * is the one number this module exists to keep true.
 *
 * The relationship is one payment per invoice at most, and it is written the
 * moment the provider confirms. `payment_id` is the join, nullable for as long
 * as the guest is still deciding.
 *
 * ---------------------------------------------------------------------------
 * Why there is a token as well as an id
 *
 * `id` is a counter. A stranger who paid once knows roughly where the sequence
 * is and can poll the next hundred values to read other people's order numbers
 * and amounts — on an endpoint that, by definition, has no login. `token` is 32
 * random hex characters, it is what the status endpoint and the return URL
 * carry, and the id never leaves the server.
 *
 * ---------------------------------------------------------------------------
 * The two unique constraints, and the failure each one prevents
 *
 * `(tenant_id, provider, provider_invoice_id)` is what makes a callback
 * idempotent. Payme retries PerformTransaction until it gets a clean answer,
 * and without this a flaky minute becomes two tenders for one meal. The header
 * key that normally does this job cannot: a provider does not send one, which
 * is exactly why these routes are exempt from EnsureIdempotency.
 *
 * `(tenant_id, order_id, state)` is deliberately NOT unique. A guest whose card
 * is declined tries again, and refusing the second attempt would leave them
 * with a bill they cannot pay and a screen that says nothing.
 */
return new class extends Migration
{
    private const TABLE = 'finance.payment_invoices';

    private const RULE = "current_setting('app.bypass_tenancy', true) = 'on'"
        ." or tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint";

    public function up(): void
    {
        Schema::create(self::TABLE, function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            // Every report groups by the trading day, never by created_at —
            // DECISIONS Q3. Stamped on the way in by HasBusinessDate.
            $table->date('business_date')->nullable();

            // An online order is still placed at an address: a delivery leaves
            // one kitchen, and its takings belong to that venue's day.
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->nullOnDelete();

            $table->string('token', 40)->comment('Opaque public handle — never the row id');
            $table->string('provider', 16)->comment('payme | click | uzum | sandbox');

            $table->unsignedBigInteger('order_id')->nullable()->comment('Orders module id, no FK on purpose');
            $table->string('order_number', 24)->nullable();

            $table->unsignedBigInteger('amount')->comment('Amount in tiyin (1 UZS = 100 tiyin)');
            $table->string('state', 16)->default('pending')
                ->comment('pending | paid | cancelled | failed | expired');

            $table->string('provider_invoice_id', 64)->nullable()
                ->comment("The provider's own transaction id, once it has issued one");
            $table->string('pay_url', 500);
            $table->string('return_url', 500)->nullable();

            /*
             * The payment this invoice became. Nullable for the whole life of an
             * attempt that never completes, which is most of them.
             *
             * No foreign key, and that is on purpose: payments are soft-deleted
             * and never hard-deleted, so a constraint would add a lock to every
             * settlement to enforce something that already cannot happen.
             */
            $table->unsignedBigInteger('payment_id')->nullable();

            // Payme reserves before it performs — CreateTransaction, then
            // PerformTransaction, sometimes twelve hours apart. A guest looking
            // at a "waiting" screen deserves to know which of the two it is in.
            $table->datetime('reserved_at')->nullable();
            $table->datetime('paid_at')->nullable();
            $table->datetime('cancelled_at')->nullable();
            $table->string('cancel_reason', 255)->nullable();
            $table->string('last_error', 255)->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'token']);
            // What makes a retried callback land on the same row rather than a
            // second one. Postgres treats NULLs as distinct, so the rows that
            // have not been given a provider id yet do not collide.
            $table->unique(['tenant_id', 'provider', 'provider_invoice_id'], 'payment_invoices_provider_tx_unique');
            $table->index(['tenant_id', 'order_id']);
            $table->index(['tenant_id', 'state', 'created_at']);
            $table->index(['tenant_id', 'branch_id', 'business_date']);
        });

        // Row-level security, because the migration that armed the other forty
        // tables ran before this one existed and will not run again.
        // RowLevelSecurityTest fails on any table carrying tenant_id without it.
        DB::statement('alter table '.self::TABLE.' enable row level security');
        DB::statement('alter table '.self::TABLE.' force row level security');
        DB::statement('drop policy if exists tenant_isolation on '.self::TABLE);
        DB::statement(
            'create policy tenant_isolation on '.self::TABLE.' for all'
            .' using ('.self::RULE.') with check ('.self::RULE.')',
        );
    }

    public function down(): void
    {
        DB::statement('drop policy if exists tenant_isolation on '.self::TABLE);
        Schema::dropIfExists(self::TABLE);
    }
};
