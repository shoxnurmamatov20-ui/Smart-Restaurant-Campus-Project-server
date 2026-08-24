<?php

declare(strict_types=1);

use App\Models\User;

return [

    /*
    |--------------------------------------------------------------------------
    | Authentication Defaults
    |--------------------------------------------------------------------------
    |
    | This option defines the default authentication "guard" and password
    | reset "broker" for your application. You may change these values
    | as required, but they're a perfect start for most applications.
    |
    */

    'defaults' => [
        'guard' => env('AUTH_GUARD', 'web'),
        'passwords' => env('AUTH_PASSWORD_BROKER', 'users'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Authentication Guards
    |--------------------------------------------------------------------------
    |
    | Next, you may define every authentication guard for your application.
    | Of course, a great default configuration has been defined for you
    | which utilizes session storage plus the Eloquent user provider.
    |
    | All authentication guards have a user provider, which defines how the
    | users are actually retrieved out of your database or other storage
    | system used by the application. Typically, Eloquent is utilized.
    |
    | Supported: "session"
    |
    */

    'guards' => [
        'web' => [
            'driver' => 'session',
            'provider' => 'users',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | User Providers
    |--------------------------------------------------------------------------
    |
    | All authentication guards have a user provider, which defines how the
    | users are actually retrieved out of your database or other storage
    | system used by the application. Typically, Eloquent is utilized.
    |
    | If you have multiple user tables or models you may configure multiple
    | providers to represent the model / table. These providers may then
    | be assigned to any extra authentication guards you have defined.
    |
    | Supported: "database", "eloquent"
    |
    */

    'providers' => [
        'users' => [
            'driver' => 'eloquent',
            'model' => env('AUTH_MODEL', User::class),
        ],

        // 'users' => [
        //     'driver' => 'database',
        //     'table' => 'users',
        // ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Resetting Passwords
    |--------------------------------------------------------------------------
    |
    | These configuration options specify the behavior of Laravel's password
    | reset functionality, including the table utilized for token storage
    | and the user provider that is invoked to actually retrieve users.
    |
    | The expiry time is the number of minutes that each reset token will be
    | considered valid. This security feature keeps tokens short-lived so
    | they have less time to be guessed. You may change this as needed.
    |
    | The throttle setting is the number of seconds a user must wait before
    | generating more password reset tokens. This prevents the user from
    | quickly generating a very large amount of password reset tokens.
    |
    */

    'passwords' => [
        'users' => [
            'provider' => 'users',
            'table' => env('AUTH_PASSWORD_RESET_TOKEN_TABLE', 'password_reset_tokens'),
            'expire' => 60,
            'throttle' => 60,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Password Confirmation Timeout
    |--------------------------------------------------------------------------
    |
    | Here you may define the number of seconds before a password confirmation
    | window expires and users are asked to re-enter their password via the
    | confirmation screen. By default, the timeout lasts for three hours.
    |
    */

    'password_timeout' => env('AUTH_PASSWORD_TIMEOUT', 10800),

    /*
    |--------------------------------------------------------------------------
    | PIN
    |--------------------------------------------------------------------------
    |
    | Four digits, and the two numbers that make four digits defensible. Ten
    | thousand combinations fall in seconds to a machine and take weeks against
    | five tries and a fifteen-minute door.
    |
    | Here rather than in the POS module's config, because the lockout is shared:
    | a till and a staff phone ask the same person for the same PIN, and two
    | counters would mean ten guesses instead of five. See
    | App\Support\Auth\PinCredentials.
    |
    */

    'pin' => [
        'length' => 4,
        'max_attempts' => (int) env('AUTH_PIN_MAX_ATTEMPTS', 5),
        'lock_minutes' => (int) env('AUTH_PIN_LOCK_MINUTES', 15),
    ],

    /*
    |--------------------------------------------------------------------------
    | One-time codes — how a customer signs in
    |--------------------------------------------------------------------------
    |
    | A phone number and an SMS code, never a password: somebody ordering plov
    | at eight in the evening will not invent, remember or reset one, and a
    | password on a food-ordering account is a password reused from somewhere
    | that matters more.
    |
    | Four digits, because the design draws four cells and the code is enterable
    | one-handed while the SMS notification covers the top of the screen. Four
    | digits is only defensible with the three numbers under it: the code lives
    | five minutes, five wrong tries shut the number for fifteen, and one send a
    | minute is all a person needs — see App\Support\Auth\OtpCredentials.
    |
    | `per_minute` and `per_hour` are about money as much as security. Every
    | send is a paid SMS, so an unthrottled endpoint is a stranger spending the
    | restaurant's balance.
    */
    'otp' => [
        'length' => (int) env('AUTH_OTP_LENGTH', 4),
        'ttl_seconds' => (int) env('AUTH_OTP_TTL_SECONDS', 300),
        'max_attempts' => (int) env('AUTH_OTP_MAX_ATTEMPTS', 5),
        'lock_minutes' => (int) env('AUTH_OTP_LOCK_MINUTES', 15),
        'per_minute' => (int) env('AUTH_OTP_PER_MINUTE', 1),
        'per_hour' => (int) env('AUTH_OTP_PER_HOUR', 5),

        /*
         * How long the token a verified code buys is good for.
         *
         * Ninety days, and long on purpose: this is a consumer app on a
         * personal phone, and a customer signed out every fortnight is a
         * customer who orders from a competitor rather than waiting for
         * another SMS. The token holds one ability, `customer`, and reaches
         * nothing but that person's own profile, addresses and orders.
         */
        'token_days' => (int) env('AUTH_OTP_TOKEN_DAYS', 90),

        /*
         * A fixed sign-in code, for automated tests only.
         *
         * Null by default and ignored outside `local` and `testing` — the
         * environment check is in `App\Support\Auth\OtpCredentials::fixedCode()`
         * and is not configurable, precisely because the way this leaks is an
         * operator copying a developer's `.env` onto a server. Read that
         * method before changing anything here.
         *
         * It exists because the browser journey has to sign a guest in and the
         * code deliberately never comes back over the wire. The alternative was
         * a test that parses `storage/logs/laravel.log`, which does not work in
         * CI and breaks the day somebody rewords a log line.
         */
        'test_code' => env('OTP_TEST_CODE'),
    ],

];
