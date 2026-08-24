<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Tables\Http\Controllers\BookingWindowController;
use Modules\Tables\Http\Controllers\HallController;
use Modules\Tables\Http\Controllers\PublicBookingSlotController;
use Modules\Tables\Http\Controllers\PublicReservationCodeController;
use Modules\Tables\Http\Controllers\PublicReservationController;
use Modules\Tables\Http\Controllers\PublicTableController;
use Modules\Tables\Http\Controllers\ReservationController;
use Modules\Tables\Http\Controllers\RestaurantTableController;
use Modules\Tables\Http\Controllers\TablesController;
use Modules\Tables\Http\Controllers\WaiterCallController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Tables module API routes
|--------------------------------------------------------------------------
| Mounted at /api/v1/tables/* by RouteServiceProvider.
| Every route sits behind auth:sanctum + tenant; each action carries its own
| Spatie permission. See RolesAndPermissionsSeeder for the role map.
|
| Two exceptions, below. A guest booking a table from the restaurant's own
| website, and a guest sitting AT a table with the QR sticker in front of them.
| Neither has a login — a stranger reading a menu has none — and neither needs
| one: tenancy scopes the first, and the printed token identifies the second.
*/

// ============ Guest-facing (the restaurant's own website) ============
Route::middleware(['tenant', 'throttle:5,1'])
    ->prefix('v1/public')
    ->name('api.v1.public.')
    ->group(function (): void {
        /*
         * Five a minute per address: four more than a person booking dinner
         * needs, far fewer than a script wants. The throttle is the outer belt;
         * the inner ones are that every booking lands `pending` and that one
         * phone number gets one live booking per day. See the controller.
         *
         * Inside the `tenant` group, so `EnsureIdempotency` applies and an
         * `Idempotency-Key` header is required. That is deliberate rather than
         * incidental — it is a third duplicate guard — and it means the site
         * posts through its own Node handler, which mints the key, rather than
         * the browser calling Laravel directly. The same arrangement every
         * other write on this platform uses.
         */
        Route::post('reservations', PublicReservationController::class)->name('reservations');

        /*
         * The guest's own booking, by the code they were given.
         *
         * Ten random characters from an alphabet with the confusable pairs
         * removed — see `Reservation::newCode()`. It is the whole credential and
         * it is enough: unlike a bill number, a random code has no neighbour to
         * guess, and what these three answer is narrower than tracking anyway (a
         * name, a party size, a time, a status).
         *
         * `cancel` is the one that earns its keep. A guest who cannot call a
         * booking off from their phone telephones a room that is busy serving
         * dinner, which in practice means nobody calls: the table stays held for
         * a party that is not coming and the evening is short a cover.
         */
        Route::get('reservations/{code}', [PublicReservationCodeController::class, 'show'])
            ->name('reservations.show');
        Route::post('reservations/{code}/confirm', [PublicReservationCodeController::class, 'confirm'])
            ->name('reservations.confirm');
        Route::post('reservations/{code}/cancel', [PublicReservationCodeController::class, 'cancel'])
            ->name('reservations.cancel');

        /*
         * The times the form may offer, for the date the guest picked.
         *
         * A read, and the only thing it publishes is which instants are still
         * bookable — never how many covers are left, which would let anybody
         * outside the building watch a restaurant's evening fill up.
         */
        Route::get('booking-slots', PublicBookingSlotController::class)->name('booking-slots');
    });

