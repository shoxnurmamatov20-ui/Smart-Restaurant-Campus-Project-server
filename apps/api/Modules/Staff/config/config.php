<?php

declare(strict_types=1);
use Modules\Staff\Database\Seeders\StaffShiftSeeder;

return [
    'name' => 'Staff',
    'alias' => 'staff',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'users',
    'group' => 'back-office',
    'order' => 7,  // sidebar position, independent of module.json load priority
    'route' => 'v1/staff',
    'permission_prefix' => 'staff',

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Xodimlar',
        'ru' => 'Персонал',
        'en' => 'Staff & Shifts',
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature flags
    |--------------------------------------------------------------------------
    | Per-tenant overrides live in the tenants.settings JSON column; these are
    | the platform-wide defaults.
    */
    'enabled' => env('MODULE_STAFF_ENABLED', true),

    /*
    |--------------------------------------------------------------------------
    | Demo data
    |--------------------------------------------------------------------------
    |
    | What `demo:seed` runs for the demo tenant — every morning, on a box that
    | has one, because the rota is a window around today and a window seeded
    | on Monday is empty by Friday. Idempotent: `updateOrCreate` per person
    | and day.
    |
    */

    'demo' => [
        'seeders' => [
            StaffShiftSeeder::class,
        ],
        'tables' => ['staff.shifts', 'staff.attendances'],
    ],
];
