<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Marketplace\Http\Controllers\ConsumerAuthController;
use Modules\Marketplace\Http\Controllers\ConsumerOrderController;
use Modules\Marketplace\Http\Controllers\ConsumerPlusController;
use Modules\Marketplace\Http\Controllers\ConsumerProfileController;
use Modules\Marketplace\Http\Controllers\ConsumerPushController;
use Modules\Marketplace\Http\Controllers\MarketplaceController;
use Modules\Marketplace\Http\Controllers\MerchantCatalogueController;
use Modules\Marketplace\Http\Controllers\MerchantDeliveryZoneController;
use Modules\Marketplace\Http\Controllers\MerchantDisputeController;
use Modules\Marketplace\Http\Controllers\MerchantOrderController;
use Modules\Marketplace\Http\Controllers\MerchantPayoutController;
use Modules\Marketplace\Http\Controllers\MerchantPlacementController;
use Modules\Marketplace\Http\Controllers\MerchantPromotionController;
use Modules\Marketplace\Http\Controllers\MerchantSettlementController;
use Modules\Marketplace\Http\Controllers\MerchantStoreController;
use Modules\Marketplace\Http\Controllers\Platform\PlacementBoardController;
use Modules\Marketplace\Http\Controllers\Platform\StoreReviewController;
use Modules\Marketplace\Http\Controllers\StorefrontController;
use Spatie\Permission\Middleware\PermissionMiddleware;
use Spatie\Permission\Middleware\RoleMiddleware;

/*
|--------------------------------------------------------------------------
| Marketplace — two surfaces, two completely different sets of rules
|--------------------------------------------------------------------------
|
| This is the only module on the platform that mounts routes outside its own
| prefix, and the reason is that it serves two audiences who share nothing:
|
|   /api/v1/marketplace/*   the MERCHANT panel. A restaurant employee, with a
|                           restaurant, behind auth:sanctum + tenant + a Spatie
|                           permission — identical to every other console
|                           endpoint here, and needing no exemption anywhere.
|
|   /api/v1/mp/*            the CONSUMER surface. Somebody who has not chosen a
|                           restaurant yet, or who orders from four of them.
|                           There is no `X-Tenant` they could send, so these
|                           routes carry no `tenant` group and every one of them
|                           is named in TenancyClaimTest with its reason.
|
| `ModuleBoundaryTest` requires a module's routes to be under its own prefix and
| checks for `prefix('v1/marketplace` — which the merchant block below is. The
| consumer block is a second, deliberate mount, and the short segment is the
| point: `mp` is what the design's URLs use, it is what the mobile app builds
| deep links against (`srcp://mp/track`), and it is short enough to be typed.
|
|--------------------------------------------------------------------------
| Idempotency
|--------------------------------------------------------------------------
|
| The merchant block gets it from the `tenant` group, like everywhere else.
|
| The consumer block cannot have it at all, and that is a database fact rather
| than an omission: `EnsureIdempotency` claims a key against a tenant,
| `public.idempotency_keys` is behind row-level security, and a claim with a
| null tenant on a fail-closed connection is refused by the policy — the write
| never happens and the guest is told the platform is broken.
|
| So the guarantee moved into the data, which is where the payment callbacks
| already keep theirs. `POST /mp/orders` is idempotent under a unique
| `(consumer_id, client_reference)` index; the address book is a PUT of the whole
| list; a rating and a cancellation are refused the second time by the order's
| own state. `IdempotencyCoverageTest` records the exemption with that reason.
*/

