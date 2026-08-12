<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\TelegramBots\Http\Controllers\BotApiController;

/*
|--------------------------------------------------------------------------
| TelegramBots module API routes
|--------------------------------------------------------------------------
| Mounted at /api/v1/* by RouteServiceProvider.
|
| One route group: /v1/bots/{botKey}/* — internal endpoints called by the
| Python telegram-bots service. Auth: shared LARAVEL_INTERNAL_TOKEN via the
| `internal.bots` middleware (alias registered in
| TelegramBotsServiceProvider::boot()).
|
| There was a second group here — `apiResource('telegrambots')` onto the
| controller `module:make` generates — and it was three things at once: dead,
| wrong, and open. Dead because nothing called it: the admin console manages
| bots through its own screens and the dispatcher uses /v1/bots/*. Wrong
| because the scaffold's `index()` returns a blade view and its `store()` has
| an empty body, so an /api/ route answered with HTML and wrote nothing. Open
| because it carried `auth:sanctum` alone — no `tenant`, so outside the
| isolation every other route has, and no permission, so a waiter could reach
| POST and DELETE on it.
|
| Removed rather than guarded: an endpoint that does nothing does not need a
| permission, it needs to not exist. The controller and its views are still on
| disk, unrouted; delete them when convenient. ModuleRouteGuardTest is what
| stops the next generated module from mounting the same thing.
*/

// ============ Internal endpoints (called by apps/telegram-bots) ============
Route::middleware(['internal.bots'])
    ->prefix('v1/bots/{botKey}')
    ->name('api.v1.bots.')
    ->group(function () {
        // User linking & lookups
        Route::post('users/link', [BotApiController::class, 'link'])->name('users.link');
        Route::get('users/{telegramId}', [BotApiController::class, 'getLinkedUser'])
            ->where('telegramId', '[0-9]+')
            ->name('users.show');

        // Analytics
        Route::post('commands/log', [BotApiController::class, 'logCommand'])->name('commands.log');

        // Guest-facing reads that need no linked account
        Route::get('menu', [BotApiController::class, 'menu'])->name('menu');
        Route::post('feedback', [BotApiController::class, 'storeFeedback'])->name('feedback.store');

        // Everything scoped to the linked user (guest or staff).
        // Some of these still read from skeleton modules — see the
        // `telegrambots.mock_data` flag.
        Route::prefix('me')->name('me.')->group(function () {
            // Guest
            Route::get('orders', [BotApiController::class, 'myOrders'])->name('orders');
            Route::get('loyalty', [BotApiController::class, 'myLoyalty'])->name('loyalty');

            // Waiter / floor
            Route::get('tables', [BotApiController::class, 'myTables'])->name('tables');
            Route::get('ready', [BotApiController::class, 'myReadyTickets'])->name('ready');
            Route::get('calls', [BotApiController::class, 'myGuestCalls'])->name('calls');
            Route::get('shift', [BotApiController::class, 'myShift'])->name('shift');
        });
    });
