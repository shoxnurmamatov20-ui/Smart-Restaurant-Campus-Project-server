<?php

declare(strict_types=1);

return [

    /*
     * Expo's push service. The access token is optional — a project without
     * "enhanced push security" sends without one — but once it is enabled in
     * the Expo dashboard every send without the token is refused, so it is
     * read here rather than hard-wired either way.
     */
    'expo' => [
        'access_token' => env('EXPO_ACCESS_TOKEN'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    /*
    |--------------------------------------------------------------------------
    | SMS
    |--------------------------------------------------------------------------
    |
    | The only channel that reaches an Uzbek guest with no app installed, and
    | the one a customer signs in through — see App\Contracts\Messaging\SmsSender.
    |
    | `log` writes the message to storage/logs and sends nothing; it is the
    | driver a laptop and CI run. `eskiz` is the real gateway. Selecting eskiz
    | with any of its three credentials empty stops the application at boot
    | rather than at the first sign-in attempt — see AppServiceProvider.
    |
    | `from` is the alphanumeric sender id the operator approved for this
    | business. `4546` is Eskiz's own test id: it delivers only to numbers on
    | the account's allow-list, which is exactly what a staging box wants.
    */
    'sms' => [
        'driver' => env('SMS_DRIVER', 'log'),
        'from' => env('SMS_FROM', '4546'),

        'eskiz' => [
            'url' => env('SMS_ESKIZ_URL', 'https://notify.eskiz.uz'),
            'email' => env('SMS_ESKIZ_EMAIL'),
            'password' => env('SMS_ESKIZ_PASSWORD'),
        ],
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Online payment providers
    |--------------------------------------------------------------------------
    |
    | The three rails an Uzbek guest actually pays a restaurant through, plus a
    | sandbox for a laptop. Read by App\Contracts\Finance\PaymentGateways; the
    | drivers live in Modules\Finance\Payments.
    |
    | A provider with an empty credential is OFF, not broken. Most venues sign
    | with one acquirer and never with all three, so "no PAYME_KEY" is an
    | ordinary state of the world and must not stop the application booting or
    | put a button on a checkout that fails after the guest has committed. The
    | registry reports it as `available: false` and the screen draws one fewer
    | button — see PaymentGateway::available().
    |
    | `enabled` is the switch above the credentials: a restaurant that has keys
    | but is not selling online yet turns the rail off without deleting them.
    |
    | Every `*_url` is configurable rather than constant because all three
    | providers run a separate sandbox host, and a test that pointed at
    | production would be a real transaction against a real merchant account.
    */
    'payments' => [

        /*
         * Payme (Paycom) Merchant API — JSON-RPC 2.0 over one endpoint.
         *
         * `key` is the merchant key Payme signs its callbacks with: it arrives
         * as HTTP Basic `Paycom:<key>`, and it is the ONLY thing separating a
         * genuine PerformTransaction from a stranger posting JSON at the
         * callback URL. There is no signature over the body, so the key is the
         * whole of the authentication and it must never be logged.
         *
         * `checkout_url` is where the guest is sent. Payme takes its parameters
         * as a base64 blob in the path rather than a query string.
         */
        'payme' => [
            'enabled' => env('PAYME_ENABLED', true),
            'merchant_id' => env('PAYME_MERCHANT_ID'),
            'key' => env('PAYME_KEY'),
            'checkout_url' => env('PAYME_CHECKOUT_URL', 'https://checkout.paycom.uz'),
            'api_url' => env('PAYME_API_URL', 'https://checkout.paycom.uz/api'),
            // The field name Payme is configured to send the order number in.
            // Every merchant chooses this when the cabinet is set up, and
            // hard-coding `order_id` breaks any venue that chose otherwise.
            'account_field' => env('PAYME_ACCOUNT_FIELD', 'order_id'),
        ],

        /*
         * Click — a two-step Prepare/Complete callback, signed with MD5.
         *
         * `secret_key` is what the `sign_string` is built from; `service_id` and
         * `merchant_id` identify the venue. `merchant_user_id` is only needed by
         * the Merchant API (reversals), not by the callbacks.
         */
        'click' => [
            'enabled' => env('CLICK_ENABLED', true),
            'service_id' => env('CLICK_SERVICE_ID'),
            'merchant_id' => env('CLICK_MERCHANT_ID'),
            'merchant_user_id' => env('CLICK_MERCHANT_USER_ID'),
            'secret_key' => env('CLICK_SECRET_KEY'),
            'checkout_url' => env('CLICK_CHECKOUT_URL', 'https://my.click.uz/services/pay'),
            'api_url' => env('CLICK_API_URL', 'https://api.click.uz/v2/merchant'),
        ],

        /*
         * Uzum Bank checkout.
         *
         * Its callback contract is NOT verified against a published document —
         * see Modules\Finance\Payments\UzumGateway, which says so in its own
         * docblock and keeps every field name in one place for that reason. The
         * shape here is the one the driver reads; correcting it when the
         * integration document arrives is a change to two files.
         */
        'uzum' => [
            'enabled' => env('UZUM_ENABLED', false),
            'merchant_id' => env('UZUM_MERCHANT_ID'),
            'service_id' => env('UZUM_SERVICE_ID'),
            'secret_key' => env('UZUM_SECRET_KEY'),
            'checkout_url' => env('UZUM_CHECKOUT_URL', 'https://www.uzumbank.uz/open-service'),
            'api_url' => env('UZUM_API_URL'),
        ],

        /*
         * The laptop's provider: marks the invoice paid the moment it is
         * created, so the whole flow — invoice, redirect, callback, tender,
         * closed bill — can be walked without a bank.
         *
         * It REFUSES TO RUN IN PRODUCTION, for the same reason
         * DemoFiscalDriver does: a rail that reports payment without taking any
         * is a restaurant giving food away while its dashboard says it was
         * paid. Off by default, and switched on only where APP_ENV is not
         * production.
         */
        'sandbox' => [
            'enabled' => env('PAYMENTS_SANDBOX_ENABLED', false),
        ],
    ],

];
