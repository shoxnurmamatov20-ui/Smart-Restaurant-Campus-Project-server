<?php

declare(strict_types=1);

return [
    'name' => 'Analytics',
    'alias' => 'analytics',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'line-chart',
    'group' => 'growth',
    'order' => 10,  // sidebar position, independent of module.json load priority
    'route' => 'v1/analytics',
    'permission_prefix' => 'analytics',

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Analitika',
        'ru' => 'Аналитика',
        'en' => 'Analytics & BI',
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature flags
    |--------------------------------------------------------------------------
    | Per-tenant overrides live in the tenants.settings JSON column; these are
    | the platform-wide defaults.
    */
    'enabled' => env('MODULE_ANALYTICS_ENABLED', true),
];
