<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Inventory\Http\Controllers\IngredientController;
use Modules\Inventory\Http\Controllers\InventoryController;
use Modules\Inventory\Http\Controllers\PrepController;
use Modules\Inventory\Http\Controllers\StockMovementController;
use Modules\Inventory\Http\Controllers\StockTransferController;
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

        /*
         * ---- Lookup ----
         *
         * Before the CRUD routes, and it has to be: `ingredients/{ingredient}`
         * would otherwise swallow nothing here, but `items` is a sibling
         * segment and the ordering is what keeps it one.
         *
         * `items` rather than `ingredients/search` because it is what the staff
         * app already asks for by name — the scanner's TODO names this URL.
         */
        Route::get('items', [IngredientController::class, 'lookup'])
            ->middleware(PermissionMiddleware::using('inventory.view'))->name('items.lookup');

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

        /*
         * ---- Counting ----
         *
         * The store screen's correction drawer and the operations tab's count
         * sheet are the same act at two sizes, so they are one route. See
         * StoreStockCountRequest.
         */
        Route::post('counts', [IngredientController::class, 'count'])
            ->middleware(PermissionMiddleware::using('inventory.update'))->name('counts.store');

        // ---- Movement history (read-only) ----
        Route::get('movements', [StockMovementController::class, 'index'])
            ->middleware(PermissionMiddleware::using('inventory.view'))->name('movements.index');
        Route::get('movements/{movement}', [StockMovementController::class, 'show'])
            ->middleware(PermissionMiddleware::using('inventory.view'))->name('movements.show');

        /*
         * ---- Transfers ----
         *
         * Three verbs because a transfer is three moments: written,
         * dispatched, arrived. `send` and `receive` are POSTs on a noun rather
         * than a PATCH of `status`, because neither is an edit — each posts a
         * leg of stock, and a client that could PATCH its way from `draft` to
         * `received` would move the destination's shelf without ever emptying
         * the origin's.
         *
         * `inventory.update` rather than a new permission: moving stock between
         * two of your own venues is the same power as writing one off, and the
         * storekeeper who does the first does the second.
         */
        Route::get('transfers', [StockTransferController::class, 'index'])
            ->middleware(PermissionMiddleware::using('inventory.view'))->name('transfers.index');
        Route::post('transfers', [StockTransferController::class, 'store'])
            ->middleware(PermissionMiddleware::using('inventory.update'))->name('transfers.store');
        Route::get('transfers/{transfer}', [StockTransferController::class, 'show'])
            ->middleware(PermissionMiddleware::using('inventory.view'))->name('transfers.show');
        Route::post('transfers/{transfer}/send', [StockTransferController::class, 'send'])
            ->middleware(PermissionMiddleware::using('inventory.update'))->name('transfers.send');
        Route::post('transfers/{transfer}/receive', [StockTransferController::class, 'receive'])
            ->middleware(PermissionMiddleware::using('inventory.update'))->name('transfers.receive');

        /*
         * ---- Prep ----
         *
         * `POST prep` is production, not creation: the body names a card and a
         * number of batches, and what it writes is a consumption on every
         * component plus a rise in `on_hand`. Creating a CARD is a different
         * act with different stakes — it changes what every dish costs — so it
         * has its own door below, `POST prep-items`, behind a heavier
         * permission.
         */
        Route::get('prep', [PrepController::class, 'index'])
            ->middleware(PermissionMiddleware::using('inventory.view'))->name('prep.index');
        Route::post('prep', [PrepController::class, 'produce'])
            ->middleware(PermissionMiddleware::using('inventory.update'))->name('prep.produce');

        /*
         * And the act the comment above says `POST prep` is not: creating the
         * card itself. `inventory.create` rather than `update`, because what it
         * writes is a new row that changes what every dish containing it costs
         * — a heavier thing than producing a batch of one that already exists.
         */
        Route::post('prep-items', [PrepController::class, 'storeItem'])
            ->middleware(PermissionMiddleware::using('inventory.create'))->name('prep-items.store');

        /*
         * ---- Deliveries ----
         *
         * A purchase order, accepted from the store room rather than from the
         * purchasing screen. Same verb, same implementation — the `Receiving`
         * contract — because "receive twice" doubles both the shelf and the
         * debt and can only be refused inside one row lock.
         *
         * `suppliers.update` and not `inventory.update`: what this closes is a
         * supplier's order and what it grows is a supplier's debt. A
         * storekeeper who may write stock off must not be able to settle a
         * purchase they never placed.
         */
        Route::post('deliveries/{delivery}/accept', [PrepController::class, 'accept'])
            ->middleware(PermissionMiddleware::using('suppliers.update'))->name('deliveries.accept');
    });
