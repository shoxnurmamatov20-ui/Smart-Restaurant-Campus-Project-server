<?php

declare(strict_types=1);

use App\Http\Middleware\RefineLocale;
use App\Http\Middleware\ResolveBranch;
use App\Http\Middleware\ResolveTenant;
use Illuminate\Support\Facades\Route;
use Modules\TelegramBots\Http\Controllers\BotApiController;
use Modules\TelegramBots\Http\Controllers\NotificationRuleController;
use Spatie\Permission\Middleware\PermissionMiddleware;

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
Route::middleware([
    'internal.bots',

    /*
     * The same tenant resolution every other route gets, and for the same
     * reason: `X-Tenant` names the restaurant, and with row-level security
     * live, a request that never says which restaurant it is reads nothing.
     * These routes had none, so every bot endpoint answered 404 on a key that
     * exists.
     *
     * `ResolveBranch` and `RefineLocale` come along because a bot serves one
     * venue and one guest's language; `EnsureIdempotency` deliberately does
     * not — the aiogram client does not send a key yet, and turning that on
     * here would refuse every write the bots make. That exemption is recorded
     * in IdempotencyCoverageTest with the same reason.
     */
    ResolveTenant::class,
    ResolveBranch::class,
    RefineLocale::class,

    'bots.tenant',
])
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

/*
|--------------------------------------------------------------------------
| Console: which chat hears about what
|--------------------------------------------------------------------------
| The settings screen's notification panel. A different kind of caller from
| everything above: a signed-in manager rather than the Python dispatcher, so
| the ordinary `auth:sanctum` + `tenant` group and a Spatie permission.
|
| `telegram.manage` on every write and `telegram.view` on the read, which is
| what the marketer and the owner already hold. Deliberately NOT `system.*`:
| deciding that the managers' group hears about voids is running a restaurant,
| not administering a platform.
*/
Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/telegram')
    ->name('api.v1.telegram.')
    ->group(function (): void {
        Route::get('notification-rules', [NotificationRuleController::class, 'index'])
            ->middleware(PermissionMiddleware::using('telegram.view'))->name('rules.index');
        Route::post('notification-rules', [NotificationRuleController::class, 'store'])
            ->middleware(PermissionMiddleware::using('telegram.manage'))->name('rules.store');
        Route::patch('notification-rules/{rule}', [NotificationRuleController::class, 'update'])
            ->middleware(PermissionMiddleware::using('telegram.manage'))->name('rules.update');
        Route::delete('notification-rules/{rule}', [NotificationRuleController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('telegram.manage'))->name('rules.destroy');

        /*
         * Send one now.
         *
         * `telegram.manage` rather than `telegram.view`: it puts a message in
         * somebody's chat, and a permission that only reads should not be able
         * to make a phone buzz.
         */
        Route::post('notification-rules/{rule}/test', [NotificationRuleController::class, 'test'])
            ->middleware(PermissionMiddleware::using('telegram.manage'))->name('rules.test');

        // Is the token real, and whose bot is it? Telegram's own `getMe`.
        Route::post('bots/{bot}/test', [NotificationRuleController::class, 'testBot'])
            ->middleware(PermissionMiddleware::using('telegram.manage'))->name('bots.test');
    });
