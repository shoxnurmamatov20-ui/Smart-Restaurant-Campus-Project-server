<?php

declare(strict_types=1);

namespace App\Support\Media;

/**
 * A photograph as a client receives it: every size, each with an address.
 *
 * This is the read side of what `ImagePipeline` writes. The record in the row
 * carries hashes and dimensions and no addresses; this object is that record
 * with the addresses filled in from the disk that holds the files, which is
 * the one thing only the server knows.
 *
 *   {
 *     "src": ".../6b2c91f4a1b2-full.webp",     the largest, for anything that
 *                                              does not know about sizes
 *     "width": 1600, "height": 1200,           for the box, before the bytes
 *     "placeholder": "data:image/webp;base64,…",
 *     "sizes": {
 *       "thumb": { "url": "…-thumb.webp", "width": 160,  "height": 120  },
 *       "card":  { "url": "…-card.webp",  "width": 640,  "height": 480  },
 *       "full":  { "url": "…-full.webp",  "width": 1600, "height": 1200 }
 *     }
 *   }
 *
 * A browser client turns `sizes` into a `srcset` and lets the browser pick; a
 * native client picks by the box it is drawing into. Neither has to know how
 * the files are named.
 */
final readonly class ImageSet
{
    /**
     * @param  array<string, array{url: string, width: int, height: int}>  $sizes
     */
    public function __construct(
        public string $src,
        public int $width,
        public int $height,
        public ?string $placeholder,
        public array $sizes,
    ) {}

    /**
     * From the stored record, with addresses from the store.
     *
     * Null for a record this code cannot read — a row written by a future
     * version, or one damaged by hand — rather than an exception: a menu with
     * one dish drawn without its photograph is a menu; a menu that 500s is not.
     *
     * @param  array<string, mixed>  $record
     */
    public static function fromRecord(
        array $record,
        MediaStore $store,
        string $kind,
        int $tenantId,
        int $ownerId,
    ): ?self {
        $hash = $record['hash'] ?? null;
        $renditions = $record['renditions'] ?? null;

        if (! is_string($hash) || $hash === '' || ! is_array($renditions) || $renditions === []) {
            return null;
        }

        $sizes = [];

        foreach ($renditions as $name => $dimensions) {
            if (! is_string($name) || ! is_array($dimensions)) {
                continue;
            }

            $sizes[$name] = [
                'url' => $store->url($store->key($kind, $tenantId, $ownerId, $hash, $name)),
                'width' => (int) ($dimensions['width'] ?? 0),
                'height' => (int) ($dimensions['height'] ?? 0),
            ];
        }

        if ($sizes === []) {
            return null;
        }

        // The widest rendition is `src`: a reader that ignores `sizes` gets the
        // one that looks right everywhere, at the cost of bytes it may not need.
        uasort($sizes, static fn (array $a, array $b): int => $a['width'] <=> $b['width']);
        $largest = $sizes[array_key_last($sizes)];

        $placeholder = $record['placeholder'] ?? null;

        return new self(
            src: $largest['url'],
            width: (int) ($record['width'] ?? $largest['width']),
            height: (int) ($record['height'] ?? $largest['height']),
            placeholder: is_string($placeholder) && $placeholder !== '' ? $placeholder : null,
            sizes: $sizes,
        );
    }

    /** The address of one named size, or the largest when that name is not held. */
    public function url(string $rendition): string
    {
        return $this->sizes[$rendition]['url'] ?? $this->src;
    }

    /**
     * @return array{src: string, width: int, height: int, placeholder: string|null, sizes: array<string, array{url: string, width: int, height: int}>}
     */
    public function toArray(): array
    {
        return [
            'src' => $this->src,
            'width' => $this->width,
            'height' => $this->height,
            'placeholder' => $this->placeholder,
            'sizes' => $this->sizes,
        ];
    }
}
