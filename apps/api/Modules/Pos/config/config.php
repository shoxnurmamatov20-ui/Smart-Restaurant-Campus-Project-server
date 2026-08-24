<?php

declare(strict_types=1);

return [
    'name' => 'Pos',
    'alias' => 'pos',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'credit-card',
    'group' => 'operations',
    'order' => 12,  // sidebar position, independent of module.json load priority
    'route' => 'v1/pos',
    'permission_prefix' => 'pos',

    // A restaurant can run without a till (delivery-only kitchens do), so unlike
    // Menu this one is switchable per tenant.
    'required' => false,

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Kassa (POS)',
        'ru' => 'Касса (POS)',
        'en' => 'POS',
    ],

    'description' => "Kassa terminali: qurilma, PIN, sotuv, aralash to'lov, tasdiq, kassa qutisi, chek, fiskal.",

    /*
    |--------------------------------------------------------------------------
    | Venue modes
    |--------------------------------------------------------------------------
    | The same code base serves four very different service patterns. A terminal
    | picks one and the client changes shape accordingly; the API is the same.
    */
    'modes' => [
        'table_service' => 'Restoran — stol, ochiq hisob, pre-check',
        'quick_service' => 'Fast food — avval to\'lov, buyurtma raqami',
        'bar' => 'Bar — ochiq tab, tez tugmalar',
        'counter' => 'Kafe / nonvoyxona — eng tez oqim',
    ],

    /*
    |--------------------------------------------------------------------------
    | Pairing
    |--------------------------------------------------------------------------
    | A terminal is paired once, by a manager, with a short code read off the
    | screen. The code is stored hashed and dies quickly: it is the one moment
    | the till has no credentials of its own.
    */
    'pairing' => [
        // Eight characters from an unambiguous alphabet, not six digits: the
        // code is looked up by an unsalted hash (it has to be findable before
        // we know which restaurant is pairing), and a million possibilities is
        // not enough to make that safe. 32^8 is.
        'code_length' => 8,
        'ttl_minutes' => (int) env('POS_PAIRING_TTL_MINUTES', 10),
    ],

    /*
    |--------------------------------------------------------------------------
    | PIN policy
    |--------------------------------------------------------------------------
    | A waiter switches user dozens of times a shift; email and password are not
    | usable at that rate. The trade-off is a short secret, so the lockout has to
    | do the work the length does not.
    */
    /*
     * How long a till session may sit idle, and nothing else about PINs.
     *
     * `length`, `max_attempts` and `lock_minutes` used to live here too and now
     * live in `config/auth.php`, because the staff app asks the same person for
     * the same four digits and the lockout has to be one counter rather than
     * two. A copy here would be the number that quietly stopped being enforced.
     */
    'pin' => [
        'session_idle_minutes' => (int) env('POS_SESSION_IDLE_MINUTES', 15),
    ],

    /*
    |--------------------------------------------------------------------------
    | Approvals
    |--------------------------------------------------------------------------
    | How long a request stays answerable, and its signature spendable.
    |
    | Five minutes was right when answering meant walking to the till. P9 moved
    | the queue off the terminal — a manager answers from the office, the other
    | branch, or a car park — and five minutes is then the window between a
    | phone buzzing and somebody being free to look at it. Miss it and the shape
    | is worse than a refusal: the cashier taps again, a second pending request
    | appears, and the manager opens a notification for the first one and is told
    | it has expired.
    |
    | Ten, and configurable, because the honest answer differs between a
    | fast-food counter and a hotel restaurant. Not longer: the point of the
    | limit is that an authorisation cannot be obtained quietly and banked, and
    | every minute here is a minute it can sit unspent. The other protections
    | narrowed since — a signature is bound to its action, its subject AND its
    | amount, and is spent exactly once — so this no longer carries that weight
    | alone, which is what makes ten defensible where it once would not have been.
    */
    'approvals' => [
        'ttl_minutes' => (int) env('POS_APPROVAL_TTL_MINUTES', 10),
    ],

    /*
    |--------------------------------------------------------------------------
    | Fiscalisation
    |--------------------------------------------------------------------------
    | Uzbekistan requires every sale to be registered with the tax authority's
    | OFD. That integration needs a provider contract per restaurant, so the
    | driver is pluggable and defaults to one that records the receipt locally
    | without calling anyone — which is what a development machine wants.
    */
    'fiscal' => [
        'driver' => env('POS_FISCAL_DRIVER', 'null_driver'),
        'max_attempts' => 5,
    ],

    /*
    |--------------------------------------------------------------------------
    | Printing
    |--------------------------------------------------------------------------
    | 'browser' means the terminal renders and prints the receipt itself, which
    | works today with no hardware at all. ESC/POS drivers plug into the same
    | queue when real printers arrive.
    */
    'printing' => [
        'default_driver' => env('POS_PRINT_DRIVER', 'browser'),
        'max_attempts' => 3,
    ],

    /*
    |--------------------------------------------------------------------------
    | Offline sync
    |--------------------------------------------------------------------------
    | How much of a stranded shift a till may hand back in one request.
    |
    | A queue is drained inside one HTTP request, in order, and every entry does
    | real work — opens a bill, captures money, writes a kitchen ticket. Two
    | hundred is roughly a busy evening on one terminal, and it is also the size
    | the load test in PLAN-2026-08 step 11 measures against. Refusing anything
    | larger is kinder than accepting it: a request that dies on a php-fpm
    | timeout half way through leaves the cashier with no answer for entries that
    | DID apply, and their next tap sends the whole queue again.
    */
    'sync' => [
        'max_batch' => (int) env('POS_SYNC_MAX_BATCH', 200),
    ],

    // Platform-wide default; per-restaurant overrides live in tenants.settings.
    'enabled' => env('MODULE_POS_ENABLED', true),
];
