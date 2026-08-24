<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The four columns a review left at the table needs and a review left in the
 * app does not.
 *
 * `crm.feedbacks` was built for a signed-in guest: `customer_id`, `order_id`,
 * a score and a comment. The two surfaces that actually collect most of a
 * restaurant's feedback have none of those to give — the QR rating screen
 * (`(guest)/qr/{restaurant}/{table}/rating`) knows a table and nothing else,
 * and the customer app's problem sheet knows an order *number* off a receipt
 * rather than an internal id.
 *
 *   `table_id`      — which table it happened at. No foreign key: Tables lives
 *                     in another schema and a constraint across it would be a
 *                     module boundary written in DDL, the same shape
 *                     `crm.account_entries` already uses for `order_id`.
 *
 *   `order_number`  — the number printed on the receipt. It travels beside
 *                     `order_id` rather than instead of it because a guest can
 *                     read it and an id is not on anything they are holding.
 *
 *   `guest_name`,
 *   `guest_phone`   — so a manager can ring back about the one-star. Nullable,
 *                     and left null by every review that did not offer them: a
 *                     complaint form that demands a phone number collects
 *                     fewer complaints, which reads as a better week.
 *
 * The phone is indexed with the tenant because the first thing a manager does
 * with an angry review is look for the rest of that guest's history.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('crm.feedbacks', function (Blueprint $table): void {
            $table->unsignedBigInteger('table_id')->nullable()->after('order_id')
                ->comment('tables.tables — no FK across module schemas');
            $table->string('order_number', 32)->nullable()->after('table_id')
                ->comment('What is printed on the receipt; the id is not');
            $table->string('guest_name', 120)->nullable()->after('order_number');
            $table->string('guest_phone', 24)->nullable()->after('guest_name');

            $table->index(['tenant_id', 'guest_phone']);
        });
    }

    public function down(): void
    {
        Schema::table('crm.feedbacks', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'guest_phone']);
            $table->dropColumn(['table_id', 'order_number', 'guest_name', 'guest_phone']);
        });
    }
};
