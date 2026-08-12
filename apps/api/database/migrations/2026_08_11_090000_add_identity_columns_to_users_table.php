<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Columns the platform actually authenticates and routes people by.
 *
 * `phone` is not cosmetic: the Telegram module links a chat to an account by
 * phone number (BotApiController::link) and the column simply did not exist,
 * so every link attempt died on an unknown-column error. In Uzbekistan a phone
 * number is the primary identifier anyway — email is the optional one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('public.users', function (Blueprint $table): void {
            $table->string('phone', 32)->nullable()->after('email')
                ->comment('E.164, e.g. +998901234567 — how Telegram and SMS find this account');
            // Nullable on purpose: "no preference stated" is a real answer and
            // must be distinguishable from "chose Uzbek", otherwise the whole
            // restaurant would be pinned to a default nobody actually picked.
            $table->string('locale', 8)->nullable()->after('phone')
                ->comment('uz | ru | en — null means follow the restaurant');
            $table->boolean('is_active')->default(true)->after('locale')
                ->comment('A suspended employee keeps their history but cannot sign in');
            $table->timestamp('last_login_at')->nullable()->after('is_active');

            $table->index(['tenant_id', 'phone']);
            $table->index(['tenant_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::table('public.users', function (Blueprint $table): void {
            $table->dropIndex(['tenant_id', 'phone']);
            $table->dropIndex(['tenant_id', 'is_active']);
            $table->dropColumn(['phone', 'locale', 'is_active', 'last_login_at']);
        });
    }
};
