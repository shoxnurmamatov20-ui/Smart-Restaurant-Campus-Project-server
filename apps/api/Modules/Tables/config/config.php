<?php

declare(strict_types=1);
use Modules\Tables\Database\Seeders\ReservationSeeder;

return [
    'name' => 'Tables',
    'alias' => 'tables',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'armchair',
    'group' => 'operations',
    'order' => 4,  // sidebar position, independent of module.json load priority
    'route' => 'v1/tables',
    'permission_prefix' => 'tables',

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Stollar va bronlar',
        'ru' => 'Столы и брони',
        'en' => 'Tables & Reservations',
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature flags
    |--------------------------------------------------------------------------
    | Per-tenant overrides live in the tenants.settings JSON column; these are
    | the platform-wide defaults.
    */
    'enabled' => env('MODULE_TABLES_ENABLED', true),

    /*
    |--------------------------------------------------------------------------
    | The sticker on the table
    |--------------------------------------------------------------------------
    | A table's QR code encodes `{base}/qr/{restaurant}/{qr_token}` — the guest
    | surface's own route, segment for segment with
    | `apps/web/src/app/(guest)/qr/[restaurant]/[table]` and with the phone
    | app's deep link.
    |
    | The base is the *guest* origin, not the API's. They are the same host in
    | development and different ones in production, and getting it wrong is not
    | a redirect — it is a sticker somebody printed two hundred of.
    |
    | 320px renders crisply on a 60mm sticker; the margin of 1 module is the
    | smallest the QR spec tolerates and the border is drawn by the sticker.
    */
    'qr' => [
        'base_url' => env('GUEST_APP_URL', env('APP_URL', 'http://localhost')),
        'size_pixels' => 320,
        'margin_modules' => 1,
    ],

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
            ReservationSeeder::class,
        ],
        'tables' => ['tables.reservations'],
    ],
];
