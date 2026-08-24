<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Suppliers\Http\Controllers\PurchaseOrderController;
use Modules\Suppliers\Http\Controllers\SupplierController;
use Modules\Suppliers\Http\Controllers\SuppliersController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Suppliers module API routes — /api/v1/suppliers/*
|--------------------------------------------------------------------------
*/

Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/suppliers')
    ->name('api.v1.suppliers.')
    ->group(function (): void {
        Route::get('/', [SuppliersController::class, 'index'])->name('info');

        Route::get('suppliers', [SupplierController::class, 'index'])
            ->middleware(PermissionMiddleware::using('suppliers.view'))->name('suppliers.index');
        Route::post('suppliers', [SupplierController::class, 'store'])
            ->middleware(PermissionMiddleware::using('suppliers.create'))->name('suppliers.store');
        Route::get('suppliers/{supplier}', [SupplierController::class, 'show'])
            ->middleware(PermissionMiddleware::using('suppliers.view'))->name('suppliers.show');
        Route::patch('suppliers/{supplier}', [SupplierController::class, 'update'])
            ->middleware(PermissionMiddleware::using('suppliers.update'))->name('suppliers.update');
        Route::delete('suppliers/{supplier}', [SupplierController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('suppliers.delete'))->name('suppliers.destroy');

        Route::get('purchase-orders', [PurchaseOrderController::class, 'index'])
            ->middleware(PermissionMiddleware::using('suppliers.view'))->name('purchase-orders.index');
        Route::post('purchase-orders', [PurchaseOrderController::class, 'store'])
            ->middleware(PermissionMiddleware::using('suppliers.create'))->name('purchase-orders.store');
        Route::get('purchase-orders/{purchaseOrder}', [PurchaseOrderController::class, 'show'])
            ->middleware(PermissionMiddleware::using('suppliers.view'))->name('purchase-orders.show');
        Route::patch('purchase-orders/{purchaseOrder}', [PurchaseOrderController::class, 'update'])
            ->middleware(PermissionMiddleware::using('suppliers.update'))->name('purchase-orders.update');
        Route::delete('purchase-orders/{purchaseOrder}', [PurchaseOrderController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('suppliers.delete'))->name('purchase-orders.destroy');

        Route::post('purchase-orders/{purchaseOrder}/items', [PurchaseOrderController::class, 'addItem'])
            ->middleware(PermissionMiddleware::using('suppliers.update'))->name('purchase-orders.items.add');
        /*
         * The paperwork steps: sent, confirmed, cancelled.
         *
         * Deliberately not `receive` — that one moves stock and money and has
         * its own route below, so a permission that lets a buyer chase a
         * supplier is not also a permission to book a delivery in.
         */
        Route::post('purchase-orders/{purchaseOrder}/status', [PurchaseOrderController::class, 'transition'])
            ->middleware(PermissionMiddleware::using('suppliers.update'))->name('purchase-orders.status');
        Route::post('purchase-orders/{purchaseOrder}/receive', [PurchaseOrderController::class, 'receive'])
            ->middleware(PermissionMiddleware::using('suppliers.update'))->name('purchase-orders.receive');

        /*
         * Settling the invoice, and `suppliers.manage` rather than
         * `suppliers.update`.
         *
         * Receiving is a storekeeper's act — the van is at the door and the
         * boxes are real — and every role that can raise an order can confirm
         * one arrived. Paying is a decision about money leaving the business,
         * and the storekeeper who signed for the delivery is exactly the person
         * who should not also be able to mark it paid.
         */
        Route::post('purchase-orders/{purchaseOrder}/pay', [PurchaseOrderController::class, 'pay'])
            ->middleware(PermissionMiddleware::using('suppliers.manage'))->name('purchase-orders.pay');
    });
