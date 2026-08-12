<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which venue a person works at.
 *
 * Nullable, and the null carries meaning rather than being "not filled in yet":
 *
 *   branch_id = null  → this user spans every branch of their restaurant.
 *                       The owner, the accountant and the brand manager read
 *                       across venues; that is the whole point of their job.
 *   branch_id = 7     → this user is pinned to branch 7. A branch manager, a
 *                       waiter, a cashier, a cook and a storekeeper each work
 *                       at one address, and asking for another one is refused
 *                       rather than quietly answered with an empty list.
 *
 * It mirrors `tenant_id` on the same table, where null means platform staff.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('public.users', function (Blueprint $table): void {
            $table->foreignId('branch_id')->nullable()->after('tenant_id')
                ->constrained('public.branches')->nullOnDelete()
                ->comment('Pinned venue; null means the user spans every branch of their tenant');

            $table->index(['tenant_id', 'branch_id']);
        });
    }

    public function down(): void
    {
        Schema::table('public.users', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'branch_id']);
            $table->dropConstrainedForeignId('branch_id');
        });
    }
};
