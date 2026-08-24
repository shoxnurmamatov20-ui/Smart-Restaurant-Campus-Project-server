<?php

declare(strict_types=1);
use Modules\Marketplace\Database\Seeders\MarketplaceDatabaseSeeder;

return [
    'name' => 'Marketplace',
    'alias' => 'marketplace',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'store',
    'group' => 'growth',
    'order' => 13,
    'route' => 'v1/marketplace',
    'permission_prefix' => 'marketplace',

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Bozor',
        'ru' => 'Маркетплейс',
        'en' => 'Marketplace',
    ],

    'description' => 'MyPOS bozori — ko\'p restoranli iste\'molchi vitrinasi',

    /*
    |--------------------------------------------------------------------------
    | Feature flag
    |--------------------------------------------------------------------------
    | Per-restaurant overrides live in tenants.settings.modules; this is the
    | platform-wide default.
    */
    'enabled' => env('MODULE_MARKETPLACE_ENABLED', true),

    /*
     * What `demo:seed` may run for the demo tenant, and the tenant-scoped
     * tables those seeders fill. Declared here rather than in the command so
     * the core never names a module: the command reads every module's `demo`
     * key and knows nothing else about it.
     */
    'demo' => [
        'seeders' => [
            MarketplaceDatabaseSeeder::class,
        ],
        'tables' => ['marketplace.stores', 'marketplace.store_items', 'marketplace.orders', 'marketplace.order_lines', 'marketplace.settlements', 'marketplace.disputes', 'marketplace.promotions'],
    ],
];
