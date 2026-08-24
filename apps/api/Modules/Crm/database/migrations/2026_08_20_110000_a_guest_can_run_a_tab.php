<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The two numbers a tab is made of: what the guest owes, and how far they may go.
 *
 * P13. A regular signs for lunch and walks out — the meal was sold, no money
 * arrived, and until now the platform had nowhere to say so. What restaurants do
 * instead is a notebook by the till or a spreadsheet on the accountant's laptop,
 * which is the thing this plan exists to stop.
 *
 * ---------------------------------------------------------------------------
 * On the customer rather than in an accounts table
 *
 * Same argument the loyalty balance already won: one restaurant, one guest, one
 * tab. A separate `crm.customer_accounts` row would be a second table with a
 * one-to-one relationship to this one, and every read of a guest at the till
 * needs the balance anyway — the till has to know before it draws the button
 * whether this guest can sign for anything.
 *
 * The movements DO get their own table (`crm.account_entries`), because there
 * are many of them per guest and each one has to be readable years later. The
 * balance here is the running total of that ledger, kept alongside it for the
 * same reason `customers.points` is: a till cannot afford to sum a ledger to
 * find out whether the next line fits.
 *
 * ---------------------------------------------------------------------------
 * Signs and defaults, which are the whole safety story
 *
 * `account_balance` is SIGNED and positive means the guest owes the restaurant.
 * A negative balance is a real state — a deposit, or a refund credited to the
 * tab rather than handed back — and it must not be clamped to zero, because
 * money the restaurant is holding for a guest is a liability and rounding it
 * away is how it disappears.
 *
 * `credit_limit` is UNSIGNED and defaults to 0, which means *no tab*. Every
 * guest already on file is therefore not a credit customer until someone
 * deliberately makes them one, and the person who can do that holds `crm.manage`
 * — an owner or an accountant, never the cashier standing in front of the guest
 * asking for it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('crm.customers', function (Blueprint $table): void {
            $table->unsignedBigInteger('credit_limit')->default(0)->after('total_spent')
                ->comment('Tiyin the guest may owe at once. 0 = no tab at all, which is the default');
            $table->bigInteger('account_balance')->default(0)->after('credit_limit')
                ->comment('Tiyin, signed. Positive = the guest owes us; negative = we hold their money');
        });

        /*
         * The accountant's list, and the only query this index is for: "who owes
         * us anything". Partial, because in a working restaurant almost every
         * guest on file has a zero balance and an index over all of them would be
         * mostly a list of zeroes.
         */
        Schema::table('crm.customers', function (Blueprint $table): void {
            $table->index(['tenant_id', 'account_balance'], 'customers_tenant_balance_index');
        });
    }

    public function down(): void
    {
        Schema::table('crm.customers', function (Blueprint $table): void {
            $table->dropIndex('customers_tenant_balance_index');
            $table->dropColumn(['credit_limit', 'account_balance']);
        });
    }
};
