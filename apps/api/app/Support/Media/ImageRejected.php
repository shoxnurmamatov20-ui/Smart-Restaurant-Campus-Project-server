<?php

declare(strict_types=1);

namespace App\Support\Media;

use RuntimeException;

/**
 * The upload was not something this platform can put on a menu.
 *
 * A domain exception rather than a bare `RuntimeException`, because the caller
 * has to be able to answer 422 — the person on the other end chose the wrong
 * file and can choose another. The previous store threw `RuntimeException` for
 * the same cases and every one of them reached the manager as a 500, which
 * reads as "the system is broken" rather than "that photo is too big".
 *
 * The messages are Uzbek because they are shown to the person who pressed the
 * button; the reason beside each one is what a caller switches on — the Menu
 * module maps it onto its error catalogue (`menu.image_{reason}`), which is
 * where the Russian and English live.
 */
final class ImageRejected extends RuntimeException
{
    private function __construct(public readonly string $reason, string $message)
    {
        parent::__construct($message);
    }

    public static function unreadable(): self
    {
        return new self('unreadable', 'Rasmni o\'qib bo\'lmadi — fayl buzilgan yoki rasm emas.');
    }

    public static function unsupportedFormat(): self
    {
        return new self('unsupported_format', 'Faqat JPG, PNG yoki WebP qabul qilinadi.');
    }

    public static function tooManyPixels(int $megapixels): self
    {
        return new self(
            'too_many_pixels',
            sprintf('Rasm juda katta — %d megapikseldan oshmasin. Telefonda kesib yuboring.', $megapixels),
        );
    }
}
