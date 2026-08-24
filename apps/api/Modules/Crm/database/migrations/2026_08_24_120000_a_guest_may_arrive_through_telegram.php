<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A guest who arrives through the Telegram mini app.
 *
 * Telegram's signed `initData` identifies a person by a numeric id and,
 * unless they explicitly share it, no telephone number at all. The guest
 * table was built around a phone — required, unique per restaurant — because
 * every other door on the platform starts with an OTP to one.
 *
 * So two changes, and both are the same decision: a guest is identified by
 * whichever credential they arrived with. `telegram_user_id` is that
 * credential for the mini app, unique per restaurant like the phone beside
 * it; and the phone becomes nullable, because a Telegram guest genuinely
 * does not have one here until they tap "share my number". Their loyalty
 * points and their order history are still theirs — that is the whole point
 * of identifying them at all — and the day they do share a number, the two
 * rows are one row, because the phone lands on the same guest.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('crm.customers', function (Blueprint $table): void {
            $table->string('phone', 32)->nullable()->change();
            $table->unsignedBigInteger('telegram_user_id')->nullable()->after('phone')
                ->comment('Telegram account id from signed initData; null for guests who arrived another way');
            $table->unique(['tenant_id', 'telegram_user_id'], 'customers_tenant_telegram_unique');
        });
    }

    public function down(): void
    {
        Schema::table('crm.customers', function (Blueprint $table): void {
            $table->dropUnique('customers_tenant_telegram_unique');
            $table->dropColumn('telegram_user_id');
        });
    }
};
