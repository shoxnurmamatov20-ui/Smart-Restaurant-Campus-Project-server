<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Kitchen\Http\Controllers\KitchenController;
use Modules\Kitchen\Http\Controllers\KitchenStationController;
use Modules\Kitchen\Http\Controllers\KitchenTicketController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Kitchen module API routes
|--------------------------------------------------------------------------
| Mounted at /api/v1/kitchen/* by RouteServiceProvider.
|
| Ticket transitions sit on 'kitchen.update' — a cook taps them all shift and
| must never need a manager's rights to say a dish is ready.
*/

Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/kitchen')
    ->name('api.v1.kitchen.')
    ->group(function (): void {
        Route::get('/', [KitchenController::class, 'index'])->name('info');

        // ---- Stations ----
        Route::get('stations', [KitchenStationController::class, 'index'])
            ->middleware(PermissionMiddleware::using('kitchen.view'))->name('stations.index');
        Route::post('stations', [KitchenStationController::class, 'store'])
            ->middleware(PermissionMiddleware::using('kitchen.create'))->name('stations.store');
        Route::get('stations/{station}', [KitchenStationController::class, 'show'])
            ->middleware(PermissionMiddleware::using('kitchen.view'))->name('stations.show');
        Route::patch('stations/{station}', [KitchenStationController::class, 'update'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('stations.update');
        Route::delete('stations/{station}', [KitchenStationController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('kitchen.delete'))->name('stations.destroy');

        // ---- Tickets ----
        Route::get('tickets', [KitchenTicketController::class, 'index'])
            ->middleware(PermissionMiddleware::using('kitchen.view'))->name('tickets.index');
        Route::post('tickets', [KitchenTicketController::class, 'store'])
            ->middleware(PermissionMiddleware::using('kitchen.create'))->name('tickets.store');
        Route::get('tickets/{ticket}', [KitchenTicketController::class, 'show'])
            ->middleware(PermissionMiddleware::using('kitchen.view'))->name('tickets.show');
        Route::patch('tickets/{ticket}', [KitchenTicketController::class, 'update'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('tickets.update');
        Route::delete('tickets/{ticket}', [KitchenTicketController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('kitchen.delete'))->name('tickets.destroy');

        // ---- The four buttons on the KDS screen ----
        Route::post('tickets/{ticket}/start', [KitchenTicketController::class, 'start'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('tickets.start');
        Route::post('tickets/{ticket}/ready', [KitchenTicketController::class, 'ready'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('tickets.ready');
        Route::post('tickets/{ticket}/serve', [KitchenTicketController::class, 'serve'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('tickets.serve');
        Route::post('tickets/{ticket}/recall', [KitchenTicketController::class, 'recall'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('tickets.recall');

        // ---- Order -> tickets ----
        Route::post('dispatch', [KitchenTicketController::class, 'dispatchOrder'])
            ->middleware(PermissionMiddleware::using('kitchen.create'))->name('dispatch');
    });
