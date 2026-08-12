<?php

declare(strict_types=1);

return [
    'name' => 'Orders',
    'alias' => 'orders',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'receipt',
    'group' => 'operations',
    'order' => 2,  // sidebar position, independent of module.json load priority
    'route' => 'v1/orders',
    'permission_prefix' => 'orders',

    // A restaurant cannot switch this off — the POS stops working without it.
    'required' => true,

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Buyurtmalar',
        'ru' => 'Заказы',
        'en' => 'Orders',
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature flags
    |--------------------------------------------------------------------------
    | Per-tenant overrides live in the tenants.settings JSON column; these are
    | the platform-wide defaults.
    */
    'enabled' => env('MODULE_ORDERS_ENABLED', true),
];
