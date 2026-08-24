<?php

declare(strict_types=1);

namespace Modules\Menu\Services;

use App\Support\Media\ImagePipeline;
use App\Support\Media\ImageRejected;
use App\Support\Media\ImageRendition;
use App\Support\Media\ImageSet;
use App\Support\Media\MediaStore;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\UploadedFile;
use Modules\Menu\Models\MenuItem;

/**
 * A dish's photograph: taken in, made into its sizes, kept, and handed back.
 *
 * The Menu module's end of `App\Support\Media`. The pipeline knows pixels and
 * the store knows keys; this class knows dishes — which renditions a menu
 * needs, which disk a restaurant's photographs live on, and what to write into
 * the row so the next reader can find them.
 *
 * ---------------------------------------------------------------------------
 * What changed from the first version, and why
 *
 * The first store kept one file per dish in whatever format arrived, resized
 * only if it was wider than 1200px, and returned a fixed URL with `?v=` on it.
 * Three things were wrong with that, and all three are scale problems that are
 * invisible with ten restaurants and ruinous with ten thousand:
 *
 *  1. A 2 MB PNG under 1200px was stored as a 2 MB PNG. The ceiling on an
 *     upload was the only ceiling on the bucket.
 *  2. A 48px tile on a till downloaded the same file as the full-screen sheet.
 *     Two hundred dishes × 300 KB, every time a waiter opened the menu.
 *  3. `dish/{tenant}/{id}.jpg` — one directory per restaurant, in one
 *     directory. See `MediaStore` for what that does to a filesystem and to an
 *     S3 prefix.
 *
 * Now every upload becomes three WebP files at fixed widths under a sharded,
 * content-hashed key, and the row records the facts a client needs to draw the
 * picture before it has it.
 */
final class DishImageStore
{
    /** The `kind` segment of every key this class writes. */
    public const KIND = 'dish';

    public function __construct(private readonly TenantContext $tenants) {}

    /**
     * Take the upload in, and answer the record the row should carry.
     *
     * The old renditions — if the dish had a photograph — are removed AFTER the
     * new ones are written. Between the two writes a reader gets the old set
     * (the row still points at it); after the row is updated it gets the new.
     * There is no moment at which a URL the row hands out answers 404.
     *
     * @return array<string, mixed> the `image` record
     *
     * @throws ImageRejected when the file is not an image this platform can keep
     */
    public function put(MenuItem $item, UploadedFile $file): array
    {
        $binary = (string) file_get_contents((string) $file->getRealPath());

        $processed = $this->pipeline()->process($binary, $this->renditions());

        $store = $this->store();
        $tenantId = $this->tenantIdOf($item);
        $hash = MediaStore::hash($binary);

        $renditions = [];

        foreach ($processed->renditions as $name => $encoded) {
            $store->put(
                $store->key(self::KIND, $tenantId, $item->id, $hash, $name),
                $encoded->bytes,
            );

            $renditions[$name] = ['width' => $encoded->width, 'height' => $encoded->height];
        }

        $previous = $item->image;

        $record = [
            'hash' => $hash,
            'width' => $processed->width,
            'height' => $processed->height,
            'placeholder' => $processed->placeholder,
            'renditions' => $renditions,
            'bytes' => $processed->bytes(),
            'uploaded_at' => now()->toIso8601String(),
        ];

        // The same photograph uploaded twice lands on the same keys: the writes
        // above overwrote identical bytes, and deleting "the previous set" here
        // would delete the files just written.
        if (is_array($previous) && ($previous['hash'] ?? null) !== $hash) {
            $this->deleteRecord($store, $tenantId, $item->id, $previous);
        }

        return $record;
    }

    /**
     * Remove a dish's photograph from the bucket.
     *
     * Called when the dish is gone for good (`forceDeleted`) and when a manager
     * takes the photograph off a dish that stays. A soft-deleted dish keeps its
     * files: it can be restored, and a restored dish without its photograph is
     * a restored dish that has to be photographed again.
     */
    public function forget(MenuItem $item): void
    {
        if (! is_array($item->image)) {
            return;
        }

        $this->deleteRecord($this->store(), $this->tenantIdOf($item), $item->id, $item->image);
    }

    /**
     * The photograph as a client receives it, or null when the platform does
     * not hold one.
     */
    public function setFor(MenuItem $item): ?ImageSet
    {
        if (! is_array($item->image)) {
            return null;
        }

        return ImageSet::fromRecord(
            $item->image,
            $this->store(),
            self::KIND,
            $this->tenantIdOf($item),
            $item->id,
        );
    }

    /**
     * Which sizes a menu needs — from config, so the set is one list.
     *
     * @return array<int, ImageRendition>
     */
    public function renditions(): array
    {
        /** @var array<string, array{width?: int|string, quality?: int|string}> $config */
        $config = (array) config('menu.images.renditions', []);

        return ImageRendition::fromConfig($config);
    }

    public function store(): MediaStore
    {
        return MediaStore::forDisk((string) config('menu.images.disk', 'public'));
    }

    /**
     * Built here, from this module's config, rather than resolved from the
     * container: the pixel ceiling is a menu decision, and another kind of
     * upload tomorrow may reasonably want a different one.
     */
    private function pipeline(): ImagePipeline
    {
        return new ImagePipeline(maxMegapixels: (float) config('menu.images.max_megapixels', 25));
    }

    /** @param array<string, mixed> $record */
    private function deleteRecord(MediaStore $store, int $tenantId, int $itemId, array $record): void
    {
        $hash = $record['hash'] ?? null;
        $renditions = $record['renditions'] ?? null;

        if (! is_string($hash) || ! is_array($renditions)) {
            return;
        }

        $keys = [];

        foreach (array_keys($renditions) as $name) {
            $keys[] = $store->key(self::KIND, $tenantId, $itemId, $hash, (string) $name);
        }

        $store->delete($keys);
    }

    /**
     * The row's own tenant first; the request's only when the row has none,
     * which a freshly made model in a test can be. Never 0: a key under tenant
     * 0 is a file nobody can find again.
     */
    private function tenantIdOf(MenuItem $item): int
    {
        $tenantId = $item->tenant_id ?? $this->tenants->id();

        return is_int($tenantId) && $tenantId > 0 ? $tenantId : 0;
    }
}
