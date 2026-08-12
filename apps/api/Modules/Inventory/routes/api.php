<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Inventory\Http\Controllers\IngredientController;
use Modules\Inventory\Http\Controllers\InventoryController;
use Modules\Inventory\Http\Controllers\StockMovementController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Inventory module API routes
|--------------------------------------------------------------------------
| Mounted at /api/v1/inventory/* by RouteServiceProvider.
|
| Movements are create-only through the ingredient endpoint: the running
| balance must never be written by hand, or the audit trail stops meaning
| anything.
*/

Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/inventory')
    ->name('api.v1.inventory.')
    ->group(function (): void {
        Route::get('/', [InventoryController::class, 'index'])->name('info');

        // ---- Ingredients ----
        Route::get('ingredients', [IngredientController::class, 'index'])
            ->middleware(PermissionMiddleware::using('inventory.view'))->name('ingredients.index');
        Route::post('ingredients', [IngredientController::class, 'store'])
            ->middleware(PermissionMiddleware::using('inventory.create'))->name('ingredients.store');
        Route::get('ingredients/{ingredient}', [IngredientController::class, 'show'])
            ->middleware(PermissionMiddleware::using('inventory.view'))->name('ingredients.show');
        Route::patch('ingredients/{ingredient}', [IngredientController::class, 'update'])
            ->middleware(PermissionMiddleware::using('inventory.update'))->name('ingredients.update');
        Route::delete('ingredients/{ingredient}', [IngredientController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('inventory.delete'))->name('ingredients.destroy');

        // ---- Stock movement ----
        Route::post('ingredients/{ingredient}/movements', [IngredientController::class, 'move'])
            ->middleware(PermissionMiddleware::using('inventory.update'))->name('ingredients.move');

        // ---- Movement history (read-only) ----
        Route::get('movements', [StockMovementController::class, 'index'])
            ->middleware(PermissionMiddleware::using('inventory.view'))->name('movements.index');
        Route::get('movements/{movement}', [StockMovementController::class, 'show'])
            ->middleware(PermissionMiddleware::using('inventory.view'))->name('movements.show');
    });
