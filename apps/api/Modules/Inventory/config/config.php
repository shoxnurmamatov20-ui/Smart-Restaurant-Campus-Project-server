<?php

declare(strict_types=1);

return [
    'name' => 'Inventory',
    'alias' => 'inventory',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'package',
    'group' => 'supply',
    'order' => 5,  // sidebar position, independent of module.json load priority
    'route' => 'v1/inventory',
    'permission_prefix' => 'inventory',

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Ombor',
        'ru' => 'Склад',
        'en' => 'Inventory & Warehouse',
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature flags
    |--------------------------------------------------------------------------
    | Per-tenant overrides live in the tenants.settings JSON column; these are
    | the platform-wide defaults.
    */
    'enabled' => env('MODULE_INVENTORY_ENABLED', true),
];
