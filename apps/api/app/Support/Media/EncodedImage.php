<?php

declare(strict_types=1);

namespace App\Support\Media;

/**
 * One finished rendition: the bytes, and the two numbers a browser needs before
 * it has them.
 *
 * Width and height travel with the bytes because the surfaces that draw a dish
 * reserve its box before the file arrives — a menu that reflows when the tenth
 * photograph lands is the same jank as a menu with no photographs, arriving
 * later.
 */
final readonly class EncodedImage
{
    public function __construct(
        public string $bytes,
        public int $width,
        public int $height,
    ) {}

    public function size(): int
    {
        return strlen($this->bytes);
    }
}
