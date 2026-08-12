<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Crm\Http\Controllers\CrmController;
use Modules\Crm\Http\Controllers\CustomerController;
use Modules\Crm\Http\Controllers\FeedbackController;
use Modules\Crm\Http\Controllers\LoyaltyTransactionController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| CRM module API routes — /api/v1/crm/*
|--------------------------------------------------------------------------
*/

Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/crm')
    ->name('api.v1.crm.')
    ->group(function (): void {
        Route::get('/', [CrmController::class, 'index'])->name('info');

        Route::get('customers', [CustomerController::class, 'index'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('customers.index');
        Route::post('customers', [CustomerController::class, 'store'])
            ->middleware(PermissionMiddleware::using('crm.create'))->name('customers.store');
        Route::get('customers/{customer}', [CustomerController::class, 'show'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('customers.show');
        Route::patch('customers/{customer}', [CustomerController::class, 'update'])
            ->middleware(PermissionMiddleware::using('crm.update'))->name('customers.update');
        Route::delete('customers/{customer}', [CustomerController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('crm.delete'))->name('customers.destroy');

        Route::post('customers/{customer}/points', [CustomerController::class, 'adjustPoints'])
            ->middleware(PermissionMiddleware::using('crm.update'))->name('customers.points');

        Route::get('loyalty', [LoyaltyTransactionController::class, 'index'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('loyalty.index');

        Route::get('feedbacks', [FeedbackController::class, 'index'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('feedbacks.index');
        Route::post('feedbacks', [FeedbackController::class, 'store'])
            ->middleware(PermissionMiddleware::using('crm.create'))->name('feedbacks.store');
        Route::get('feedbacks/{feedback}', [FeedbackController::class, 'show'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('feedbacks.show');
        Route::post('feedbacks/{feedback}/resolve', [FeedbackController::class, 'resolve'])
            ->middleware(PermissionMiddleware::using('crm.update'))->name('feedbacks.resolve');
    });
