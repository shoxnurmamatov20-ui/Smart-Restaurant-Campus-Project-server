<?php

declare(strict_types=1);

namespace App\Support\Media;

/**
 * What came out of the pipeline: every rendition, and the two facts that
 * describe the photograph itself.
 */
final readonly class ProcessedImage
{
    /**
     * @param  array<string, EncodedImage>  $renditions  keyed by rendition name
     * @param  string|null  $placeholder  a `data:image/webp;base64,…` URI, or null
     *                                    when the encoder produced something too
     *                                    large to inline
     */
    public function __construct(
        /** The source's own dimensions, after rotation — what a client uses for aspect ratio. */
        public int $width,
        public int $height,
        public array $renditions,
        public ?string $placeholder,
    ) {}

    public function bytes(): int
    {
        return array_sum(array_map(
            static fn (EncodedImage $image): int => $image->size(),
            $this->renditions,
        ));
    }
}
