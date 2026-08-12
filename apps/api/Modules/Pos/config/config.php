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
    'pin' => [
        'length' => 4,
        'max_attempts' => 5,
        'lock_minutes' => 15,
        'session_idle_minutes' => (int) env('POS_SESSION_IDLE_MINUTES', 15),
    ],

    /*
    |--------------------------------------------------------------------------
    | Approvals
    |--------------------------------------------------------------------------
    | How long a manager's authorisation stays usable. Long enough to walk to the
    | till, short enough that it cannot be banked for later.
    */
    'approvals' => [
        'ttl_minutes' => 5,
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

    // Platform-wide default; per-restaurant overrides live in tenants.settings.
    'enabled' => env('MODULE_POS_ENABLED', true),
];
