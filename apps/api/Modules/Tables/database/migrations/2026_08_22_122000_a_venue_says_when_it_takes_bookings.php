<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Booking windows, and the code a guest keeps.
 *
 * ---------------------------------------------------------------------------
 * Why a venue needs windows at all
 *
 * `POST /api/v1/public/reservations` accepts any instant inside ninety days. A
 * stranger can therefore book 04:30 on a Tuesday, and the only thing that stops
 * a table being held is that every public booking lands `pending` for a person
 * to read. That person then rings a guest to say no — which is a phone call the
 * restaurant pays for, made about a slot the website should never have offered.
 *
 * A window says: on this weekday, at this venue, bookings are taken between
 * these hours, in slots of this length, up to this many covers per slot. The
 * site draws its time chooser from them, and the endpoint refuses anything
 * outside them. Both halves matter — a chooser without a check is a client-side
 * rule, and a check without a chooser is a form that refuses answers it offered.
 *
 * Thirty minutes by default, and per-row rather than a constant: a fine-dining
 * room seats on the hour and a canteen every fifteen minutes, and the sitting
 * length is the venue's own commercial decision.
 *
 * `capacity` counts COVERS, not tables. A host looking at a full evening is
 * asking how many people are already coming at seven, and the table plan that
 * seats them is worked out on the night — a party of two may end up at the
 * four-top nobody else claimed.
 *
 * ---------------------------------------------------------------------------
 * The guest's code
 *
 * A booking made on a website has to be readable, confirmable and cancellable
 * by the person who made it, and they have no account: the whole design of that
 * endpoint is that a stranger may use it. So the row carries a code.
 *
 * Ten random characters, minted once, unique across the platform — the same
 * shape and the same argument as `restaurant_tables.qr_token`. Deliberately NOT
 * the id: a small integer in a URL is an invitation to type the next one, and
 * the next one is somebody else's name, phone number and evening.
 *
 * Confusable characters are left out of the alphabet, because this is read
 * aloud over a telephone and typed by somebody standing outside a restaurant.
 * See `Reservation::newCode()`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tables.booking_windows', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * Required, unlike almost every other `branch_id` on the platform.
             *
             * A window is a statement about a room: when its door is open and
             * how many people fit. A window belonging to "the business" would
             * mean the same hours at a mall unit that closes with the mall and
             * at a terrace that closes when it rains, and one of those two
             * venues would be turning guests away at the door with a
             * confirmation in their hand.
             */
            $table->foreignId('branch_id')->constrained('public.branches')->cascadeOnDelete();

            /*
             * ISO-8601 weekday: 1 is Monday, 7 is Sunday.
             *
             * Carbon's own `isoWeekday()`, so the comparison in
             * `BookingDiary::slotsOn()` is a column against a call and not
             * against a conversion somebody has to remember. PHP's native
             * `w` format (0 = Sunday) is the other convention and mixing the two
             * moves every window by a day.
             */
            $table->unsignedTinyInteger('weekday')->comment('ISO-8601: 1 = Monday … 7 = Sunday');

            $table->time('opens_at');
            $table->time('closes_at')->comment('Last slot STARTS before this, it does not run past it');

            $table->unsignedSmallInteger('slot_minutes')->default(30);

            /*
             * Covers per slot, not per evening.
             *
             * Zero is meaningful and is not "unlimited": it is a window that is
             * drawn on the chooser and takes no more bookings, which is what a
             * fully committed Saturday looks like without deleting the row that
             * says the restaurant is open.
             */
            $table->unsignedSmallInteger('capacity')->default(20)
                ->comment('Guests, not tables — a host asks how many people are coming at seven');

            $table->boolean('is_active')->default(true);
            $table->timestamps();

            /*
             * One window per venue per weekday per opening time.
             *
             * Two rows for the same start would double a capacity that a host
             * meant once — and a split service (12:00–15:00 and 18:00–23:00) is
             * two rows with different opening times, which this allows and is
             * exactly the shape a two-sitting restaurant needs.
             */
            $table->unique(['tenant_id', 'branch_id', 'weekday', 'opens_at'], 'booking_windows_one_per_start');

            // The chooser's only query: this venue, this weekday, still on.
            $table->index(['tenant_id', 'branch_id', 'weekday', 'is_active']);
        });

        RowLevelSecurity::guard('tables.booking_windows');

        Schema::table('tables.reservations', function (Blueprint $table): void {
            $table->string('code', 16)->nullable()
                ->comment('What the guest quotes to read, confirm or cancel their own booking');
        });

        /*
         * Every existing booking gets one, including the ones taken by phone.
         *
         * A null code is a booking whose guest can never be given a link, and
         * the diary is full of them the day this ships. `md5(random())` cut to
         * ten characters and upper-cased is not the model's alphabet — it can
         * contain 0 and 1 — and that is fine for a backfill: these codes are
         * handed out by a person reading them off a screen, not typed by a guest
         * who was texted one.
         */
        DB::statement(
            'update tables.reservations set code = upper(substr(md5(random()::text || id::text), 1, 10))'
            .' where code is null',
        );

        /*
         * Unique across the platform, like `restaurant_tables.qr_token` and for
         * the same reason: a code is a bearer credential that arrives from a
         * text message, and the property worth having is that it names at most
         * one booking anywhere. Cross-tenant reads stay refused by the model's
         * own scope, not by this index.
         */
        DB::statement(
            'create unique index reservations_code_unique on tables.reservations (code) where code is not null',
        );
    }

    public function down(): void
    {
        DB::statement('drop index if exists tables.reservations_code_unique');

        Schema::table('tables.reservations', function (Blueprint $table): void {
            $table->dropColumn('code');
        });

        Schema::dropIfExists('tables.booking_windows');
    }
};
