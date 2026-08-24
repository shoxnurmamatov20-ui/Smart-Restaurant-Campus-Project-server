<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A dish photograph is three files and four facts, not one URL.
 *
 * ---------------------------------------------------------------------------
 * What `image_url` could not say
 *
 * The column holds one address. A menu is drawn at three sizes — a 48px tile on
 * a till, a 160px card on a phone, a full-width sheet when the dish is opened —
 * and one address means one of two wrong things: the full photograph served to
 * the tile (120 KB to paint 48 pixels, two hundred times over, on mobile data)
 * or the tile's photograph served to the sheet (a 160px picture stretched over
 * a phone's width). It also could not say how tall the picture is, so every
 * surface reserved a guess and reflowed when the file arrived; and it could not
 * carry a placeholder, so every surface drew grey until then.
 *
 * ---------------------------------------------------------------------------
 * The shape
 *
 *   {
 *     "hash": "6b2c91f4a1b2",            content hash of the upload; in every key
 *     "width": 1600, "height": 1200,     the photograph, upright
 *     "placeholder": "data:image/webp;base64,…",   16px, a few hundred bytes
 *     "renditions": {
 *       "thumb": { "width": 160,  "height": 120  },
 *       "card":  { "width": 640,  "height": 480  },
 *       "full":  { "width": 1600, "height": 1200 }
 *     },
 *     "bytes": 163840,                   what the three files cost, together
 *     "uploaded_at": "2026-08-23T10:14:02+05:00"
 *   }
 *
 * No URLs in it. An address is built at read time from the hash, the tenant,
 * the dish and the rendition name (`App\Support\Media\MediaStore::key()`), so
 * moving the bucket — local disk to MinIO, MinIO behind a CDN — is a config
 * change, not an UPDATE across every menu on the platform.
 *
 * ---------------------------------------------------------------------------
 * `image_url` stays
 *
 * Nineteen readers across five clients know that name, and a restaurant can
 * also type an external address into it — a photograph hosted elsewhere is a
 * legitimate thing to point a menu at. It remains the fallback: the resource
 * answers from `image` when the platform holds the photograph and from
 * `image_url` when it does not.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menu.menu_items', function (Blueprint $table): void {
            $table->jsonb('image')->nullable()->after('image_url')
                ->comment('The platform-held photograph: hash, dimensions, renditions, placeholder. Addresses are derived, never stored.');
        });
    }

    public function down(): void
    {
        Schema::table('menu.menu_items', function (Blueprint $table): void {
            $table->dropColumn('image');
        });
    }
};
