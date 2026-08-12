<?php

declare(strict_types=1);

return [
    'name' => 'Menu',
    'alias' => 'menu',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'utensils',
    'group' => 'operations',
    'order' => 1,  // sidebar position, independent of module.json load priority
    'route' => 'v1/menu',
    'permission_prefix' => 'menu',

    // A restaurant cannot switch this off — the POS stops working without it.
    'required' => true,

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Menyu',
        'ru' => 'Меню',
        'en' => 'Menu',
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature flags
    |--------------------------------------------------------------------------
    | Per-tenant overrides live in the tenants.settings JSON column; these are
    | the platform-wide defaults.
    */
    'enabled' => env('MODULE_MENU_ENABLED', true),
];
