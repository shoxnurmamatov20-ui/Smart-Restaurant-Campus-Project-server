<?php

declare(strict_types=1);
use Modules\Suppliers\Database\Seeders\PurchaseOrderSeeder;

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
            PurchaseOrderSeeder::class,
        ],
        'tables' => ['suppliers.purchase_orders', 'suppliers.purchase_order_items'],
    ],
];
