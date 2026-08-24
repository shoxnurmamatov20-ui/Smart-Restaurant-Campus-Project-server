<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Kitchen\Http\Controllers\KitchenController;
use Modules\Kitchen\Http\Controllers\KitchenStationController;
use Modules\Kitchen\Http\Controllers\KitchenTicketController;
use Modules\Kitchen\Http\Controllers\PrintController;
use Modules\Kitchen\Http\Controllers\PrinterController;
use Modules\Kitchen\Http\Controllers\PrintJobController;
use Modules\Kitchen\Http\Controllers\StopListController;
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

        // ---- The five buttons on the KDS screen ----
        Route::post('tickets/{ticket}/accept', [KitchenTicketController::class, 'accept'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('tickets.accept');
        Route::post('tickets/{ticket}/start', [KitchenTicketController::class, 'start'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('tickets.start');
        Route::post('tickets/{ticket}/ready', [KitchenTicketController::class, 'ready'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('tickets.ready');
        Route::post('tickets/{ticket}/serve', [KitchenTicketController::class, 'serve'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('tickets.serve');
        Route::post('tickets/{ticket}/recall', [KitchenTicketController::class, 'recall'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('tickets.recall');

        /*
         * ---- The 86 sheet ----
         *
         * On `kitchen.view` and `kitchen.update`, not on `menu.*`. A chef must be
         * able to say "we're out of Manti" and must not be able to change what
         * Manti costs; those are one permission apart and the wrong one here would
         * hand the kitchen the price list.
         */
        Route::get('stop-list', [StopListController::class, 'index'])
            ->middleware(PermissionMiddleware::using('kitchen.view'))->name('stop-list.index');
        Route::post('stop-list', [StopListController::class, 'store'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('stop-list.store');
        Route::delete('stop-list/{menuItem}', [StopListController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('stop-list.destroy');

        /*
         * ---- Paper ----
         *
         * Three audiences on one prefix, and the permissions are what separate
         * them rather than the URL.
         *
         *  - **Whoever installs the hardware** configures printers: `kitchen.manage`,
         *    which owners, managers and the chef hold and nobody on the floor does.
         *  - **Whoever is standing at a till** reads the status strip:
         *    `pos.view|kitchen.view`, because a waiter, a cashier and a cook all
         *    need to know the printer is dead and none of them can do harm by
         *    knowing it.
         *  - **The local agent** drains the queue: `kitchen.update`, held by the
         *    kitchen brigade and by the service account the agent signs in as.
         *
         * The one asymmetry worth reading twice is the pair of reprints below.
         */
        Route::get('printers/health', [PrinterController::class, 'health'])
            ->middleware(PermissionMiddleware::using('pos.view|kitchen.view'))->name('printers.health');

        Route::get('printers', [PrinterController::class, 'index'])
            ->middleware(PermissionMiddleware::using('kitchen.view'))->name('printers.index');
        Route::post('printers', [PrinterController::class, 'store'])
            ->middleware(PermissionMiddleware::using('kitchen.manage'))->name('printers.store');
        Route::get('printers/{printer}', [PrinterController::class, 'show'])
            ->middleware(PermissionMiddleware::using('kitchen.view'))->name('printers.show');
        Route::patch('printers/{printer}', [PrinterController::class, 'update'])
            ->middleware(PermissionMiddleware::using('kitchen.manage'))->name('printers.update');
        Route::delete('printers/{printer}', [PrinterController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('kitchen.manage'))->name('printers.destroy');
        Route::post('printers/{printer}/test', [PrinterController::class, 'test'])
            ->middleware(PermissionMiddleware::using('kitchen.manage'))->name('printers.test');
        Route::post('printers/{printer}/heartbeat', [PrinterController::class, 'heartbeat'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('printers.heartbeat');

        // ---- The spool ----
        Route::get('print-jobs', [PrintJobController::class, 'index'])
            ->middleware(PermissionMiddleware::using('kitchen.view'))->name('print-jobs.index');
        Route::post('print-jobs/claim', [PrintJobController::class, 'claim'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('print-jobs.claim');
        Route::post('print-jobs/{job}/printed', [PrintJobController::class, 'printed'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('print-jobs.printed');
        Route::post('print-jobs/{job}/failed', [PrintJobController::class, 'failed'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('print-jobs.failed');
        Route::post('print-jobs/{job}/retry', [PrintJobController::class, 'retry'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('print-jobs.retry');

        /*
         * ---- Reprints, and why they are not the same permission ----
         *
         * A docket is a work instruction: `kitchen.update`, the same right a cook
         * uses all shift to say a dish is ready.
         *
         * A receipt is a money document, so it is `pos.sell` — the cashier's
         * right, which a waiter does hold and a cook does not. It cannot be
         * `kitchen.*`: a waiter has `kitchen.view` and would be able to produce
         * duplicate receipts for a bill they are carrying, which is the shape of
         * every till fraud there is.
         */
        Route::post('tickets/{ticket}/print', [PrintController::class, 'docket'])
            ->middleware(PermissionMiddleware::using('kitchen.update'))->name('tickets.print');
        Route::post('receipts', [PrintController::class, 'receipt'])
            ->middleware(PermissionMiddleware::using('pos.sell'))->name('receipts.print');
    });
