<?php

declare(strict_types=1);

return [
    'name' => 'Tables',
    'alias' => 'tables',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'armchair',
    'group' => 'operations',
    'order' => 4,  // sidebar position, independent of module.json load priority
    'route' => 'v1/tables',
    'permission_prefix' => 'tables',

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Stollar va bronlar',
        'ru' => 'Столы и брони',
        'en' => 'Tables & Reservations',
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature flags
    |--------------------------------------------------------------------------
    | Per-tenant overrides live in the tenants.settings JSON column; these are
    | the platform-wide defaults.
    */
    'enabled' => env('MODULE_TABLES_ENABLED', true),
];
