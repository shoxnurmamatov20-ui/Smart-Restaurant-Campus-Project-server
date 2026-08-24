<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Keep a readable copy of the password the platform issued.
 *
 * `password` is a bcrypt hash and always will be — it is what a login is checked
 * against, and it is deliberately one-way: the same password hashes to a
 * different string every time, because the salt is random. Nothing can turn it
 * back into what was typed. That is not a limitation to work around, it is the
 * only reason a stolen database is not a stolen list of passwords.
 *
 * What this adds is a different fact, stored on purpose: **the value the
 * operator issued**, so it can be read back to the restaurant that rings up
 * having lost it. That is a real support call and this deployment has no other
 * answer to it — `/forgot-password` needs a mailer and `MAIL_MAILER=log` sends
 * nothing.
 *
 * Three things make it safe enough to be worth having:
 *
 *  1. **Encrypted at rest**, the same way `two_factor_secret` is. A dump of this
 *     database is useless without `APP_KEY`, which lives in `.env` on the server
 *     and is not in the dump. Somebody who has both has the application anyway.
 *  2. **Only the platform operator can read it**, through one endpoint behind
 *     `super-admin`, and every read is written to the activity log. "Who looked
 *     at this restaurant's password, and when" is answerable.
 *  3. **It is cleared the moment it stops being true.** Any password change this
 *     column did not cause — the owner changing their own, a reset from
 *     anywhere else — nulls it, because a stale password shown as current is
 *     worse than no password at all: the operator reads it out, it does not
 *     work, and nobody knows why.
 *
 * `issued_at` rides alongside so the console can say how old it is. A password
 * issued four months ago is one the owner has probably changed, and the screen
 * should say so rather than presenting it as fact.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            // `text`, not `string`: Laravel's encrypter base64s a JSON envelope
            // around the ciphertext, so a twelve-character password lands
            // somewhere near two hundred bytes and a varchar(255) would be a
            // limit waiting to be hit by a longer one.
            $table->text('issued_password')->nullable()->after('password');
            $table->timestamp('issued_password_at')->nullable()->after('issued_password');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['issued_password', 'issued_password_at']);
        });
    }
};
