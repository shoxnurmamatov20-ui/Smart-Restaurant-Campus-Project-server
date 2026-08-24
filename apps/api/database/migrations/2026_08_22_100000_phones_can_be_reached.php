<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a phone can be reached.
 *
 * The native app ships with `expo-notifications` installed and nothing to
 * register against: a courier could be assigned, a table's food could be
 * ready, an approval could be waiting, and the phone that should buzz was
 * never written down anywhere. This is where it is written down.
 *
 * One row per (person, device). A person with a work phone and a personal one
 * has two rows and gets two buzzes, which is what they would expect. The token
 * is Expo's (`ExponentPushToken[…]`), so one sender covers iOS and Android, and
 * it is unique on its own — Expo issues it per app install, not per person —
 * which is why a re-registration from the same device on a different account
 * *moves* the row rather than adding a second one.
 *
 * Under row-level security like every other table a person owns: a push token
 * is an address, and one restaurant must not be able to page another's staff.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('public.push_tokens', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('public.users')->cascadeOnDelete();
            $table->string('token', 128)->unique();
            $table->string('platform', 12);
            /** The app surface that registered it: customer, crew, mp, guest. */
            $table->string('surface', 16);
            $table->string('device_name', 120)->nullable();
            $table->string('locale', 5)->default('uz');
            $table->timestamp('last_seen_at')->nullable();
            /** Set by the sender when Expo reports the token is no longer valid. */
            $table->timestamp('invalidated_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'user_id']);
        });

        RowLevelSecurity::guard('public.push_tokens');
    }

    public function down(): void
    {
        RowLevelSecurity::release('public.push_tokens');
        Schema::dropIfExists('public.push_tokens');
    }
};
