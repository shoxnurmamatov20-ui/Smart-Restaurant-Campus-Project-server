<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The two things a rota is missing: a moment it became real, and a way to
 * swap out of it.
 *
 * ---------------------------------------------------------------------------
 * `published_at`
 *
 * A manager builds next week over several sittings — drags a cook to Thursday,
 * changes their mind on Friday, leaves two gaps to fill on Monday. Every one of
 * those edits is already a row in `staff.shifts`, and every one of them is
 * already visible to the person it names. So the working draft and the promise
 * are the same thing, and a waiter who checked on Tuesday found a shift that no
 * longer exists on Wednesday.
 *
 * The column is the whole fix. Until it is set the week is the manager's;
 * once it is set it is everybody's, and the notification that goes out says so.
 * `rota-board.tsx` has been naming `POST /api/v1/staff/shifts/publish` in a
 * TODO since the screen was drawn.
 *
 * Not a status value, deliberately. `Shift::STATUSES` is about what happens to
 * one slot — planned, confirmed, swapped, cancelled — and publication is about
 * the week. Folding it in would make "published" and "confirmed" two words for
 * states that can legitimately coexist in either combination.
 *
 * ---------------------------------------------------------------------------
 * `staff.shift_swaps`
 *
 * A separate table rather than columns on the shift, and the reason is that a
 * request is not a property of the thing it is about. Two waiters can ask about
 * the same Thursday in the same hour, a manager refuses one and grants the
 * other, and both refusals have to survive as history — that is a row each, not
 * a `swap_requested_by` column that the second write overwrites.
 *
 * It also keeps the shift honest. When a swap is approved the shift changes
 * hands and nothing else about it moves; the reason it changed hands lives
 * here, where somebody can still read it a month later.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('staff.shifts', function (Blueprint $table): void {
            $table->timestamp('published_at')->nullable()->after('status')
                ->comment('When this shift stopped being a draft and became a promise');
        });

        /*
         * The rota that already exists is already being read as real.
         *
         * StaffShiftSeeder writes a week either side of today and the crew app
         * draws it; leaving those rows unpublished would empty the screen the
         * moment the publish gate lands. Backfilled to `created_at` rather than
         * to now, so "published a week ago" stays true.
         */
        DB::statement('update staff.shifts set published_at = created_at where published_at is null');

        Schema::create('staff.shift_swaps', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->cascadeOnDelete();

            $table->foreignId('shift_id')->constrained('staff.shifts')->cascadeOnDelete();

            /*
             * Whose shift it is, and who is being asked.
             *
             * `offered_to_id` is nullable and that is the common case: a waiter
             * with a wedding to go to posts the shift to whoever will take it,
             * rather than naming somebody and waiting. A manager then assigns
             * it when they approve.
             */
            $table->foreignId('requested_by_id')->constrained('staff.staff_members')->cascadeOnDelete();
            $table->foreignId('offered_to_id')->nullable()->constrained('staff.staff_members')->nullOnDelete();

            $table->string('status', 16)->default('pending')
                ->comment('pending | approved | rejected | cancelled');
            $table->string('reason', 255)->nullable()->comment('Why they are asking');

            /*
             * Who decided, as a user rather than a staff member.
             *
             * The person who grants a swap is a manager acting with
             * `staff.manage`, and permissions hang off `public.users`. Recording
             * their roster row instead would be recording a different fact — an
             * owner who never appears on the rota still signs these off.
             */
            $table->foreignId('decided_by')->nullable()->constrained('public.users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->string('decision_note', 255)->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'shift_id']);
            $table->index(['tenant_id', 'requested_by_id']);
        });

        /*
         * One live request per shift.
         *
         * Partial, because the uniqueness only holds while a request is open —
         * a shift refused once and asked about again next week is two rows, and
         * both are history worth keeping. Written by hand: the fluent Blueprint
         * has no way to say WHERE.
         */
        DB::statement(
            'create unique index shift_swaps_one_pending_per_shift'
            ." on staff.shift_swaps (tenant_id, shift_id) where status = 'pending' and deleted_at is null",
        );

        /*
         * The sweep in `2026_08_18_170000` only saw the tables that existed
         * when it ran, so a table created afterwards has to guard itself;
         * RowLevelSecurityTest walks pg_class and fails when one does not.
         */
        RowLevelSecurity::guard('staff.shift_swaps');
    }

    public function down(): void
    {
        RowLevelSecurity::release('staff.shift_swaps');
        DB::statement('drop index if exists staff.shift_swaps_one_pending_per_shift');
        Schema::dropIfExists('staff.shift_swaps');

        Schema::table('staff.shifts', function (Blueprint $table): void {
            $table->dropColumn('published_at');
        });
    }
};
