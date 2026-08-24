<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Menu\Http\Controllers\MenuCategoryController;
use Modules\Menu\Http\Controllers\MenuController;
use Modules\Menu\Http\Controllers\MenuImportController;
use Modules\Menu\Http\Controllers\MenuItemController;
use Modules\Menu\Http\Controllers\MenuTemplateController;
use Modules\Menu\Http\Controllers\ModifierGroupController;
use Modules\Menu\Http\Controllers\PublicMenuController;
use Modules\Menu\Http\Controllers\RecipeController;
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

        /*
         * The dish's photograph. Multipart, one file, 12 MB; the platform makes
         * the sizes a menu is drawn at and keeps nothing as it arrived.
         *
         * `menu.update` rather than `menu.create`, because replacing the picture
         * of a dish that already exists is editing it — and because a person
         * trusted to change what a dish costs is already trusted to change what
         * it looks like. Removing it sits on the same permission for the same
         * reason.
         */
        Route::post('items/{item}/image', [MenuItemController::class, 'image'])
            ->middleware(PermissionMiddleware::using('menu.update'))
            ->name('items.image');

        Route::delete('items/{item}/image', [MenuItemController::class, 'removeImage'])
            ->middleware(PermissionMiddleware::using('menu.update'))
            ->name('items.image.remove');

        // ---- Stop-list ----
        // A cook must be able to pull a dish instantly, so this sits on
        // 'menu.update' rather than the stricter 'menu.manage'.
        Route::post('items/{item}/stop', [MenuItemController::class, 'stop'])
            ->middleware(PermissionMiddleware::using('menu.update'))
            ->name('items.stop');

        Route::post('items/{item}/resume', [MenuItemController::class, 'resume'])
            ->middleware(PermissionMiddleware::using('menu.update'))
            ->name('items.resume');

        /*
         * ---- Spreadsheet import ----
         *
         * Multipart CSV, one file. `menu.create` rather than `menu.update`,
         * because an import's whole purpose is dishes that are not there yet —
         * and because the permission has to cover the worst thing the endpoint
         * can do, which is create two hundred of them.
         *
         * It writes nothing unless the caller sends `dry_run=false`; the
         * default answer is a validation report. See MenuImportController.
         */
        Route::post('import', MenuImportController::class)
            ->middleware(PermissionMiddleware::using('menu.create'))
            ->name('import');

        /*
         * ---- Starter template ----
         *
         * The other way a menu arrives: a restaurant with no list at all gets
         * one written for it. `menu.create` for the same reason the import
         * carries it — the worst thing it can do is create sixty-eight dishes.
         * Idempotent by skipping; see Services\StarterMenu.
         */
        Route::post('seed-template', MenuTemplateController::class)
            ->middleware(PermissionMiddleware::using('menu.create'))
            ->name('seed-template');

        /*
         * ---- Modifier groups ----
         *
         * The staff-facing cut of the sheets the till and the QR menu already
         * read per dish: every group once, with the number of dishes on it. The
         * console's Modifiers tab had no read at all and drew the design's three
         * groups over live restaurants.
         */
        Route::get('modifier-groups', [ModifierGroupController::class, 'index'])
            ->middleware(PermissionMiddleware::using('menu.view'))
            ->name('modifier-groups.index');

        /*
         * ---- Technical cards ----
         *
         * What a dish is made of, costed against what the shelf costs today.
         * `menu.view`, because a recipe card is the menu — the component names
         * and prices arrive through App\Contracts\Inventory\ShelfCosts rather
         * than from a table this permission would have to also cover.
         */
        Route::get('recipes', [RecipeController::class, 'index'])
            ->middleware(PermissionMiddleware::using('menu.view'))
            ->name('recipes.index');

        Route::get('items/{item}/recipe', [RecipeController::class, 'show'])
            ->middleware(PermissionMiddleware::using('menu.view'))
            ->name('items.recipe');
    });
