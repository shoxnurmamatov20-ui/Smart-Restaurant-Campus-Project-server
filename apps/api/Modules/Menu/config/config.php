<?php

declare(strict_types=1);
use Modules\Menu\Database\Seeders\MenuModifierSeeder;

return [
    'name' => 'Menu',
    'alias' => 'menu',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'utensils',
    'group' => 'operations',
    'order' => 1,  // sidebar position, independent of module.json load priority
    'route' => 'v1/menu',
    'permission_prefix' => 'menu',

    // A restaurant cannot switch this off — the POS stops working without it.
    'required' => true,

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Menyu',
        'ru' => 'Меню',
        'en' => 'Menu',
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature flags
    |--------------------------------------------------------------------------
    | Per-tenant overrides live in the tenants.settings JSON column; these are
    | the platform-wide defaults.
    */
    'enabled' => env('MODULE_MENU_ENABLED', true),

    /*
    |--------------------------------------------------------------------------
    | Preparation time
    |--------------------------------------------------------------------------
    | What `MenuCatalog::prepMinutes()` answers for a dish this restaurant does
    | not have. Never zero: a zero reads as "ready immediately" on a guest's
    | tracking screen, which is the one wrong answer indistinguishable from a
    | right one.
    */
    'default_prep_minutes' => (int) env('MENU_DEFAULT_PREP_MINUTES', 15),

    /*
    |--------------------------------------------------------------------------
    | Dish photographs
    |--------------------------------------------------------------------------
    | Uploaded through POST /v1/menu/items/{item}/image and kept by
    | App\Support\Media: every upload becomes the WebP renditions below, under
    | a sharded, content-hashed key (see MediaStore), and the row records the
    | set. Nothing is stored as it arrived.
    |
    | The disk defaults to `public` rather than to FILESYSTEM_DISK, because a
    | dish photograph is on a public menu by definition and the application's
    | default disk is private. On this host `public` is `storage/app/public`,
    | which nginx serves straight from disk under /storage with a year of
    | cache; on a cluster MENU_IMAGE_DISK=s3 points the same code at MinIO or
    | S3 and AWS_URL at the CDN in front of it. The keys are identical on both,
    | so a bucket can be copied across without rewriting a row.
    |
    | The renditions are what the menu is drawn at. `thumb` is the 48px till
    | tile and the cart line at 3×; `card` is a phone-width menu card at 2×;
    | `full` is the dish sheet and a tablet at 2×. A photograph narrower than a
    | rendition is stored at its own width — never upscaled — and the row says
    | so. Changing a width here changes what future uploads produce; existing
    | photographs keep the sizes they were made at until re-uploaded.
    |
    | 12 MB and 25 megapixels: a phone photograph is four to eight megabytes
    | and twelve megapixels, so an owner uploads what the camera made and the
    | platform does the shrinking. The megapixel ceiling is read from the
    | header before the file is decoded, because it is what bounds memory: a
    | decoded image is four bytes per pixel regardless of what it weighed on
    | disk.
    */
    'images' => [
        'disk' => env('MENU_IMAGE_DISK', 'public'),
        'max_kilobytes' => (int) env('MENU_IMAGE_MAX_KB', 12288),
        'max_megapixels' => (float) env('MENU_IMAGE_MAX_MEGAPIXELS', 25),
        'mimes' => ['jpeg', 'jpg', 'png', 'webp'],
        'renditions' => [
            'thumb' => ['width' => 160, 'quality' => 75],
            'card' => ['width' => 640, 'quality' => 80],
            'full' => ['width' => 1600, 'quality' => 82],
        ],
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
            MenuModifierSeeder::class,
        ],
        'tables' => ['menu.modifier_groups', 'menu.modifier_options'],
    ],
];
