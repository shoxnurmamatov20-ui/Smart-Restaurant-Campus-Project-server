<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * "Teng bo'lish" and "Summa bo'yicha" — the two splits that move no dishes.
 *
 * `BillRegistry::split()` has always taken `line_ids`: four friends who each ate
 * their own thing hand over their own lines, and the arithmetic follows the
 * food. That is one of the three buttons the design draws on the split sheet.
 * The other two divide the MONEY — four equal shares, or "this guest is putting
 * in 100 000" — and there is nothing to hand over, because the division is not
 * by dish. The till said so in its own comment and closed the sheet without
 * writing anything.
 *
 * ---------------------------------------------------------------------------
 * The rule these two columns encode
 *
 * A money split mints sibling bills, and from that moment every bill in the
 * family carries a FIXED figure rather than a sum of its lines:
 *
 *   - the parent keeps every line — the kitchen cooked them, the shelf paid for
 *     them, and food cost is joined through them — and takes the first share;
 *   - each sibling holds no lines at all and exists to be paid and printed;
 *   - `split_share_total` is what that bill is worth, in tiyin, and the shares
 *     add back up to the total the family was split from. That is the invariant
 *     `SplitBillTest` asserts, and it is what a cashier reading four figures out
 *     loud is relying on.
 *
 * So on a split bill `total` no longer equals `subtotal + service − discount`,
 * and that inequality is precisely what "this bill was divided" means. Revenue
 * is summed on `total` and is unchanged by splitting; only its distribution
 * across the family moves. Anything counting food has to join through
 * `split_parent_id` to the parent, which is the one bill that still has lines.
 *
 * ---------------------------------------------------------------------------
 * Why not a share LINE on each sibling
 *
 * The obvious shape is one synthetic line per sibling priced at its share, so
 * the existing arithmetic keeps working untouched. It produces the wrong money:
 * a share is a slice of a total that already had the service charge added and
 * the VAT read out of it, and `BillTotals` would charge service on the slice a
 * second time. Ten percent, twice, on the half of every split bill nobody
 * checks.
 *
 * ---------------------------------------------------------------------------
 * Why the parent keeps the lines rather than the first sibling
 *
 * Every id already issued — a kitchen ticket, a fiscal receipt, a guest's
 * tracking link, an offline queue entry — points at the bill that was split. It
 * has to stay the bill that was eaten.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders.orders', function (Blueprint $table): void {
            /*
             * Which bill this share was cut from. Null on the parent itself and
             * on every bill that was never split, which is almost all of them.
             *
             * A real foreign key, unlike `restaurant_table_id` beside it: both
             * ends are `orders.orders`, so the constraint crosses no module
             * boundary. `nullOnDelete` because a share that outlived its parent
             * is still money somebody paid.
             */
            $table->foreignId('split_parent_id')->nullable()
                ->constrained('orders.orders')->nullOnDelete();

            $table->unsignedBigInteger('split_share_total')->nullable()
                ->comment('Tiyin. Set on every bill in a money-split family; the shares add up to the original total');
        });

        /*
         * "Show me the rest of this family."
         *
         * The receipt printer asks it (2/4 has to know it is 2 of 4), the
         * payment screen asks it, and an accountant reconciling a split table
         * asks it. Partial, because the column is null on every bill that was
         * never divided.
         */
        DB::statement(
            'create index orders_by_split_parent on orders.orders (tenant_id, split_parent_id)'
            .' where split_parent_id is not null',
        );
    }

    public function down(): void
    {
        DB::statement('drop index if exists orders.orders_by_split_parent');

        Schema::table('orders.orders', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('split_parent_id');
            $table->dropColumn('split_share_total');
        });
    }
};
