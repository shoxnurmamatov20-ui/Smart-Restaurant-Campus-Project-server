<?php

declare(strict_types=1);

return [
    'name' => 'Finance',
    'alias' => 'finance',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'wallet',
    'group' => 'back-office',
    'order' => 8,  // sidebar position, independent of module.json load priority
    'route' => 'v1/finance',
    'permission_prefix' => 'finance',

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Moliya va kassa',
        'ru' => 'Финансы и касса',
        'en' => 'Finance & POS Payments',
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature flags
    |--------------------------------------------------------------------------
    | Per-tenant overrides live in the tenants.settings JSON column; these are
    | the platform-wide defaults.
    */
    'enabled' => env('MODULE_FINANCE_ENABLED', true),
];
