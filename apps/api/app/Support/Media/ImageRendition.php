<?php

declare(strict_types=1);

namespace App\Support\Media;

/**
 * A size the platform keeps, and what it is for.
 *
 * Named rather than numbered, because the name is what a client asks for and
 * the number is ours to change: a `thumb` that becomes 240px next year must not
 * mean re-writing every surface that draws one.
 */
final readonly class ImageRendition
{
    public function __construct(
        public string $name,
        /** The long edge, in pixels. Never an upscale — see ImagePipeline. */
        public int $width,
        /** 0–100, WebP. */
        public int $quality,
    ) {}

    /**
     * @param array<string, array{width?: int|string, quality?: int|string}> $config
     *
     * @return array<int, self>
     */
    public static function fromConfig(array $config): array
    {
        $renditions = [];

        foreach ($config as $name => $spec) {
            $renditions[] = new self(
                name: (string) $name,
                width: (int) ($spec['width'] ?? 0),
                quality: (int) ($spec['quality'] ?? 80),
            );
        }

        // Widest last, so a caller writing them in order writes the small ones
        // first — which is the order a client wants them declared in a srcset.
        usort($renditions, static fn (self $a, self $b): int => $a->width <=> $b->width);

        return $renditions;
    }
}
