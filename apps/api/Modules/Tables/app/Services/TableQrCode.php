<?php

declare(strict_types=1);

namespace Modules\Tables\Services;

use App\Support\Tenancy\TenantContext;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Modules\Tables\Models\RestaurantTable;

/**
 * The square that goes on the table.
 *
 * SVG rather than PNG, and that is the whole reason this renders server-side at
 * all. A QR sticker is printed — often at 60mm on a laser printer, sometimes
 * engraved on an acrylic stand — and a raster image is either too small for the
 * print or too large for the response. SVG is a few hundred bytes, scales to
 * any sticker, and drops straight into a print stylesheet.
 *
 * `bacon/bacon-qr-code` is already a dependency (it renders the platform's TOTP
 * codes), so this adds nothing to composer.json — which is the constraint that
 * ruled out every "nice" QR package.
 */
final class TableQrCode
{
    public function __construct(private readonly TenantContext $tenants) {}

    /**
     * The URL a camera resolves to.
     *
     * `{base}/qr/{restaurant}/{qr_token}` — the guest surface's own route,
     * segment for segment with `apps/web/src/app/(guest)/qr/[restaurant]/[table]`
     * and with the phone app's `srcp://qr/...` deep link. The two trees look
     * alike for exactly this reason: one sticker, printed once, has to land
     * somewhere in both.
     *
     * The restaurant slug is in the path as well as the token, even though the
     * token alone would identify the table. It is what tells the guest app which
     * tenant header to send, and it is what makes a mis-scanned token fail
     * inside the right restaurant rather than search the whole platform.
     */
    public function url(RestaurantTable $table): string
    {
        // Spelled out rather than `?->slug ?? ''`: `??` already suppresses the
        // null access on its left, so the nullsafe would be dead punctuation.
        $tenant = $this->tenants->tenant();
        $slug = $tenant === null ? '' : $tenant->slug;

        return sprintf(
            '%s/qr/%s/%s',
            rtrim((string) config('tables.qr.base_url', config('app.url')), '/'),
            rawurlencode($slug),
            rawurlencode((string) $table->qr_token),
        );
    }

    /** The same URL as a standalone `<svg>` document, ready to print. */
    public function svg(RestaurantTable $table): string
    {
        $renderer = new ImageRenderer(
            new RendererStyle(
                (int) config('tables.qr.size_pixels', 320),
                (int) config('tables.qr.margin_modules', 1),
            ),
            new SvgImageBackEnd,
        );

        return (new Writer($renderer))->writeString($this->url($table));
    }
}
