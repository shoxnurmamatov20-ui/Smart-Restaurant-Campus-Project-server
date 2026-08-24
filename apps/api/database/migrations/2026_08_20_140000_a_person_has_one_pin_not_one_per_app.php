<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The PIN moves out of the till and into the person.
 *
 * It was created as `pos.pins` because the till was the only thing that asked
 * for one. The staff app asks for the same four digits — a waiter signing in on
 * their own phone — and there are only two ways to answer that: a second PIN
 * per person, or one PIN in a place both can reach.
 *
 * A second PIN is the wrong answer, and the deciding argument is the lockout
 * rather than the convenience. Five wrong tries must exhaust that person's
 * attempts *everywhere*: two independent counters mean ten guesses instead of
 * five, and a phone is the surface an attacker can take away with them. The
 * convenience matters too — nobody remembers two four-digit numbers, so they
 * would set both to the same and the second table would be a copy that drifts
 * the first time a manager rotates one of them.
 *
 * The table was already core in everything but its schema: `user_id` points at
 * `public.users`, and the unique key is already one PIN per person per tenant.
 * This moves it to where that was always true.
 *
 * Rows are carried across rather than dropped. There is a live deployment with
 * enrolled staff behind it, and a migration that quietly emptied this table
 * would lock every cashier out of every till at the moment it ran.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('public.user_pins', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('public.users')->cascadeOnDelete();

            /*
             * A four-digit secret is only defensible because of the two columns
             * below it. The PIN exists so a waiter can switch user in under a
             * second, twenty times an hour; the lockout is what stops that being
             * the same as no password at all — and it is shared across every
             * surface that asks, which is the reason this table moved.
             */
            $table->string('pin_hash', 255);
            $table->unsignedTinyInteger('failed_attempts')->default(0);
            $table->timestamp('locked_until')->nullable();

            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('rotated_at')->nullable();

            $table->timestamps();

            $table->unique(['tenant_id', 'user_id']);
        });

        if (Schema::hasTable('pos.pins')) {
            /*
             * Copied column for column with the ids preserved.
             *
             * Nothing references a PIN by id today, but keeping them costs one
             * clause and means a support conversation about "pin 41" that
             * started before this migration still finds the same row after it.
             */
            DB::statement(<<<'SQL'
                insert into public.user_pins (
                    id, tenant_id, user_id, pin_hash, failed_attempts,
                    locked_until, last_used_at, rotated_at, created_at, updated_at
                )
                select
                    id, tenant_id, user_id, pin_hash, failed_attempts,
                    locked_until, last_used_at, rotated_at, created_at, updated_at
                from pos.pins
            SQL);

            // Postgres keeps its own idea of the next id, and a sequence left at
            // 1 makes the very next enrolment collide with a row just copied in.
            DB::statement(
                "select setval(pg_get_serial_sequence('public.user_pins', 'id'), "
                .'coalesce((select max(id) from public.user_pins), 1), true)',
            );

            Schema::drop('pos.pins');
        }

        /*
         * The policy goes on AFTER the rows, and that ordering is the whole
         * reason this comment exists.
         *
         * A migration runs as the application role with no `app.tenant_id` set,
         * and the policy is FORCE — so guarding first would make the SELECT
         * above return nothing and the INSERT's WITH CHECK refuse everything
         * it did return. The migration would succeed, the table would be
         * empty, and every enrolled cashier would be locked out of every till
         * by a step that reported no error at all.
         *
         * The sweep in `2026_08_18_170000` only saw tables that existed when it
         * ran, so a table created afterwards has to say this itself;
         * `RowLevelSecurityTest` walks pg_class and fails when one does not.
         */
        RowLevelSecurity::guard('public.user_pins');
    }

    public function down(): void
    {
        Schema::create('pos.pins', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('public.users')->cascadeOnDelete();
            $table->string('pin_hash', 255);
            $table->unsignedTinyInteger('failed_attempts')->default(0);
            $table->timestamp('locked_until')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('rotated_at')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'user_id']);
        });

        DB::statement(<<<'SQL'
            insert into pos.pins (
                id, tenant_id, user_id, pin_hash, failed_attempts,
                locked_until, last_used_at, rotated_at, created_at, updated_at
            )
            select
                id, tenant_id, user_id, pin_hash, failed_attempts,
                locked_until, last_used_at, rotated_at, created_at, updated_at
            from public.user_pins
        SQL);

        RowLevelSecurity::guard('pos.pins');
        RowLevelSecurity::release('public.user_pins');
        Schema::dropIfExists('public.user_pins');
    }
};
