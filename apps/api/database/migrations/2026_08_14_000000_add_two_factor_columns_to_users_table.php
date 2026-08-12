<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two-factor authentication, for the people who can see every restaurant.
 *
 * The design asks for it on exactly one door (§3.12, third tab): the platform
 * operator signs in with email, password and a six-digit code, and is told the
 * restaurant owner can see that they did. Nobody inside a restaurant needs it —
 * a waiter signs in with four digits at a terminal that is already paired.
 *
 * Columns rather than a separate table: this is one secret per person, read on
 * every sign-in and never listed. A row in `user_two_factor` would buy nothing
 * and cost a join on the hottest path there is.
 *
 * `two_factor_secret` is encrypted at the model, so it is text rather than a
 * fixed-width column: `Crypt` output length depends on the cipher and grows if
 * the key ever rotates to a wider one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            // The shared secret, encrypted. Null until enrolment.
            $table->text('two_factor_secret')->nullable()->after('password');

            // Set when the person has proved they can read a code from it.
            // Enrolled-but-unconfirmed must not satisfy a challenge, or the
            // second factor is one an attacker who set it can also pass.
            $table->timestamp('two_factor_confirmed_at')->nullable()->after('two_factor_secret');

            /*
             * The last window this person consumed.
             *
             * TOTP accepts a code for a whole 30-second window, so the same six
             * digits work twice inside it. That is the replay: shoulder-surf a
             * code, or read it out of a proxy log, and use it before the window
             * closes. Recording the window and refusing to accept it a second
             * time closes that, and it is why the column is here rather than in
             * a cache that a restart would empty.
             */
            $table->unsignedBigInteger('two_factor_last_window')->nullable()
                ->after('two_factor_confirmed_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'two_factor_secret',
                'two_factor_confirmed_at',
                'two_factor_last_window',
            ]);
        });
    }
};