// ============ Guest-facing (the QR sticker on the table) ============
Route::middleware(['tenant', 'throttle:10,1'])
    ->prefix('v1/public')
    ->name('api.v1.public.')
    ->group(function (): void {
        /*
         * `{table}` is the table's `qr_token`, never its id.
         *
         * An id is a small integer, and a small integer in a URL is an
         * invitation to type the next one — which, on an endpoint that adds
         * lines to bills, is a stranger ordering forty kebabs onto somebody
         * else's table from the car park. The token is 22 random characters,
         * unique across the platform, minted once and then laminated onto a
         * piece of furniture. See RestaurantTable::newQrToken().
         *
         * Ten a minute per address, matching the customer app's ordering route:
         * more than a table needs and far fewer than a script wants. Inside the
         * `tenant` group, so the writes require an `Idempotency-Key` — a guest
         * on a café's Wi-Fi taps "Yuborish" twice and the kitchen gets one
         * docket rather than two.
         */
        Route::get('tables/{table}/order', [PublicTableController::class, 'bill'])
            ->name('tables.bill');
        Route::post('tables/{table}/order', [PublicTableController::class, 'order'])
            ->name('tables.order');

        // Asking for a person, and asking to pay. Two routes rather than one
        // with a `kind` in the body: the second also moves a bill, and one `if`
        // between "somebody is coming" and "we are being charged" is one too few.
        Route::post('tables/{table}/call', [PublicTableController::class, 'call'])
            ->name('tables.call');
        Route::post('tables/{table}/pay', [PublicTableController::class, 'pay'])
            ->name('tables.pay');
    });

Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/tables')
    ->name('api.v1.tables.')
    ->group(function (): void {
        Route::get('/', [TablesController::class, 'index'])->name('info');

        // ---- Halls ----
        Route::get('halls', [HallController::class, 'index'])
            ->middleware(PermissionMiddleware::using('tables.view'))->name('halls.index');
        Route::post('halls', [HallController::class, 'store'])
            ->middleware(PermissionMiddleware::using('tables.create'))->name('halls.store');
        Route::get('halls/{hall}', [HallController::class, 'show'])
            ->middleware(PermissionMiddleware::using('tables.view'))->name('halls.show');
        Route::patch('halls/{hall}', [HallController::class, 'update'])
            ->middleware(PermissionMiddleware::using('tables.update'))->name('halls.update');
        Route::delete('halls/{hall}', [HallController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('tables.delete'))->name('halls.destroy');

        // ---- Tables ----
        Route::get('tables', [RestaurantTableController::class, 'index'])
            ->middleware(PermissionMiddleware::using('tables.view'))->name('tables.index');
        Route::post('tables', [RestaurantTableController::class, 'store'])
            ->middleware(PermissionMiddleware::using('tables.create'))->name('tables.store');
        Route::get('tables/{table}', [RestaurantTableController::class, 'show'])
            ->middleware(PermissionMiddleware::using('tables.view'))->name('tables.show');
        Route::patch('tables/{table}', [RestaurantTableController::class, 'update'])
            ->middleware(PermissionMiddleware::using('tables.update'))->name('tables.update');
        Route::delete('tables/{table}', [RestaurantTableController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('tables.delete'))->name('tables.destroy');

        // Seating is a floor action, not an edit — waiters and hosts have it.
        Route::post('tables/{table}/status', [RestaurantTableController::class, 'changeStatus'])
            ->middleware(PermissionMiddleware::using('tables.update'))->name('tables.status');

        /*
         * The QR square to print and stick on the table.
         *
         * `tables.view`, deliberately: the token is already printed on furniture
         * in a public dining room, so anybody who may read the floor plan may
         * read the code stuck to it. Issuing a token is the guarded act, and
         * nothing issues one — the model mints it once, on create.
         */
        Route::get('tables/{table}/qr', [RestaurantTableController::class, 'qr'])
            ->middleware(PermissionMiddleware::using('tables.view'))->name('tables.qr');

        // ---- Reservations ----
        Route::get('reservations', [ReservationController::class, 'index'])
            ->middleware(PermissionMiddleware::using('tables.view'))->name('reservations.index');
        Route::post('reservations', [ReservationController::class, 'store'])
            ->middleware(PermissionMiddleware::using('tables.create'))->name('reservations.store');
        Route::get('reservations/{reservation}', [ReservationController::class, 'show'])
            ->middleware(PermissionMiddleware::using('tables.view'))->name('reservations.show');
        Route::patch('reservations/{reservation}', [ReservationController::class, 'update'])
            ->middleware(PermissionMiddleware::using('tables.update'))->name('reservations.update');
        Route::delete('reservations/{reservation}', [ReservationController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('tables.delete'))->name('reservations.destroy');

        Route::post('reservations/{reservation}/confirm', [ReservationController::class, 'confirm'])
            ->middleware(PermissionMiddleware::using('tables.update'))->name('reservations.confirm');
        Route::post('reservations/{reservation}/seat', [ReservationController::class, 'seat'])
            ->middleware(PermissionMiddleware::using('tables.update'))->name('reservations.seat');
        Route::post('reservations/{reservation}/complete', [ReservationController::class, 'complete'])
            ->middleware(PermissionMiddleware::using('tables.update'))->name('reservations.complete');
        Route::post('reservations/{reservation}/no-show', [ReservationController::class, 'noShow'])
            ->middleware(PermissionMiddleware::using('tables.update'))->name('reservations.no-show');
        Route::post('reservations/{reservation}/cancel', [ReservationController::class, 'cancel'])
            ->middleware(PermissionMiddleware::using('tables.update'))->name('reservations.cancel');

        /*
        |----------------------------------------------------------------------
        | Booking windows
        |----------------------------------------------------------------------
        | When each venue takes bookings, in slots, with a ceiling per slot. The
        | website's chooser is drawn from these and the public endpoint refuses
        | anything outside them, so one screen decides both.
        |
        | `tables.*` and not a settings permission, because the people who own
        | this are the people who own the floor: a host and a branch manager.
        | `slots` is `tables.view` — a host reading tonight is not editing it.
        */
        Route::get('booking-windows', [BookingWindowController::class, 'index'])
            ->middleware(PermissionMiddleware::using('tables.view'))->name('booking-windows.index');
        Route::post('booking-windows', [BookingWindowController::class, 'store'])
            ->middleware(PermissionMiddleware::using('tables.create'))->name('booking-windows.store');
        Route::patch('booking-windows/{bookingWindow}', [BookingWindowController::class, 'update'])
            ->middleware(PermissionMiddleware::using('tables.update'))->name('booking-windows.update');
        Route::delete('booking-windows/{bookingWindow}', [BookingWindowController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('tables.delete'))->name('booking-windows.destroy');
        Route::get('booking-slots', [BookingWindowController::class, 'slots'])
            ->middleware(PermissionMiddleware::using('tables.view'))->name('booking-slots');

        /*
        |----------------------------------------------------------------------
        | Raised hands
        |----------------------------------------------------------------------
        | `tables.waiter_calls` has been written to since the QR screen's two
        | buttons became real, and nothing could read it back — a raised hand no
        | screen lists is worse than a button that does nothing, because the
        | guest has been told somebody is coming.
        |
        | Reading is `tables.view` (every waiter holds it); answering is
        | `tables.update`, the same permission that seats a table, because both
        | are floor actions rather than edits.
        */
        Route::get('calls', [WaiterCallController::class, 'index'])
            ->middleware(PermissionMiddleware::using('tables.view'))->name('calls.index');
        Route::post('calls/{call}/resolve', [WaiterCallController::class, 'resolve'])
            ->middleware(PermissionMiddleware::using('tables.update'))->name('calls.resolve');
    });
