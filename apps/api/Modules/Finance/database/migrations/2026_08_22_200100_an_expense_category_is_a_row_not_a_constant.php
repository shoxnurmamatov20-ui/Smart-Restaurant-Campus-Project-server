<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What a restaurant files its money under.
 *
 * `finance.expenses.category` is a varchar checked against `Expense::CATEGORIES`
 * — eight values compiled into a PHP class. Nothing on the platform could add a
 * ninth, so a restaurant that pays a franchise fee, or licences music, or rents
 * a second van, filed all three under `other` and then could not explain its own
 * ledger. This table is where the ninth lives.
 *
 * ---------------------------------------------------------------------------
 * The constant stays, and this table sits beside it rather than replacing it
 *
 * `Expense::CATEGORIES` is not decoration: `refund` exists so a Z-report can
 * show money handed back as its own line, `payroll` is what the labour figure is
 * booked against, and `EloquentTillLedger` writes both by name. A migration that
 * turned the column into a foreign key would make every one of those writes
 * depend on a row existing in the restaurant's own configuration — and a
 * restaurant that deleted the wrong row would break its till.
 *
 * So the column stays a varchar and this table is the CATALOGUE over it: the
 * eight built-in codes are seeded as rows a restaurant may rename and reorder
 * but not delete, and anything a restaurant adds gets a code of its own. What
 * the platform enforces is that the code on an expense names a live row here or
 * one of the eight — `StoreExpenseRequest` is where that is checked.
 *
 * ---------------------------------------------------------------------------
 * Income categories, and why they are on the same table
 *
 * The settings screen draws two columns, money in and money out. Takings are
 * classified by payment METHOD today and not by category at all, which is
 * correct for a sale — but a restaurant also receives money that is not a sale:
 * a supplier's rebate, a hall hired for a wedding, a deposit forfeited. Those
 * have nowhere to go.
 *
 * `direction` is what separates them, one table rather than two, because every
 * column below is the same for both and two tables would mean two of every
 * endpoint, resource and test for one boolean's worth of difference.
 *
 * ---------------------------------------------------------------------------
 * Archived, never deleted
 *
 * `archived_at` rather than a delete, because a category with expenses behind it
 * is a heading on last year's statement. Deleting the row would leave those rows
 * pointing at a code nothing can name, and a P&L that read "1 240 000 so'm,
 * unknown" is worse than one that reads "Reklama (arxiv)".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance.expense_categories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * The value that lands in `expenses.category`.
             *
             * Slug rather than id, because the column it has to match is a
             * varchar holding `rent` today and every row already written carries
             * one of the eight words. An id would mean a migration rewriting the
             * whole expenses table to point at rows that did not exist when those
             * expenses were booked.
             */
            $table->string('code', 32);

            $table->jsonb('name');

            // `out` is an expense, `in` is money received that is not a sale.
            $table->string('direction', 8)->default('out');

            /*
             * A built-in code cannot be deleted or recoded.
             *
             * The eight in `Expense::CATEGORIES` are written by the till and by
             * `EloquentTillLedger::refund()`; a restaurant that removed `refund`
             * would break a Z-report at closing time, in the room, at midnight.
             * Renaming one is fine and is the point — "Kommunal" instead of
             * "Utilities" — which is why the name is a separate column from the
             * code.
             */
            $table->boolean('is_system')->default(false);

            $table->unsignedSmallInteger('position')->default(0);
            $table->datetime('archived_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'direction', 'position']);
        });

        // One code per direction per restaurant. Partial, because `tenant_id` is
        // nullable and PostgreSQL does not consider two nulls equal — the same
        // reasoning as `analytics.daily_facts`.
        DB::statement(
            'create unique index expense_categories_one_row_per_code'
            .' on finance.expense_categories (tenant_id, direction, code)'
            .' where tenant_id is not null',
        );

        RowLevelSecurity::guard('finance.expense_categories');
    }

    public function down(): void
    {
        Schema::dropIfExists('finance.expense_categories');
    }
};
