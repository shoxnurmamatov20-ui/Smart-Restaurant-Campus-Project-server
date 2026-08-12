<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Analytics\Http\Controllers\AnalyticsController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Analytics module API routes
|--------------------------------------------------------------------------
| Mounted at /api/v1/analytics/* by RouteServiceProvider.
|
| Read-only by design: this module answers questions, it never changes a
| number. Everything sits on 'analytics.view'.
*/

Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/analytics')
    ->name('api.v1.analytics.')
    ->group(function (): void {
        Route::get('/', [AnalyticsController::class, 'index'])->name('info');

        Route::middleware(PermissionMiddleware::using('analytics.view'))->group(function (): void {
            Route::get('dashboard', [AnalyticsController::class, 'dashboard'])->name('dashboard');
            Route::get('sales', [AnalyticsController::class, 'sales'])->name('sales');
            Route::get('abc', [AnalyticsController::class, 'abc'])->name('abc');
            Route::get('food-cost', [AnalyticsController::class, 'foodCost'])->name('food-cost');
            Route::get('channels', [AnalyticsController::class, 'channels'])->name('channels');
            Route::get('peak-hours', [AnalyticsController::class, 'peakHours'])->name('peak-hours');
        });
    });
