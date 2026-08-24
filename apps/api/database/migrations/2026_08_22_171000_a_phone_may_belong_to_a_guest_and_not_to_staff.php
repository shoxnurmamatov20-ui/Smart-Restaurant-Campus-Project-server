<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The phone in a guest's pocket is a phone too.
 *
 * `push_tokens` was built for staff: `user_id` NOT NULL, pointing at
 * `public.users`. That covers a waiter, a manager and a storekeeper, and it
 * covers nobody the platform actually delivers food to — a restaurant's own
 * customer lives in `crm.customers` and a MyPOS shopper in
 * `marketplace.consumers`, and neither is a `User` or ever will be. So the
 * three surfaces whose entire job is telling somebody their dinner is at the
 * door could not register a device at all.
 *
 * ---------------------------------------------------------------------------
 * Polymorphic, and the alias map is the point
 *
 * `notifiable_type` holds `user`, `customer` or `consumer` — three short words
 * declared on `App\Models\PushToken`, never a fully-qualified class name. A
 * column full of `Modules\Marketplace\Models\Consumer` has to be rewritten the
 * day a class moves, and a repository that has already relocated one module's
 * models will do it again.
 *
 * There is deliberately no `morphTo()` and no global morph map. Nothing needs to
 * turn one of these rows back into a model — the senders go the other way, from
 * a known person to their devices — and registering a platform-wide map to
 * support a relation nobody calls would change how every other polymorphic
 * column in the application is written, including the media library's.
 *
 * `user_id` STAYS, nullable, beside the pair. It is a real foreign key with a
 * cascade on it, `PushToken::user()` is used by the staff senders, and turning
 * a working relation into a nullable morph for tidiness would buy nothing and
 * cost every existing query. Staff rows carry both; guest rows carry only the
 * pair.
 *
 * ---------------------------------------------------------------------------
 * A guest row has no tenant, and that is why the marketplace route is separate
 *
 * A MyPOS consumer belongs to the platform rather than to a restaurant, so their
 * row's `tenant_id` is null — and `push_tokens` is behind a fail-closed
 * row-level-security policy, which refuses a null-tenant write on a request that
 * resolved no tenant. `Modules\Marketplace` writes its rows inside
 * `DatabaseTenancy::withoutTenancy()` for that reason and for no other; CRM's
 * customer is inside a restaurant and writes ordinarily.
 */
return new class extends Migration
{
    private const TABLE = 'public.push_tokens';

    public function up(): void
    {
        Schema::table(self::TABLE, function (Blueprint $table): void {
            $table->string('notifiable_type', 32)->nullable()
                ->comment('Morph alias: user | customer | consumer');
            $table->unsignedBigInteger('notifiable_id')->nullable();

            $table->index(['notifiable_type', 'notifiable_id'], 'push_tokens_notifiable_index');
        });

        /*
         * Every existing row is a member of staff. Filled in before the column
         * is relied upon, so no query ever has to say "or user_id when the
         * morph is null" — one shape from the first release onwards.
         */
        DB::table('push_tokens')
            ->whereNull('notifiable_type')
            ->update(['notifiable_type' => 'user', 'notifiable_id' => DB::raw('user_id')]);

        Schema::table(self::TABLE, function (Blueprint $table): void {
            $table->foreignId('user_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Guest rows have no user to fall back on, so they go rather than
        // leaving a NOT NULL column that cannot be satisfied.
        DB::table('push_tokens')->whereNull('user_id')->delete();

        Schema::table(self::TABLE, function (Blueprint $table): void {
            $table->foreignId('user_id')->nullable(false)->change();
            $table->dropIndex('push_tokens_notifiable_index');
            $table->dropColumn(['notifiable_type', 'notifiable_id']);
        });
    }
};
