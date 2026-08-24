<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A waiter's own phone, enrolled to a waiter.
 *
 * The staff app's front door is a four-digit PIN on a keypad, and four digits
 * are only defensible when something else has already said who is typing them.
 * A till answers that with its roster — the cashier taps their own name and then
 * types. A personal phone has no roster to tap, so the enrolment has to carry
 * the answer, and this is where it is kept.
 *
 * ---------------------------------------------------------------------------
 * Why per person and not per branch
 *
 * Enrolling the phone against a *branch* was the obvious alternative and it does
 * not survive arithmetic. The server would then have to find the person from the
 * PIN alone: a bcrypt comparison against every enrolled member of that branch,
 * ten to thirty of them, on every attempt — a second of CPU per sign-in and a
 * free denial-of-service. Worse, with thirty PINs live in a four-digit space,
 * roughly one random guess in three hundred lands on *somebody*, and the
 * per-person lockout never fires because each guess hits a different account.
 *
 * Bound to a person it is one comparison, one lockout, and a guess space of one.
 * The branch is still recorded — the sign-in screen shows it, so a waiter who
 * has walked into the wrong branch's back office sees it before typing.
 *
 * ---------------------------------------------------------------------------
 * The shape is the terminal's, deliberately
 *
 * Same pairing code with the same short life, same hash-at-rest, same
 * fingerprint and heartbeat columns. Two enrolment flows that look alike are two
 * a reader only has to understand once — and the differences that matter
 * (a person rather than a till, no layout, no discount ceiling) are then visible
 * precisely because everything else matches.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff.devices', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * The person this phone signs in as. Not nullable: a device with no
             * owner is the branch-scoped design this migration's note rejects.
             */
            $table->foreignId('user_id')->constrained('public.users')->cascadeOnDelete();

            /*
             * Where they were enrolled, by code rather than id — `staff_members`
             * already links to a branch that way and two spellings of the same
             * relationship in one module is how a join quietly returns nothing.
             */
            $table->string('branch_code', 32)->nullable();

            /** What the person calls this phone. Shown on the manager's list. */
            $table->string('label', 120);

            /*
             * The pairing code, hashed and short-lived.
             *
             * A manager reads eight characters aloud and the phone types them.
             * Stored as a hash because it is a bearer credential for the ten
             * minutes it lives, and a plaintext column is a list of working keys
             * for anybody who can read the table.
             */
            $table->char('pairing_code_hash', 64)->nullable();
            $table->timestamp('pairing_expires_at')->nullable();
            $table->timestamp('paired_at')->nullable();

            $table->string('device_fingerprint', 128)->nullable();
            $table->string('app_version', 32)->nullable();
            $table->timestamp('last_seen_at')->nullable();

            $table->string('status', 16)->default('active')
                ->comment('active | revoked — a lost phone is revoked, never deleted');

            $table->timestamps();
            $table->softDeletes();

            /*
             * One live enrolment per person.
             *
             * A waiter with two paired phones is a waiter who lost one and did
             * not say so. Enrolling again replaces rather than adds, which is
             * also what makes "revoke this person's device" a single act.
             */
            $table->unique(['tenant_id', 'user_id']);
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'branch_code']);
        });

        /*
         * NOT guarded by row-level security, and this is the third case the
         * terminals migration said would come.
         *
         * `2026_08_19_100000` states the rule: a table that AUTHENTICATION
         * ITSELF must read cannot be guarded by a policy that authentication is
         * what establishes. `public.users` was the first case and `pos.terminals`
         * the second; this is the same shape. A phone authenticates as itself,
         * so Sanctum resolves the device token's tokenable — this row — with the
         * connection still closed and no `app.tenant_id` set. Guarded, the
         * policy hides it, the tokenable comes back null, and every request from
         * every enrolled phone answers 403 `staff.device_required`.
         *
         * Measured rather than reasoned about: sixteen sign-in tests were
         * written first and ten of them failed exactly that way.
         *
         * What is given up is the same trade already accepted twice. The
         * Eloquent `BelongsToTenant` scope still filters every device query the
         * application makes, and the table holds no money, no guest data and no
         * personal data — a label, a branch code, a fingerprint, and a hash of a
         * pairing code that dies in ten minutes.
         *
         * `RowLevelSecurityTest` walks pg_class and fails on an unguarded tenant
         * table, so this exemption is declared in its EXEMPT list too. Two places
         * on purpose: an exemption nobody had to write down twice is one nobody
         * had to think about.
         */
    }

    public function down(): void
    {
        Schema::dropIfExists('staff.devices');
    }
};
