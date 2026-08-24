<?php

declare(strict_types=1);
use Database\Seeders\MenuRecipeSeeder;
use Modules\Inventory\Database\Seeders\PrepItemSeeder;
use Modules\Inventory\Database\Seeders\StockMovementSeeder;

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

    /*
    |--------------------------------------------------------------------------
    | Demo data
    |--------------------------------------------------------------------------
    |
    | What `demo:seed` runs for the demo tenant, and the tables it first clears
    | of tenantless rows — a `db:seed --class` run without a tenant context
    | writes `tenant_id IS NULL` rows that RLS hides from everyone.
    |
    */

    'demo' => [
        'seeders' => [
            PrepItemSeeder::class,
            /*
             * The dishes' technical cards, declared here rather than by Menu.
             *
             * `demo:seed` walks the registry in sidebar order, so Menu (1) runs
             * before Inventory (5); a recipe seeder declared there would run
             * before a single prep card existed, write the raw-goods lines only,
             * and grow the count on the second night — which SeedDemoTenantTest
             * catches by running the whole set twice. It belongs after the shelf
             * and the prep cards, which is here.
             */
            MenuRecipeSeeder::class,
            StockMovementSeeder::class,
        ],
        'tables' => ['inventory.prep_items', 'menu.recipe_lines', 'inventory.stock_movements'],
    ],
];
