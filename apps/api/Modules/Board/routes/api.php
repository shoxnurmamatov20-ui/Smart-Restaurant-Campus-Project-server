<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Board\Http\Controllers\BoardBannerController;
use Modules\Board\Http\Controllers\BoardColumnController;
use Modules\Board\Http\Controllers\BoardController;
use Modules\Board\Http\Controllers\BoardPreviewController;
use Modules\Board\Http\Controllers\BoardPushController;
use Modules\Board\Http\Controllers\BoardScreenController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Board module API routes
|--------------------------------------------------------------------------
| Mounted at /api/v1/board/* by RouteServiceProvider.
|
| One audience: the console, and the wall screens reading through it. Nothing
| here is public. That is worth stating because the content is — a menu board is
| the most public object a restaurant owns — but the CONFIGURATION is not, and
| `/v1/public/menu` already serves a guest everything a board shows.
|
| Every route sits behind `auth:sanctum` + `tenant` with a `board.*` permission.
| Reads roll up across venues when no `X-Branch` is sent; every write refuses
| without one, because a null branch_id on these tables reads back as EVERY
| venue rather than none. See StandsAtOneVenue.
*/

Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/board')
    ->name('api.v1.board.')
    ->group(function (): void {
        // Module info — authenticated, no extra permission needed.
        Route::get('/', [BoardController::class, 'index'])->name('info');

        /*
         * What the wall shows right now.
         *
         * `board.view` rather than a permission of its own: reading the preview
         * is reading the board, and anybody trusted to look at the list of
         * columns is trusted to see them drawn. It is also the endpoint the
         * screens themselves poll after a push.
         */
        Route::get('preview', BoardPreviewController::class)
            ->middleware(PermissionMiddleware::using('board.view'))
            ->name('preview');

        /*
         * Hand it over.
         *
         * `board.update` rather than `board.manage`. Pushing is not a stronger
         * power than editing — it is the second half of the same act, and a
         * person allowed to reorder the columns but not to let anybody see it
         * would be a person whose work never reaches the wall.
         */
        Route::post('push', BoardPushController::class)
            ->middleware(PermissionMiddleware::using('board.update'))
            ->name('push');

        // ---- Columns ----
        Route::get('columns', [BoardColumnController::class, 'index'])
            ->middleware(PermissionMiddleware::using('board.view'))
            ->name('columns.index');

        Route::post('columns', [BoardColumnController::class, 'store'])
            ->middleware(PermissionMiddleware::using('board.create'))
            ->name('columns.store');

        /*
         * Before `columns/{column}`, and it has to be.
         *
         * Laravel matches in declaration order, so a `reorder` registered after
         * the parameterised route would be swallowed by it — `{column}` matches
         * the literal string, the model binding fails, and the arrows answer 404
         * for a route that exists.
         */
        Route::post('columns/reorder', [BoardColumnController::class, 'reorder'])
            ->middleware(PermissionMiddleware::using('board.update'))
            ->name('columns.reorder');

        Route::patch('columns/{column}', [BoardColumnController::class, 'update'])
            ->middleware(PermissionMiddleware::using('board.update'))
            ->name('columns.update');

        Route::delete('columns/{column}', [BoardColumnController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('board.delete'))
            ->name('columns.destroy');

        // ---- Playlist ----
        Route::get('playlist', [BoardScreenController::class, 'index'])
            ->middleware(PermissionMiddleware::using('board.view'))
            ->name('playlist.index');

        Route::post('playlist', [BoardScreenController::class, 'store'])
            ->middleware(PermissionMiddleware::using('board.create'))
            ->name('playlist.store');

        // Before the parameterised route, for the reason above.
        Route::post('playlist/reorder', [BoardScreenController::class, 'reorder'])
            ->middleware(PermissionMiddleware::using('board.update'))
            ->name('playlist.reorder');

        Route::patch('playlist/{screen}', [BoardScreenController::class, 'update'])
            ->middleware(PermissionMiddleware::using('board.update'))
            ->name('playlist.update');

        Route::delete('playlist/{screen}', [BoardScreenController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('board.delete'))
            ->name('playlist.destroy');

        // ---- Banners ----
        Route::get('banners', [BoardBannerController::class, 'index'])
            ->middleware(PermissionMiddleware::using('board.view'))
            ->name('banners.index');

        Route::post('banners', [BoardBannerController::class, 'store'])
            ->middleware(PermissionMiddleware::using('board.create'))
            ->name('banners.store');

        Route::patch('banners/{banner}', [BoardBannerController::class, 'update'])
            ->middleware(PermissionMiddleware::using('board.update'))
            ->name('banners.update');

        Route::delete('banners/{banner}', [BoardBannerController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('board.delete'))
            ->name('banners.destroy');
    });
