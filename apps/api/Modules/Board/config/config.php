<?php

declare(strict_types=1);
use Modules\Board\Database\Seeders\BoardDatabaseSeeder;

return [
    'name' => 'Board',
    'alias' => 'board',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'monitor',
    'group' => 'growth',
    'order' => 14,
    'route' => 'v1/board',
    'permission_prefix' => 'board',

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Menyu taxtasi',
        'ru' => 'Меню-борд',
        'en' => 'Menu board',
    ],

    'description' => 'Peshtaxta ustidagi ekran: ustunlar, rotatsiya va bannerlar — narx va stop-list menyudan o\'qiladi.',

    /*
    |--------------------------------------------------------------------------
    | Feature flag
    |--------------------------------------------------------------------------
    | Per-restaurant overrides live in tenants.settings.modules; this is the
    | platform-wide default.
    */
    'enabled' => env('MODULE_BOARD_ENABLED', true),

    /*
    |--------------------------------------------------------------------------
    | How many televisions a counter drives
    |--------------------------------------------------------------------------
    | The number under the green dot on the console — "Live · 2 screens".
    |
    | Configuration rather than data, and it is worth being honest about why.
    | This platform enrols tills (`pos.terminals`, an eight-character pairing
    | code) and printers, and it enrols nothing for signage: a wall screen opens
    | a URL and starts drawing. So there is no row to count, and this is what the
    | operator says is plugged in rather than what is.
    |
    | The fix is a device registry — a screen pairing the way a terminal does,
    | with its own token — at which point this key becomes a fallback for a
    | venue that has not paired anything yet. Until then a chain with three
    | screens in one venue and one in another has to choose a single number, and
    | it should choose the one that is right more often.
    */
    'screens' => (int) env('BOARD_SCREENS_PER_BRANCH', 2),

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
            BoardDatabaseSeeder::class,
        ],
        'tables' => ['board.playlist', 'board.columns', 'board.banners'],
    ],
];
