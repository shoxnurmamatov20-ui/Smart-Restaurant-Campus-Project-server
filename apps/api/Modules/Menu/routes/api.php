<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Menu\Http\Controllers\MenuCategoryController;
use Modules\Menu\Http\Controllers\MenuController;
use Modules\Menu\Http\Controllers\MenuItemController;
use Modules\Menu\Http\Controllers\PublicMenuController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Menu module API routes
|--------------------------------------------------------------------------
| Mounted at /api/v1/menu/* by RouteServiceProvider.
|
| Two audiences:
|   1. Staff — everything below /v1/menu, behind auth:sanctum + tenant, with a
|      Spatie permission per action.
|   2. Guests — /v1/public/menu, the QR-code menu. No login, tenant-scoped,
|      read-only, and it only ever exposes sellable items.
|
| The canonical role -> permission map lives in RolesAndPermissionsSeeder.
*/

// ============ Guest-facing (QR menu) ============
Route::middleware(['tenant'])
    ->prefix('v1/public')
    ->name('api.v1.public.')
    ->group(function (): void {
        Route::get('menu', PublicMenuController::class)->name('menu');
    });

// ============ Staff-facing ============
Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/menu')
    ->name('api.v1.menu.')
    ->group(function (): void {
        // Module info — authenticated, no extra permission needed.
        Route::get('/', [MenuController::class, 'index'])->name('info');

        // ---- Categories ----
        Route::get('categories', [MenuCategoryController::class, 'index'])
            ->middleware(PermissionMiddleware::using('menu.view'))
            ->name('categories.index');

        Route::post('categories', [MenuCategoryController::class, 'store'])
            ->middleware(PermissionMiddleware::using('menu.create'))
            ->name('categories.store');

        Route::get('categories/{category}', [MenuCategoryController::class, 'show'])
            ->middleware(PermissionMiddleware::using('menu.view'))
            ->name('categories.show');

        Route::patch('categories/{category}', [MenuCategoryController::class, 'update'])
            ->middleware(PermissionMiddleware::using('menu.update'))
            ->name('categories.update');

        Route::delete('categories/{category}', [MenuCategoryController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('menu.delete'))
            ->name('categories.destroy');

        // ---- Items ----
        Route::get('items', [MenuItemController::class, 'index'])
            ->middleware(PermissionMiddleware::using('menu.view'))
            ->name('items.index');

        Route::post('items', [MenuItemController::class, 'store'])
            ->middleware(PermissionMiddleware::using('menu.create'))
            ->name('items.store');

        Route::get('items/{item}', [MenuItemController::class, 'show'])
            ->middleware(PermissionMiddleware::using('menu.view'))
            ->name('items.show');

        Route::patch('items/{item}', [MenuItemController::class, 'update'])
            ->middleware(PermissionMiddleware::using('menu.update'))
            ->name('items.update');

        Route::delete('items/{item}', [MenuItemController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('menu.delete'))
            ->name('items.destroy');

        // ---- Stop-list ----
        // A cook must be able to pull a dish instantly, so this sits on
        // 'menu.update' rather than the stricter 'menu.manage'.
        Route::post('items/{item}/stop', [MenuItemController::class, 'stop'])
            ->middleware(PermissionMiddleware::using('menu.update'))
            ->name('items.stop');

        Route::post('items/{item}/resume', [MenuItemController::class, 'resume'])
            ->middleware(PermissionMiddleware::using('menu.update'))
            ->name('items.resume');
    });
