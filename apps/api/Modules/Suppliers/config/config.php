<?php

declare(strict_types=1);

return [
    'name' => 'Suppliers',
    'alias' => 'suppliers',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'truck',
    'group' => 'supply',
    'order' => 6,  // sidebar position, independent of module.json load priority
    'route' => 'v1/suppliers',
    'permission_prefix' => 'suppliers',

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Yetkazib beruvchilar',
        'ru' => 'Поставщики',
        'en' => 'Suppliers & Procurement',
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature flags
    |--------------------------------------------------------------------------
    | Per-tenant overrides live in the tenants.settings JSON column; these are
    | the platform-wide defaults.
    */
    'enabled' => env('MODULE_SUPPLIERS_ENABLED', true),
];
