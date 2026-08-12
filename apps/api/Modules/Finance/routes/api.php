<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Finance\Http\Controllers\CashShiftController;
use Modules\Finance\Http\Controllers\ExpenseController;
use Modules\Finance\Http\Controllers\FinanceController;
use Modules\Finance\Http\Controllers\PaymentController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Finance module API routes — /api/v1/finance/*
|--------------------------------------------------------------------------
| Payments are never deleted, only refunded: a bill that vanishes is exactly
| the fraud pattern this module exists to make impossible.
*/

Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/finance')
    ->name('api.v1.finance.')
    ->group(function (): void {
        Route::get('/', [FinanceController::class, 'index'])->name('info');

        // ---- Cash shifts ----
        Route::get('shifts', [CashShiftController::class, 'index'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('shifts.index');
        Route::get('shifts/{shift}', [CashShiftController::class, 'show'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('shifts.show');
        Route::post('shifts/open', [CashShiftController::class, 'open'])
            ->middleware(PermissionMiddleware::using('finance.create'))->name('shifts.open');
        Route::post('shifts/{shift}/close', [CashShiftController::class, 'close'])
            ->middleware(PermissionMiddleware::using('finance.update'))->name('shifts.close');

        // ---- Payments ----
        Route::get('payments', [PaymentController::class, 'index'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('payments.index');
        Route::post('payments', [PaymentController::class, 'store'])
            ->middleware(PermissionMiddleware::using('finance.create'))->name('payments.store');
        Route::get('payments/{payment}', [PaymentController::class, 'show'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('payments.show');
        Route::post('payments/{payment}/refund', [PaymentController::class, 'refund'])
            ->middleware(PermissionMiddleware::using('finance.update'))->name('payments.refund');

        // ---- Expenses ----
        Route::get('expenses', [ExpenseController::class, 'index'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('expenses.index');
        Route::post('expenses', [ExpenseController::class, 'store'])
            ->middleware(PermissionMiddleware::using('finance.create'))->name('expenses.store');
        Route::get('expenses/{expense}', [ExpenseController::class, 'show'])
            ->middleware(PermissionMiddleware::using('finance.view'))->name('expenses.show');
        Route::patch('expenses/{expense}', [ExpenseController::class, 'update'])
            ->middleware(PermissionMiddleware::using('finance.update'))->name('expenses.update');
        Route::delete('expenses/{expense}', [ExpenseController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('finance.delete'))->name('expenses.destroy');
    });
