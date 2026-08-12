<?php

declare(strict_types=1);

return [
    'name' => 'Crm',
    'alias' => 'crm',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'heart-handshake',
    'group' => 'growth',
    'order' => 9,  // sidebar position, independent of module.json load priority
    'route' => 'v1/crm',
    'permission_prefix' => 'crm',

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Mijozlar va sodiqlik',
        'ru' => 'CRM и лояльность',
        'en' => 'CRM & Loyalty',
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature flags
    |--------------------------------------------------------------------------
    | Per-tenant overrides live in the tenants.settings JSON column; these are
    | the platform-wide defaults.
    */
    'enabled' => env('MODULE_CRM_ENABLED', true),
];
