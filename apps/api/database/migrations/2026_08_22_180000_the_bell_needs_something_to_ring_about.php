<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The console's bell, and the rows it rings about.
 *
 * The shell has drawn a notification tray since the first day and it has been
 * drawing six invented rows — `NOTIFICATIONS` in `(dashboard)/shell-data.ts`,
 * whose own docblock says the platform stores nothing of the kind. It was
 * right: `php artisan notifications:table` had never been run here, so
 * `$user->notify()` could reach a phone through Expo and had nowhere at all to
 * write for a screen.
 *
 * ---------------------------------------------------------------------------
 * Laravel's own shape, widened — not a bespoke table
 *
 * The alternative was a purpose-built `console_notifications` with exactly the
 * six columns the tray draws. It was rejected for one concrete reason: the
 * `database` channel is not ours to redesign. Keeping `id`/`type`/
 * `notifiable_type`/`notifiable_id`/`data`/`read_at` means `$user->notify()`,
 * `->unreadNotifications`, `markAsRead()` and every future package that speaks
 * Laravel notifications work against this table unchanged, and the one
 * notification this codebase already sends — `ApprovalWaiting`, pushed to a
 * manager's phone — becomes a console row by adding one word to its `via()`.
 * A bespoke table would have bought a shorter migration and cost a parallel
 * notification system.
 *
 * What Laravel's shape does NOT carry is everything this platform is built on,
 * so four columns are added:
 *
 *   `tenant_id`  Convention 2. Without it the row is readable by nobody under
 *                row-level security and, more to the point, unfilterable: a
 *                person who works for two restaurants would read one bell.
 *   `branch_id`  Convention 3. A notification happens at a venue — a drawer is
 *                short in Chilonzor, not "in the business" — and the tray's
 *                third line is the place. Nullable, and null means the whole
 *                business: a monthly P&L belongs to no venue.
 *   `key`        The catalogue key the console translates
 *                (`console.notification.*` in `src/i18n`). The row carries the
 *                key rather than a sentence so the tray reads in the reader's
 *                own language; the sentence in `data` is the figures, which no
 *                catalogue can hold.
 *   `level`      `high` | `mid` | `low`. The design paints them danger, warning
 *                and brand, and `shell-data.ts` explains why the third exists:
 *                a finished report in the same red as a cash variance teaches a
 *                reader to stop trusting the red.
 *
 * They are columns and not `data` keys because all four are read in the WHERE
 * and the ORDER BY of every request the tray makes, and a jsonb extraction in
 * a sort is a sort with no index behind it.
 *
 * ---------------------------------------------------------------------------
 * One index, for the one read
 *
 * The tray asks exactly one question: what is still unread for this person in
 * this restaurant, worst first. Read rows are deliberately not in the answer —
 * "Mark all read" is the tray's only other control, and a button that empties
 * a list has to actually empty it.
 *
 * So the index is partial on `read_at is null`. That is the shape of the data
 * as well as of the query: a bell accumulates rows forever and all but a
 * handful of them are read, so an index over the whole table would grow
 * without bound to serve a query that never looks at the grown part.
 *
 * Severity is not in the index and does not need to be. It narrows to one
 * person's unread rows first — tens, not thousands — and three levels sorted
 * in memory after that costs nothing. Putting `level` in the key would not even
 * work: sorted as text it reads high, low, mid, which is not the order.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('public.notifications', function (Blueprint $table): void {
            // Laravel mints the uuid on the Notification object, so the same
            // event delivered to a phone and to a screen carries one id.
            $table->uuid('id')->primary();
            $table->string('type');
            $table->morphs('notifiable');
            // jsonb rather than the framework's `text`: everything else on this
            // platform that stores a document stores it queryably.
            $table->jsonb('data');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            // nullOnDelete, not cascade: closing a venue must not delete the
            // notice that its last drawer was short.
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->nullOnDelete();

            $table->string('key', 48)->comment('console.notification.* — the catalogue key the console translates');
            $table->string('level', 4)->comment('high | mid | low — the design’s three severities');
        });

        // `desc` and the partial predicate are both beyond Blueprint, and both
        // are the point of the index rather than decoration on it.
        DB::statement(<<<'SQL'
            create index notifications_unread_idx
                on public.notifications (tenant_id, notifiable_id, created_at desc)
                where read_at is null
        SQL);

        RowLevelSecurity::guard('public.notifications');
    }

    public function down(): void
    {
        RowLevelSecurity::release('public.notifications');
        Schema::dropIfExists('public.notifications');
    }
};
