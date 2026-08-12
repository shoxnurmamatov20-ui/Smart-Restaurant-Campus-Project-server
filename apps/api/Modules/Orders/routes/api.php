<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Orders\Http\Controllers\OrderController;
use Modules\Orders\Http\Controllers\OrderItemController;
use Modules\Orders\Http\Controllers\OrdersController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Orders module API routes
|--------------------------------------------------------------------------
| Mounted at /api/v1/orders/* by RouteServiceProvider.
|
| Note the permission split: adding a dish and moving an order forward are
| 'orders.update' (every waiter does it constantly), while deleting an order is
| 'orders.delete' (owners only) — a bill is a financial record.
*/

Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/orders')
    ->name('api.v1.orders.')
    ->group(function (): void {
        Route::get('/', [OrdersController::class, 'index'])->name('info');

        // ---- Orders ----
        Route::get('orders', [OrderController::class, 'index'])
            ->middleware(PermissionMiddleware::using('orders.view'))->name('orders.index');
        Route::post('orders', [OrderController::class, 'store'])
            ->middleware(PermissionMiddleware::using('orders.create'))->name('orders.store');
        Route::get('orders/{order}', [OrderController::class, 'show'])
            ->middleware(PermissionMiddleware::using('orders.view'))->name('orders.show');
        Route::patch('orders/{order}', [OrderController::class, 'update'])
            ->middleware(PermissionMiddleware::using('orders.update'))->name('orders.update');
        Route::delete('orders/{order}', [OrderController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('orders.delete'))->name('orders.destroy');

        // ---- Bill lines ----
        Route::post('orders/{order}/items', [OrderController::class, 'addItem'])
            ->middleware(PermissionMiddleware::using('orders.update'))->name('orders.items.add');
        Route::delete('orders/{order}/items/{item}', [OrderController::class, 'removeItem'])
            ->middleware(PermissionMiddleware::using('orders.update'))->name('orders.items.remove');

        // ---- Flow ----
        Route::post('orders/{order}/status', [OrderController::class, 'changeStatus'])
            ->middleware(PermissionMiddleware::using('orders.update'))->name('orders.status');
        Route::post('orders/{order}/cancel', [OrderController::class, 'cancel'])
            ->middleware(PermissionMiddleware::using('orders.update'))->name('orders.cancel');

        // ---- Raw line access (kitchen and analytics read this) ----
        Route::get('items', [OrderItemController::class, 'index'])
            ->middleware(PermissionMiddleware::using('orders.view'))->name('items.index');
        Route::get('items/{item}', [OrderItemController::class, 'show'])
            ->middleware(PermissionMiddleware::using('orders.view'))->name('items.show');
        Route::patch('items/{item}', [OrderItemController::class, 'update'])
            ->middleware(PermissionMiddleware::using('orders.update'))->name('items.update');
    });
