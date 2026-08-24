<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Crm\Http\Controllers\CampaignController;
use Modules\Crm\Http\Controllers\CaseController;
use Modules\Crm\Http\Controllers\CrmController;
use Modules\Crm\Http\Controllers\CustomerAccountController;
use Modules\Crm\Http\Controllers\CustomerController;
use Modules\Crm\Http\Controllers\FeedbackController;
use Modules\Crm\Http\Controllers\LeadController;
use Modules\Crm\Http\Controllers\LoyaltyTransactionController;
use Modules\Crm\Http\Controllers\PromoCodeController;
use Modules\Crm\Http\Controllers\PromotionController;
use Modules\Crm\Http\Controllers\PublicCouponController;
use Modules\Crm\Http\Controllers\PublicCustomerAddressController;
use Modules\Crm\Http\Controllers\PublicCustomerAuthController;
use Modules\Crm\Http\Controllers\PublicCustomerController;
use Modules\Crm\Http\Controllers\PublicFeedbackController;
use Modules\Crm\Http\Controllers\PublicLeadController;
use Modules\Crm\Http\Controllers\PublicPromoCodeController;
use Modules\Crm\Http\Controllers\PublicPushTokenController;
use Modules\Crm\Http\Controllers\PublicTelegramAuthController;
use Modules\Crm\Http\Controllers\TriggerController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| CRM module API routes — /api/v1/crm/*
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Guest-facing — /api/v1/public/*
|--------------------------------------------------------------------------
| Everything a person who is not staff can reach. Three kinds of caller live
| here and they authenticate differently:
|
|   1. Nobody at all — signing in, leaving a review, checking a promo code,
|      filling in the contact form. Tenant-scoped and throttled, and each one
|      is on ModuleRouteGuardTest's documented list with its reason.
|   2. A guest holding a customer token — their profile, their addresses, the
|      loyalty shelf. Guarded by `customer.token`, which resolves the token
|      AFTER tenancy has been resolved; see RequireCustomerToken for why that
|      order is a row-level-security requirement and not a preference.
|   3. Both — the feedback form reads a token if one is offered and works
|      without one, because a guest at a table has no account and their
|      complaint is worth more than the attribution.
|
| The `tenant` group brings idempotency with it, so every POST here needs an
| `Idempotency-Key`. That is deliberate on a public surface: these are the
| requests most likely to be sent twice, from a phone with one bar.
*/
Route::middleware(['tenant'])
    ->prefix('v1/public')
    ->name('api.v1.public.')
    ->group(function (): void {

        // ---- Signing in: a phone number, then an SMS code ----
        // Throttled harder than anything else in this file, because every send
        // is a paid SMS. The per-number limits live in OtpCredentials; this one
        // catches a script working through a list of numbers.
        Route::middleware('throttle:10,1')->group(function (): void {
            Route::post('auth/otp', [PublicCustomerAuthController::class, 'request'])
                ->name('auth.otp');
            Route::post('auth/otp/verify', [PublicCustomerAuthController::class, 'verify'])
                ->name('auth.otp.verify');

            /*
             * The same identity, from inside Telegram.
             *
             * No SMS: Telegram already signed who this is with the
             * restaurant's own bot token, and the platform holds that token.
             * Throttled beside the OTP doors because it mints the same
             * customer token they do.
             */
            Route::post('telegram/session', PublicTelegramAuthController::class)
                ->name('telegram.session');
        });

        // ---- A review, with or without an account ----
        Route::post('feedback', PublicFeedbackController::class)
            ->middleware('throttle:10,1')
            ->name('feedback');

        // ---- Is this code worth anything on this basket ----
        // Higher ceiling: a cart checks this when somebody presses "apply", and
        // a guest correcting a typo three times is not an attacker.
        Route::post('promo-codes/check', PublicPromoCodeController::class)
            ->middleware('throttle:30,1')
            ->name('promo-codes.check');

        // ---- The marketing site's contact form ----
        Route::post('leads', PublicLeadController::class)
            ->middleware('throttle:5,1')
            ->name('leads');

        // ---- Behind a customer token ----
        Route::middleware('customer.token')->group(function (): void {
            Route::get('me', [PublicCustomerController::class, 'show'])->name('me');
            Route::patch('me', [PublicCustomerController::class, 'update'])->name('me.update');
            Route::delete('me/session', [PublicCustomerController::class, 'signOut'])->name('me.sign-out');

            Route::get('addresses', [PublicCustomerAddressController::class, 'index'])
                ->name('addresses.index');
            Route::post('addresses', [PublicCustomerAddressController::class, 'store'])
                ->name('addresses.store');
            Route::delete('addresses/{address}', [PublicCustomerAddressController::class, 'destroy'])
                ->whereNumber('address')
                ->name('addresses.destroy');

            /*
             * Where this guest's phone can be reached.
             *
             * The core `POST /api/v1/push/tokens` cannot take it: that route
             * stamps `$request->user()`, and a CRM customer is not a `User` —
             * no password, no Spatie role, no roster. The row is written with
             * this restaurant's `tenant_id` and under the policy in the
             * ordinary way, which is the difference from the marketplace's
             * version of the same endpoint.
             */
            Route::post('push/tokens', [PublicPushTokenController::class, 'store'])->name('push.register');
            Route::delete('push/tokens', [PublicPushTokenController::class, 'destroy'])->name('push.forget');

            Route::get('coupons', [PublicCouponController::class, 'index'])->name('coupons.index');
            Route::post('coupons/{coupon}/reserve', [PublicCouponController::class, 'reserve'])
                ->whereNumber('coupon')
                ->name('coupons.reserve');
        });
    });

Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/crm')
    ->name('api.v1.crm.')
    ->group(function (): void {
        Route::get('/', [CrmController::class, 'index'])->name('info');

        Route::get('customers', [CustomerController::class, 'index'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('customers.index');
        /*
         * Before `customers/{customer}`, because `segments` is not a number and
         * the router matches in order — `whereNumber` on the show route makes
         * that safe either way, and the order makes it obvious.
         */
        Route::get('customers/segments', [CustomerController::class, 'segments'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('customers.segments');
        Route::post('customers', [CustomerController::class, 'store'])
            ->middleware(PermissionMiddleware::using('crm.create'))->name('customers.store');
        Route::get('customers/{customer}', [CustomerController::class, 'show'])
            ->whereNumber('customer')
            ->middleware(PermissionMiddleware::using('crm.view'))->name('customers.show');
        Route::patch('customers/{customer}', [CustomerController::class, 'update'])
            ->middleware(PermissionMiddleware::using('crm.update'))->name('customers.update');
        Route::delete('customers/{customer}', [CustomerController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('crm.delete'))->name('customers.destroy');

        Route::get('customers/{customer}/addresses', [CustomerController::class, 'addresses'])
            ->whereNumber('customer')
            ->middleware(PermissionMiddleware::using('crm.view'))->name('customers.addresses');

        Route::post('customers/{customer}/points', [CustomerController::class, 'adjustPoints'])
            ->middleware(PermissionMiddleware::using('crm.update'))->name('customers.points');

        /*
        |----------------------------------------------------------------------
        | Tabs — P13, "balansiga yozildi · pul kelmadi"
        |----------------------------------------------------------------------
        |
        | Three permissions across four routes, and the split between the second
        | and the third is the whole control: `crm.update` takes money IN, which
        | reduces what the restaurant is owed and needs a cashier at eight in the
        | evening. `crm.manage` moves the ceiling, and the cashier standing in
        | front of the guest asking for more credit must never be the person who
        | grants it to themselves.
        |
        | There is no route that puts a bill ON a tab. That happens at a till,
        | inside the transaction that settles the bill, through the GuestAccounts
        | contract — see CustomerAccountController's docblock for why a public
        | POST would defeat the one-charge-per-bill index.
        */
        Route::get('accounts', [CustomerAccountController::class, 'index'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('accounts.index');

        Route::get('customers/{customer}/account', [CustomerAccountController::class, 'show'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('customers.account');
        Route::post('customers/{customer}/account/settlement', [CustomerAccountController::class, 'settle'])
            ->middleware(PermissionMiddleware::using('crm.update'))->name('customers.account.settle');
        Route::patch('customers/{customer}/credit-limit', [CustomerAccountController::class, 'updateCreditLimit'])
            ->middleware(PermissionMiddleware::using('crm.manage'))->name('customers.credit-limit');

        Route::get('loyalty', [LoyaltyTransactionController::class, 'index'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('loyalty.index');

        Route::get('feedbacks', [FeedbackController::class, 'index'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('feedbacks.index');
        Route::post('feedbacks', [FeedbackController::class, 'store'])
            ->middleware(PermissionMiddleware::using('crm.create'))->name('feedbacks.store');
        Route::get('feedbacks/{feedback}', [FeedbackController::class, 'show'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('feedbacks.show');
        Route::post('feedbacks/{feedback}/resolve', [FeedbackController::class, 'resolve'])
            ->middleware(PermissionMiddleware::using('crm.update'))->name('feedbacks.resolve');

        /*
        |----------------------------------------------------------------------
        | Campaigns and enquiries
        |----------------------------------------------------------------------
        |
        | Promo codes are full CRUD; leads are read-and-move only. A lead is
        | written by the person it is about and there is no `store` for the same
        | reason there is no `destroy`: an enquiry somebody typed on a
        | restaurant's behalf is not an enquiry, and a pipeline whose rows can be
        | deleted is one that can be made to look better than it is.
        */
        Route::get('promo-codes', [PromoCodeController::class, 'index'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('promo-codes.index');
        Route::post('promo-codes', [PromoCodeController::class, 'store'])
            ->middleware(PermissionMiddleware::using('crm.create'))->name('promo-codes.store');
        Route::get('promo-codes/{promoCode}', [PromoCodeController::class, 'show'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('promo-codes.show');
        Route::patch('promo-codes/{promoCode}', [PromoCodeController::class, 'update'])
            ->middleware(PermissionMiddleware::using('crm.update'))->name('promo-codes.update');
        Route::delete('promo-codes/{promoCode}', [PromoCodeController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('crm.delete'))->name('promo-codes.destroy');

        /*
        |----------------------------------------------------------------------
        | Campaigns — the marketing composer, and what it costs
        |----------------------------------------------------------------------
        |
        | `estimate` and `send` are POSTs and neither is a resource action.
        |
        | The first is a POST because the message body travels in it, and a
        | message with a guest's name in it does not belong in a query string
        | that every proxy on the way writes to disk. It reads and writes
        | nothing.
        |
        | The second is a POST rather than a PATCH on `status` because it is not
        | a state change that happens to have an effect — it IS the effect, it
        | costs money, and it is the one write in this module that reaches
        | outside the building. `crm.manage` rather than `crm.update`: editing a
        | draft and spending two hundred thousand so'm on SMS are not the same
        | permission.
        */
        Route::get('campaigns', [CampaignController::class, 'index'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('campaigns.index');
        Route::post('campaigns', [CampaignController::class, 'store'])
            ->middleware(PermissionMiddleware::using('crm.create'))->name('campaigns.store');
        Route::post('campaigns/estimate', [CampaignController::class, 'estimate'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('campaigns.estimate');
        Route::get('campaigns/{campaign}', [CampaignController::class, 'show'])
            ->whereNumber('campaign')
            ->middleware(PermissionMiddleware::using('crm.view'))->name('campaigns.show');
        Route::patch('campaigns/{campaign}', [CampaignController::class, 'update'])
            ->whereNumber('campaign')
            ->middleware(PermissionMiddleware::using('crm.update'))->name('campaigns.update');
        Route::delete('campaigns/{campaign}', [CampaignController::class, 'destroy'])
            ->whereNumber('campaign')
            ->middleware(PermissionMiddleware::using('crm.delete'))->name('campaigns.destroy');
        Route::post('campaigns/{campaign}/send', [CampaignController::class, 'send'])
            ->whereNumber('campaign')
            ->middleware(PermissionMiddleware::using('crm.manage'))->name('campaigns.send');
        Route::get('campaigns/{campaign}/deliveries', [CampaignController::class, 'deliveries'])
            ->whereNumber('campaign')
            ->middleware(PermissionMiddleware::using('crm.view'))->name('campaigns.deliveries');

        /*
        |----------------------------------------------------------------------
        | Promotions — offers nobody types
        |----------------------------------------------------------------------
        |
        | `pause` and `resume` are their own routes rather than a PATCH carrying
        | `is_active`, because the console's control is one tap with no form
        | behind it: a PATCH assembled from a stale card could quietly rewrite
        | the hours, the dishes or the channel while doing nothing more than
        | switching the offer off.
        */
        Route::get('promotions', [PromotionController::class, 'index'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('promotions.index');
        Route::post('promotions', [PromotionController::class, 'store'])
            ->middleware(PermissionMiddleware::using('crm.create'))->name('promotions.store');
        Route::get('promotions/{promotion}', [PromotionController::class, 'show'])
            ->whereNumber('promotion')
            ->middleware(PermissionMiddleware::using('crm.view'))->name('promotions.show');
        Route::patch('promotions/{promotion}', [PromotionController::class, 'update'])
            ->whereNumber('promotion')
            ->middleware(PermissionMiddleware::using('crm.update'))->name('promotions.update');
        Route::delete('promotions/{promotion}', [PromotionController::class, 'destroy'])
            ->whereNumber('promotion')
            ->middleware(PermissionMiddleware::using('crm.delete'))->name('promotions.destroy');
        Route::post('promotions/{promotion}/pause', [PromotionController::class, 'pause'])
            ->whereNumber('promotion')
            ->middleware(PermissionMiddleware::using('crm.update'))->name('promotions.pause');
        Route::post('promotions/{promotion}/resume', [PromotionController::class, 'resume'])
            ->whereNumber('promotion')
            ->middleware(PermissionMiddleware::using('crm.update'))->name('promotions.resume');

        /*
        |----------------------------------------------------------------------
        | Automated messages
        |----------------------------------------------------------------------
        |
        | `toggle` asks for `crm.manage` while editing the rule asks for
        | `crm.update`, which looks backwards until you read what the switch
        | does: it starts sending SMS to guests every morning with nobody
        | watching. Changing the wording of a message that is not sending is the
        | smaller power of the two.
        */
        Route::get('triggers', [TriggerController::class, 'index'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('triggers.index');
        Route::post('triggers', [TriggerController::class, 'store'])
            ->middleware(PermissionMiddleware::using('crm.create'))->name('triggers.store');
        Route::get('triggers/{trigger}', [TriggerController::class, 'show'])
            ->whereNumber('trigger')
            ->middleware(PermissionMiddleware::using('crm.view'))->name('triggers.show');
        Route::patch('triggers/{trigger}', [TriggerController::class, 'update'])
            ->whereNumber('trigger')
            ->middleware(PermissionMiddleware::using('crm.update'))->name('triggers.update');
        Route::delete('triggers/{trigger}', [TriggerController::class, 'destroy'])
            ->whereNumber('trigger')
            ->middleware(PermissionMiddleware::using('crm.delete'))->name('triggers.destroy');
        Route::post('triggers/{trigger}/toggle', [TriggerController::class, 'toggle'])
            ->whereNumber('trigger')
            ->middleware(PermissionMiddleware::using('crm.manage'))->name('triggers.toggle');

        /*
        |----------------------------------------------------------------------
        | Complaints
        |----------------------------------------------------------------------
        |
        | `decide` is `crm.update` and not `crm.manage`, and the ceiling is
        | enforced inside the handler instead. That is deliberate: the whole
        | point of the auto-refund rule is that a small complaint is answered by
        | whoever picked it up, in ninety seconds, and a route-level
        | `crm.manage` would refuse the cheap answers as well as the expensive
        | ones. Above the ceiling the handler asks for `crm.manage` and answers
        | `crm.case_needs_manager`, which is a sentence a screen can act on.
        |
        | There is no route that reassigns a complaint to another restaurant or
        | edits its history: `crm.case_events` is append-only, and a history
        | that can be edited is not a history.
        */
        Route::get('cases', [CaseController::class, 'index'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('cases.index');
        Route::get('cases/causes', [CaseController::class, 'causes'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('cases.causes');
        Route::post('cases', [CaseController::class, 'store'])
            ->middleware(PermissionMiddleware::using('crm.create'))->name('cases.store');
        Route::get('cases/{case}', [CaseController::class, 'show'])
            ->whereNumber('case')
            ->middleware(PermissionMiddleware::using('crm.view'))->name('cases.show');
        Route::patch('cases/{case}', [CaseController::class, 'update'])
            ->whereNumber('case')
            ->middleware(PermissionMiddleware::using('crm.update'))->name('cases.update');
        Route::delete('cases/{case}', [CaseController::class, 'destroy'])
            ->whereNumber('case')
            ->middleware(PermissionMiddleware::using('crm.delete'))->name('cases.destroy');
        Route::post('cases/{case}/decide', [CaseController::class, 'decide'])
            ->whereNumber('case')
            ->middleware(PermissionMiddleware::using('crm.update'))->name('cases.decide');

        // The seam from the review queue: one press opens a desk on a one-star.
        Route::post('feedbacks/{feedback}/case', [CaseController::class, 'fromFeedback'])
            ->whereNumber('feedback')
            ->middleware(PermissionMiddleware::using('crm.create'))->name('feedbacks.case');

        Route::get('leads', [LeadController::class, 'index'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('leads.index');
        Route::get('leads/{lead}', [LeadController::class, 'show'])
            ->middleware(PermissionMiddleware::using('crm.view'))->name('leads.show');
        Route::patch('leads/{lead}', [LeadController::class, 'update'])
            ->middleware(PermissionMiddleware::using('crm.update'))->name('leads.update');
    });
