<?php

declare(strict_types=1);

return [
    'name' => 'Kitchen',
    'alias' => 'kitchen',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'chef-hat',
    'group' => 'operations',
    'order' => 3,  // sidebar position, independent of module.json load priority
    'route' => 'v1/kitchen',
    'permission_prefix' => 'kitchen',

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Oshxona (KDS)',
        'ru' => 'Кухня (KDS)',
        'en' => 'Kitchen Display System',
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature flags
    |--------------------------------------------------------------------------
    | Per-tenant overrides live in the tenants.settings JSON column; these are
    | the platform-wide defaults.
    */
    'enabled' => env('MODULE_KITCHEN_ENABLED', true),
];
