<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Orders\Http\Controllers\BillActionController;
use Modules\Orders\Http\Controllers\ChannelSettingController;
use Modules\Orders\Http\Controllers\DeliveryController;
use Modules\Orders\Http\Controllers\IntakePolicyController;
use Modules\Orders\Http\Controllers\OrderController;
use Modules\Orders\Http\Controllers\OrderItemController;
use Modules\Orders\Http\Controllers\OrdersController;
use Modules\Orders\Http\Controllers\PublicOrderController;
use Modules\Orders\Http\Controllers\WaiterStatsController;
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
|
| Two exceptions, below: a guest ordering food from their own phone and then
| watching it come. No login — somebody reading a menu on a website has none —
| and tenancy is what scopes it, exactly as the public menu is scoped.
*/

// ============ Guest-facing (the customer app and the restaurant's site) ============
Route::middleware(['tenant', 'throttle:10,1'])
    ->prefix('v1/public')
    ->name('api.v1.public.')
    ->group(function (): void {
        /*
         * Ten a minute per address: more than a person ordering dinner needs,
         * far fewer than a script wants. The throttle is the outer belt; the
         * inner ones are that every price comes from the catalogue, that one
         * phone may have three orders open, and that a basket below the branch's
         * minimum is refused. See PublicOrderController.
         *
         * Inside the `tenant` group, so `EnsureIdempotency` applies and an
         * `Idempotency-Key` header is required. That is the belt that matters
         * most here: a guest on a lift's worth of signal taps "Buyurtma berish"
         * twice, and without the key the kitchen cooks two dinners.
         */
        Route::post('orders', [PublicOrderController::class, 'store'])->name('orders.store');

        /*
         * Your own history, and the only route in this group that needs a
         * customer token. A list keyed on anything a request can claim would be
         * an endpoint that hands over somebody's whole ordering history to
         * whoever knows their phone number. See PublicOrderController::index().
         *
         * The token is read by the core rather than by CRM's middleware: Orders
         * may not depend on CRM, and a venue running no loyalty scheme still
         * takes orders. See App\Support\Auth\GuestIdentity.
         */
        Route::get('orders', [PublicOrderController::class, 'index'])->name('orders.index');

        /*
         * Tracking. Guarded by the bill number AND the last four digits of the
         * number that placed it — the number alone is sequential per restaurant,
         * so `A-0041` is one keystroke from somebody else's address.
         */
        Route::get('orders/{number}', [PublicOrderController::class, 'show'])->name('orders.show');
    });

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

        /*
        |----------------------------------------------------------------------
        | Which doors are open
        |----------------------------------------------------------------------
        | The intake screen's channels tab. Reading is `orders.view` — an
        | operator has to know whether the website is taking orders before they
        | tell a guest to use it — and writing is `orders.manage`, because
        | shutting the website is a decision about the restaurant's trading
        | rather than about one bill.
        |
        | `{key}` is one of five fixed words, checked in the controller against
        | `ChannelSetting::KEYS` rather than by a route constraint: a regex in
        | the route would answer 404 with no envelope, and the console reads
        | `error.code` on everything else.
        */
        Route::get('channels', [ChannelSettingController::class, 'index'])
            ->middleware(PermissionMiddleware::using('orders.view'))->name('channels.index');
        Route::patch('channels/{key}', [ChannelSettingController::class, 'update'])
            ->middleware(PermissionMiddleware::using('orders.manage'))->name('channels.update');

        /*
        |----------------------------------------------------------------------
        | What happens to whatever comes through them
        |----------------------------------------------------------------------
        | The four automation switches and the prep-time picker in the same
        | column of the same tab. A separate path from `channels` because they
        | are a different grain: those are one row per door, this is one row per
        | venue, and a screen where switching Telegram off could change the
        | quoted prep time would be a screen with a bug rather than a feature.
        |
        | The same permission pair as the doors. Writing is `orders.manage`
        | rather than `system.settings` deliberately — this is the ORDER
        | OPERATOR'S home screen, and quoting a prep time is the most ordinary
        | thing that happens on that desk; the owner's settings document holds
        | the restaurant's legal identity and tax rates, which is not something
        | to hand out for a picker.
        |
        | `PUT` rather than `PATCH`, and the body is still partial. The console
        | writes one control at a time and the resource answers whole — see
        | `UpdateIntakePolicyRequest` on why every field is `sometimes`.
        */
        Route::get('intake-rules', [IntakePolicyController::class, 'show'])
            ->middleware(PermissionMiddleware::using('orders.view'))->name('intake-rules.show');
        Route::put('intake-rules', [IntakePolicyController::class, 'update'])
            ->middleware(PermissionMiddleware::using('orders.manage'))->name('intake-rules.update');

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

        /*
        |----------------------------------------------------------------------
        | Dispatch
        |----------------------------------------------------------------------
        | `deliveries` is the console's "Yetkazish" tab — who is out, and what
        | nobody has picked up. `assign-courier` puts one order on one rider.
        |
        | The board is `orders.view` because it is a read of orders this venue
        | already shows; assigning is `orders.manage`, which every waiter and
        | cashier deliberately does NOT hold. Adding a dish to a bill and
        | deciding whose evening carries it are different powers.
        */
        /*
        |----------------------------------------------------------------------
        | The back office's two bill actions
        |----------------------------------------------------------------------
        | `orders.manage`, which no waiter or cashier holds: at a till these are
        | `POST /pos/bills/{id}/discount` and `/transfer`, behind a PIN session,
        | and they stay there. This is the same operation asked by a different
        | person — see BillActionController for why it is an endpoint rather than
        | a proxy, and for how P9's signature rule follows it here.
        */
        Route::post('orders/{order}/discount', [BillActionController::class, 'discount'])
            ->middleware(PermissionMiddleware::using('orders.manage'))->name('orders.discount');
        Route::post('orders/{order}/transfer', [BillActionController::class, 'transfer'])
            ->middleware(PermissionMiddleware::using('orders.manage'))->name('orders.transfer');

        /*
        |----------------------------------------------------------------------
        | A courier's own round
        |----------------------------------------------------------------------
        | Declared before `deliveries` would be reached by a wildcard and kept
        | beside it because they are two views of one board: the dispatcher sees
        | everybody, a rider sees themselves.
        |
        | `orders.view` and not `orders.manage`, because a rider reading their
        | own drops is not dispatching anybody — the `courier` role holds exactly
        | `orders.view`, `orders.update` and `pos.view`, and this is the first of
        | those. The scoping is not the permission: the answer is derived from
        | the token, so there is no id a rider could type to read somebody
        | else's round.
        */
        Route::get('deliveries/mine', [DeliveryController::class, 'mine'])
            ->middleware(PermissionMiddleware::using('orders.view'))->name('deliveries.mine');

        Route::get('deliveries', [DeliveryController::class, 'board'])
            ->middleware(PermissionMiddleware::using('orders.view'))->name('deliveries.board');
        Route::post('orders/{order}/assign-courier', [DeliveryController::class, 'assign'])
            ->middleware(PermissionMiddleware::using('orders.manage'))->name('orders.assign-courier');

        /*
        |----------------------------------------------------------------------
        | One aggregate, for a screen in another module
        |----------------------------------------------------------------------
        | The staff roster's `sales` and `tickets` columns. Keyed by
        | `waiter_user_id` and joined in the console, because Staff may not
        | import Orders — see WaiterStatsController for the whole argument.
        */
        Route::get('stats/by-waiter', [WaiterStatsController::class, 'byWaiter'])
            ->middleware(PermissionMiddleware::using('orders.view'))->name('stats.by-waiter');

        // ---- Raw line access (kitchen and analytics read this) ----
        Route::get('items', [OrderItemController::class, 'index'])
            ->middleware(PermissionMiddleware::using('orders.view'))->name('items.index');
        Route::get('items/{item}', [OrderItemController::class, 'show'])
            ->middleware(PermissionMiddleware::using('orders.view'))->name('items.show');
        Route::patch('items/{item}', [OrderItemController::class, 'update'])
            ->middleware(PermissionMiddleware::using('orders.update'))->name('items.update');
    });
