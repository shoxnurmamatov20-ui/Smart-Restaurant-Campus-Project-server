<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Pos\Http\Controllers\ApprovalController;
use Modules\Pos\Http\Controllers\BillController;
use Modules\Pos\Http\Controllers\DrawerController;
use Modules\Pos\Http\Controllers\PosAuthController;
use Modules\Pos\Http\Controllers\PosController;
use Modules\Pos\Http\Controllers\ShiftController;
use Modules\Pos\Http\Controllers\TenderController;
use Modules\Pos\Http\Controllers\TerminalController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Pos module API routes
|--------------------------------------------------------------------------
| Mounted at /api/v1/pos/* by RouteServiceProvider.
|
| Three kinds of caller live here, and they authenticate differently:
|
|   1. Back office (manager, owner, accountant) — a user token, `auth:sanctum`.
|   2. The till itself — a device token issued at pairing, also `auth:sanctum`
|      but the tokenable is a Terminal, not a User.
|   3. A tablet that has never paired — no credentials at all. Exactly one
|      route serves it, and the code is what identifies the restaurant.
*/

// ---- 3. Unauthenticated: pairing ----
// Throttled hard: this is the only endpoint where guessing has any value, and
// the code lives for ten minutes.
Route::middleware('throttle:10,1')
    ->prefix('v1/pos')
    ->name('api.v1.pos.')
    ->group(function (): void {
        Route::post('terminals/pair', [TerminalController::class, 'pair'])->name('terminals.pair');
    });

// ---- 1 & 2. Everything else ----
Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/pos')
    ->name('api.v1.pos.')
    ->group(function (): void {
        Route::get('/', [PosController::class, 'index'])->name('info');

        // ---- Terminals ----
        Route::get('terminals', [TerminalController::class, 'index'])
            ->middleware(PermissionMiddleware::using('pos.view'))->name('terminals.index');
        Route::post('terminals', [TerminalController::class, 'store'])
            ->middleware(PermissionMiddleware::using('pos.terminal'))->name('terminals.store');

        // Declared before `terminals/{terminal}` so the literal segment wins.
        Route::post('terminals/heartbeat', [TerminalController::class, 'heartbeat'])
            ->name('terminals.heartbeat');

        Route::get('terminals/{terminal}', [TerminalController::class, 'show'])
            ->middleware(PermissionMiddleware::using('pos.view'))->name('terminals.show');
        Route::patch('terminals/{terminal}', [TerminalController::class, 'update'])
            ->middleware(PermissionMiddleware::using('pos.terminal'))->name('terminals.update');
        Route::post('terminals/{terminal}/pairing-code', [TerminalController::class, 'issueCode'])
            ->middleware(PermissionMiddleware::using('pos.terminal'))->name('terminals.pairing-code');

        // ---- Signing in at a till (device token) ----
        // No permission middleware: nobody is signed in yet, and the device
        // token is the authorisation.
        Route::get('auth/staff', [PosAuthController::class, 'staff'])->name('auth.staff');
        Route::post('auth/pin', [PosAuthController::class, 'login'])
            ->middleware('throttle:20,1')->name('auth.pin');

        // ---- Signed in at a till (session token) ----
        Route::middleware('pos.session')->group(function (): void {
            Route::get('auth/session', [PosAuthController::class, 'current'])->name('auth.session');
            Route::delete('auth/session', [PosAuthController::class, 'logout'])->name('auth.logout');

            /*
             * Selling.
             *
             * `pos.sell` throughout, because taking an order and changing one
             * are the same act to a waiter. The operations that take money back
             * off a bill — voiding a line, discounting — carry their own
             * permission on top, and above a role's limit they also need a
             * manager's approval, which the ApprovalGate enforces.
             */
            Route::post('bills', [BillController::class, 'open'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.open');
            Route::get('bills/{bill}', [BillController::class, 'show'])
                ->middleware(PermissionMiddleware::using('pos.view'))->name('bills.show');

            Route::post('bills/{bill}/lines', [BillController::class, 'addLine'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.lines.add');
            Route::delete('bills/{bill}/lines/{line}', [BillController::class, 'voidLine'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.lines.void');

            Route::post('bills/{bill}/discount', [BillController::class, 'discount'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.discount');
            Route::post('bills/{bill}/service-charge', [BillController::class, 'serviceCharge'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.service-charge');

            Route::post('bills/{bill}/send', [BillController::class, 'send'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.send');
            Route::post('bills/{bill}/split', [BillController::class, 'split'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.split');
            Route::post('bills/{bill}/merge', [BillController::class, 'merge'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.merge');
            Route::post('bills/{bill}/transfer', [BillController::class, 'transfer'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.transfer');
            Route::post('bills/{bill}/cancel', [BillController::class, 'cancel'])
                ->middleware(PermissionMiddleware::using('pos.void'))->name('bills.cancel');

            // ---- Money ----
            Route::post('bills/{bill}/tenders', [TenderController::class, 'settle'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.tenders');
            Route::post('payments/{payment}/refund', [TenderController::class, 'refund'])
                ->middleware(PermissionMiddleware::using('pos.refund'))->name('payments.refund');

            // ---- Shift: open, X-report, Z-report ----
            Route::post('shifts/open', [ShiftController::class, 'open'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('shifts.open');
            Route::get('shifts/current', [ShiftController::class, 'current'])
                ->middleware(PermissionMiddleware::using('pos.view'))->name('shifts.current');
            Route::post('shifts/close', [ShiftController::class, 'close'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('shifts.close');

            // ---- Drawer ----
            Route::get('drawer/movements', [DrawerController::class, 'index'])
                ->middleware(PermissionMiddleware::using('pos.view'))->name('drawer.index');
            Route::post('drawer/movements', [DrawerController::class, 'store'])
                ->middleware(PermissionMiddleware::using('pos.drawer'))->name('drawer.store');

            // ---- Approvals ----
            // Asking is open to anyone at a till; answering is `pos.approve`.
            Route::post('approvals', [ApprovalController::class, 'store'])->name('approvals.store');
            Route::get('approvals', [ApprovalController::class, 'index'])
                ->middleware(PermissionMiddleware::using('pos.view'))->name('approvals.index');
            Route::get('approvals/{approval}', [ApprovalController::class, 'show'])
                ->middleware(PermissionMiddleware::using('pos.view'))->name('approvals.show');
            Route::post('approvals/{approval}/decide', [ApprovalController::class, 'decide'])
                ->middleware(PermissionMiddleware::using('pos.approve'))->name('approvals.decide');
        });

        // Changing a PIN happens in the back office as often as at a till, so it
        // sits outside the session requirement.
        Route::post('auth/pin/rotate', [PosAuthController::class, 'rotatePin'])
            ->middleware(PermissionMiddleware::using('pos.view'))->name('auth.pin.rotate');
    });