// ============ The merchant panel ============

Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/marketplace')
    ->name('api.v1.marketplace.')
    ->group(function (): void {
        Route::get('/', [MarketplaceController::class, 'index'])->name('info');

        /*
         * The ninety-second queue, and the one endpoint that moves an order.
         *
         * `update` rather than /accept, /reject, /ready: the ladder already
         * knows which moves are legal from where, and four endpoints would each
         * ask it the same question and then drift from it.
         */
        Route::get('orders', [MerchantOrderController::class, 'index'])
            ->middleware(PermissionMiddleware::using('marketplace.view'))->name('orders.index');
        /*
         * Bound by id, explicitly. `MarketOrder::getRouteKeyName()` answers
         * `number`, which is right for everything a guest touches — an id is a
         * counter a stranger can walk — and wrong here: the merchant panel holds
         * the row it is looking at and a console surface has no reason to make
         * the round trip through a printed number.
         */
        Route::patch('orders/{order:id}', [MerchantOrderController::class, 'update'])
            ->middleware(PermissionMiddleware::using('marketplace.update'))->name('orders.update');

        Route::get('catalogue', [MerchantCatalogueController::class, 'index'])
            ->middleware(PermissionMiddleware::using('marketplace.view'))->name('catalogue.index');
        Route::patch('catalogue', [MerchantCatalogueController::class, 'update'])
            ->middleware(PermissionMiddleware::using('marketplace.update'))->name('catalogue.update');

        Route::get('settlements', [MerchantSettlementController::class, 'index'])
            ->middleware(PermissionMiddleware::using('marketplace.view'))->name('settlements.index');
        /*
         * One statement, opened up — the orders it paid for and the document a
         * merchant hands to an accountant. The printable version is the
         * documents surface (`/documents?d=settlement&id=`), which reads this.
         */
        Route::get('settlements/{settlement}', [MerchantSettlementController::class, 'show'])
            ->middleware(PermissionMiddleware::using('marketplace.view'))->name('settlements.show');

        Route::get('disputes', [MerchantDisputeController::class, 'index'])
            ->middleware(PermissionMiddleware::using('marketplace.view'))->name('disputes.index');
        Route::patch('disputes/{dispute}', [MerchantDisputeController::class, 'update'])
            ->middleware(PermissionMiddleware::using('marketplace.update'))->name('disputes.update');

        Route::get('performance', [MerchantStoreController::class, 'performance'])
            ->middleware(PermissionMiddleware::using('marketplace.view'))->name('performance');

        Route::get('promotions', [MerchantPromotionController::class, 'index'])
            ->middleware(PermissionMiddleware::using('marketplace.view'))->name('promotions.index');
        Route::post('promotions', [MerchantPromotionController::class, 'store'])
            ->middleware(PermissionMiddleware::using('marketplace.create'))->name('promotions.store');
        /*
         * Pause, resume, cancel and re-budget — one endpoint, because all four
         * are the same row moving and four endpoints would each keep their own
         * idea of which moves are legal. The POST above is not a substitute:
         * it CREATES, and pausing through a create leaves the running offer
         * running with a second one beside it.
         */
        Route::patch('promotions/{promotion}', [MerchantPromotionController::class, 'update'])
            ->middleware(PermissionMiddleware::using('marketplace.update'))->name('promotions.update');

        /*
         * Paid placement — the one thing on this platform sold by the day.
         * Booking is a `create` and releasing is an `update`, deliberately:
         * cancelling a banner costs money (the days it ran are billed inside
         * the weekly statement) and is not the same power as buying one.
         */
        Route::get('placements', [MerchantPlacementController::class, 'index'])
            ->middleware(PermissionMiddleware::using('marketplace.view'))->name('placements.index');
        Route::post('placements', [MerchantPlacementController::class, 'store'])
            ->middleware(PermissionMiddleware::using('marketplace.create'))->name('placements.store');
        Route::delete('placements/{placement}', [MerchantPlacementController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('marketplace.update'))->name('placements.destroy');

        /*
         * How far a courier will ride. `manage` on the write for the same
         * reason the delivery fee is: a boundary is a commercial decision, and
         * the person answering the telephone at eight should not redraw it.
         */
        Route::get('delivery-zones', [MerchantDeliveryZoneController::class, 'index'])
            ->middleware(PermissionMiddleware::using('marketplace.view'))->name('delivery-zones.index');
        Route::put('delivery-zones', [MerchantDeliveryZoneController::class, 'update'])
            ->middleware(PermissionMiddleware::using('marketplace.manage'))->name('delivery-zones.update');

        /*
         * `manage` rather than `update` on the settings write, and the split is
         * the control: `update` is a shift manager marking the shop closed for
         * the evening, which happens every night. Changing the delivery fee, the
         * minimum basket or the window is a commercial decision, and the person
         * answering the phone at eight should not be the one who makes it.
         */
        Route::get('settings', [MerchantStoreController::class, 'show'])
            ->middleware(PermissionMiddleware::using('marketplace.view'))->name('settings.show');
        Route::patch('settings', [MerchantStoreController::class, 'update'])
            ->middleware(PermissionMiddleware::using('marketplace.manage'))->name('settings.update');

        /*
         * The bank account a week's takings land in — `manage` on the READ as
         * well as the write, which is the only read in this module that is not
         * `view`. Bank details are the owner's, and a screen a shift manager can
         * open is an account number over somebody's shoulder.
         */
        Route::get('settings/payout', [MerchantPayoutController::class, 'show'])
            ->middleware(PermissionMiddleware::using('marketplace.manage'))->name('settings.payout.show');
        Route::put('settings/payout', [MerchantPayoutController::class, 'update'])
            ->middleware(PermissionMiddleware::using('marketplace.manage'))->name('settings.payout.update');
    });

/*
|--------------------------------------------------------------------------
| The platform operator's half of the marketplace
|--------------------------------------------------------------------------
|
| A third mount, and the third audience. `role:super-admin` and NOT a
| permission, because there is no permission a restaurant could hold that
| should open these: verifying your own bank account is not a review, and a
| merchant who could read the whole hoarding would know what every competitor
| paid for Friday.
|
| Inside the `tenant` group like the rest of the platform console —
| `ResolveTenant` recognises the operator (tenant_id null, super-admin) and
| OPENS the row-level-security policies for them. Mounted outside it, every
| query here would read zero rows and every screen would draw empty.
*/
Route::middleware(['auth:sanctum', 'tenant', RoleMiddleware::using('super-admin')])
    ->prefix('v1/platform/marketplace')
    ->name('api.v1.platform.marketplace.')
    ->group(function (): void {
        Route::get('stores', [StoreReviewController::class, 'index'])->name('stores.index');
        Route::patch('stores/{store:id}/verify', [StoreReviewController::class, 'verify'])->name('stores.verify');

        Route::get('placements', PlacementBoardController::class)->name('placements');
    });

// ============ The consumer surface ============

Route::prefix('v1/mp')
    ->name('api.v1.mp.')
    ->group(function (): void {
        /*
         * The shop window. Anonymous, and the only two endpoints on this
         * platform that are both anonymous and cross-tenant — see
         * StorefrontController for why that is safe and what it costs.
         *
         * Throttled per address rather than per account, because there is no
         * account: sixty a minute is a person browsing, and a scraper walking
         * the whole directory is what the ceiling is for.
         */
        Route::get('stores', [StorefrontController::class, 'index'])
            ->middleware('throttle:60,1')->name('stores.index');
        Route::get('stores/{store}', [StorefrontController::class, 'show'])
            ->middleware('throttle:60,1')->name('stores.show');

        /*
         * The front door. Every send is a paid SMS, so the address limit here
         * is the one that catches a script working through a list of numbers —
         * the per-number limit inside OtpCredentials is what protects any one
         * person's inbox, and it is shared with every other surface on the
         * platform on purpose.
         */
        Route::post('auth/otp', [ConsumerAuthController::class, 'request'])
            ->middleware('throttle:5,1')->name('auth.otp');
        Route::post('auth/otp/verify', [ConsumerAuthController::class, 'verify'])
            ->middleware('throttle:10,1')->name('auth.verify');

        /*
         * Everything behind a customer's own token.
         *
         * `auth:sanctum` does the ordinary job — `marketplace.consumers` carries
         * no tenant_id and no policy, so Sanctum may read it before any tenant
         * is resolved, which is exactly what CRM's guest table may NOT do.
         * `mp.consumer` adds the part Sanctum does not: that this is a
         * customer's token and not a waiter's.
         */
        Route::middleware(['auth:sanctum', 'mp.consumer'])->group(function (): void {
            Route::get('me', [ConsumerProfileController::class, 'show'])->name('me.show');
            Route::patch('me', [ConsumerProfileController::class, 'update'])->name('me.update');
            Route::put('me/addresses', [ConsumerProfileController::class, 'saveAddresses'])->name('me.addresses');
            Route::get('plus', [ConsumerPlusController::class, 'show'])->name('plus');
            /*
             * Starting and stopping the subscription. Throttled like the other
             * writes on this surface: a double tap must not open two months.
             * The charge is one month at a time — see the controller for why a
             * standing order is a contract with a provider rather than a route.
             */
            Route::post('plus/subscribe', [ConsumerPlusController::class, 'subscribe'])
                ->middleware('throttle:10,1')->name('plus.subscribe');
            Route::post('plus/cancel', [ConsumerPlusController::class, 'cancel'])
                ->middleware('throttle:10,1')->name('plus.cancel');

            /*
             * Where the courier notice is sent. Its own route rather than the
             * core `push/tokens`, which stamps the caller's tenant on the row —
             * a marketplace shopper has none. See `ConsumerPushController`.
             */
            Route::post('push/tokens', [ConsumerPushController::class, 'store'])->name('push.register');
            Route::delete('push/tokens', [ConsumerPushController::class, 'destroy'])->name('push.forget');

            Route::get('orders', [ConsumerOrderController::class, 'index'])->name('orders.index');
            Route::get('orders/{number}', [ConsumerOrderController::class, 'show'])->name('orders.show');

            /*
             * Placing an order is the one write on this surface that costs real
             * money if it happens twice. Throttled hard, and made idempotent by
             * `client_reference` rather than by a header — see the block comment
             * at the top of this file for why the header cannot work here.
             */
            Route::post('orders', [ConsumerOrderController::class, 'store'])
                ->middleware('throttle:10,1')->name('orders.store');

            Route::post('orders/{number}/cancel', [ConsumerOrderController::class, 'cancel'])
                ->middleware('throttle:10,1')->name('orders.cancel');
            Route::post('orders/{number}/rate', [ConsumerOrderController::class, 'rate'])
                ->middleware('throttle:10,1')->name('orders.rate');
            Route::post('orders/{number}/dispute', [ConsumerOrderController::class, 'dispute'])
                ->middleware('throttle:10,1')->name('orders.dispute');
        });
    });
