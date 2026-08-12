<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Tables\Http\Controllers\HallController;
use Modules\Tables\Http\Controllers\ReservationController;
use Modules\Tables\Http\Controllers\RestaurantTableController;
use Modules\Tables\Http\Controllers\TablesController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Tables module API routes
|--------------------------------------------------------------------------
| Mounted at /api/v1/tables/* by RouteServiceProvider.
| Every route sits behind auth:sanctum + tenant; each action carries its own
| Spatie permission. See RolesAndPermissionsSeeder for the role map.
*/

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
        Route::post('reservations/{reservation}/cancel', [ReservationController::class, 'cancel'])
            ->middleware(PermissionMiddleware::using('tables.update'))->name('reservations.cancel');
    });
