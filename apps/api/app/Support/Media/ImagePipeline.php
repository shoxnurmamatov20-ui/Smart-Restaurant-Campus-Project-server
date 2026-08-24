<?php

declare(strict_types=1);

namespace App\Support\Media;

use GdImage;

/**
 * A photograph, on its way from a phone to a menu.
 *
 * ---------------------------------------------------------------------------
 * Why this exists at all
 *
 * A dish photograph is the only file this platform invites a restaurant to
 * upload, and the numbers around it are not small: a menu is 60–300 dishes, a
 * business is one to fifty branches, and the product is aimed at every
 * restaurant, café, canteen and bar that will have it. The difference between
 * storing what the camera produced and storing what a screen can show is about
 * fifty to one — four megabytes against eighty kilobytes — and it is paid twice:
 * once in the bucket, for ever, and once per guest per menu open, on mobile data
 * that the guest pays for.
 *
 * So nothing is stored as it arrived. Every upload is decoded, turned the right
 * way up, scaled to a fixed set of widths, re-encoded as WebP, and stripped of
 * everything else it was carrying.
 *
 * ---------------------------------------------------------------------------
 * WebP, and not the format that arrived
 *
 * WebP at quality 80 is 25–35% smaller than JPEG at the same visible quality on
 * photographs of food, and it keeps alpha, which PNG uploads need. Every browser
 * this platform supports has decoded it since 2020 — Safari included, from 14 —
 * and the two consumers that are not browsers (the Android shell, the Telegram
 * WebView) are Chromium. There is no fallback JPEG for the same reason there is
 * no fallback GIF: a second copy of every rendition doubles the bucket to serve
 * a browser nobody is using.
 *
 * AVIF is smaller still and this build of GD can write it, but encoding one is
 * seconds rather than milliseconds of CPU inside a request a manager is waiting
 * on. The encoder is chosen by config, so the day that moves to a queue it is a
 * config change here rather than a rewrite.
 *
 * ---------------------------------------------------------------------------
 * GD, and not Intervention or Imagick
 *
 * GD is compiled into the runtime this application already requires; Imagick is
 * not installed on the production host and Intervention is a dependency wrapping
 * one of the two. What is needed here is decode, rotate, scale, encode — four
 * operations, all of them GD's.
 *
 * The one thing GD does not do for us is safety, so this class does it:
 * dimensions are read from the header BEFORE the file is decoded, and anything
 * over the configured megapixel ceiling is refused. A 40-megapixel JPEG is
 * eleven megabytes on disk and 160 in memory once GD has it — a decompression
 * bomb does not need to be malicious to take a php-fpm worker down.
 */
final class ImagePipeline
{
    /** What `getimagesizefromstring` answers for the three formats accepted. */
    private const DECODABLE = [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP];

    public function __construct(
        /** Refused above this, before any decode. */
        private readonly float $maxMegapixels = 25.0,
        /** The long edge of the inline placeholder — see `placeholder()`. */
        private readonly int $placeholderWidth = 16,
    ) {}

    /**
     * Every requested size of one upload, plus the inline placeholder.
     *
     * Returned as one object rather than written anywhere: storing is somebody
     * else's job, and a pipeline that cannot be run without a bucket cannot be
     * tested without one either.
     *
     * @param array<int, ImageRendition> $renditions
     *
     * @throws ImageRejected when the bytes are not an image this build can read,
     *                       or are larger than the ceiling allows
     */
    public function process(string $binary, array $renditions): ProcessedImage
    {
        $source = $this->decode($binary);

        try {
            $width = imagesx($source);
            $height = imagesy($source);

            $encoded = [];

            foreach ($renditions as $rendition) {
                $encoded[$rendition->name] = $this->render($source, $rendition->width, $rendition->quality);
            }

            return new ProcessedImage(
                width: $width,
                height: $height,
                renditions: $encoded,
                placeholder: $this->placeholder($source),
            );
        } finally {
            imagedestroy($source);
        }
    }

    /**
     * The header, read before anything is allocated.
     *
     * @return array{0: int, 1: int, 2: int} width, height, IMAGETYPE_*
     *
     * @throws ImageRejected
     */
    public function inspect(string $binary): array
    {
        $info = @getimagesizefromstring($binary);

        if ($info === false) {
            throw ImageRejected::unreadable();
        }

        [$width, $height, $type] = [(int) $info[0], (int) $info[1], (int) $info[2]];

        if (! in_array($type, self::DECODABLE, true)) {
            throw ImageRejected::unsupportedFormat();
        }

        if ($width < 1 || $height < 1) {
            throw ImageRejected::unreadable();
        }

        if (($width * $height) > ($this->maxMegapixels * 1_000_000)) {
            throw ImageRejected::tooManyPixels((int) $this->maxMegapixels);
        }

        return [$width, $height, $type];
    }

    /**
     * Decoded, upright, and with a background under anything transparent.
     *
     * @throws ImageRejected
     */
    private function decode(string $binary): GdImage
    {
        [, , $type] = $this->inspect($binary);

        $image = @imagecreatefromstring($binary);

        if (! $image instanceof GdImage) {
            // The header parsed and the body did not: a truncated upload, or a
            // format this build of GD was compiled without. Refusing is the only
            // honest answer — storing it would put bytes no browser can draw
            // behind a URL a menu will ask for.
            throw ImageRejected::unreadable();
        }

        // A palette PNG scales badly — GD picks nearest-colour without this and
        // a gradient comes out banded.
        if (! imageistruecolor($image)) {
            imagepalettetotruecolor($image);
        }

        imagealphablending($image, false);
        imagesavealpha($image, true);

        if ($type === IMAGETYPE_JPEG) {
            $image = $this->upright($image, $binary);
        }

        return $image;
    }

    /**
     * Turn the photograph the way the camera was held.
     *
     * A phone held sideways writes the sensor's own landscape frame and an EXIF
     * tag saying which way is up; every viewer honours the tag and every naive
     * resize throws it away. Without this a third of an owner's uploads arrive
     * on the menu lying on their side — and because the file *looks* right in
     * the phone's gallery, the report is "your website rotates my photos".
     */
    private function upright(GdImage $image, string $binary): GdImage
    {
        if (! function_exists('exif_read_data')) {
            return $image;
        }

        // From memory rather than a temporary file: the upload is already a
        // string here, and a tmpfile per upload is a file descriptor and a disk
        // write for one integer.
        $exif = @exif_read_data('data://image/jpeg;base64,'.base64_encode($binary));

        $orientation = is_array($exif) ? (int) ($exif['Orientation'] ?? 1) : 1;

        if ($orientation <= 1 || $orientation > 8) {
            return $image;
        }

        // The eight EXIF orientations are four rotations, each optionally
        // mirrored. Mirrored ones are rare — they come from front cameras that
        // save the preview rather than the capture — but a mirrored dish is a
        // mirrored menu, and the flip costs one call.
        $rotate = match ($orientation) {
            3, 4 => 180,
            5, 6 => -90,
            7, 8 => 90,
            default => 0,
        };

        if ($rotate !== 0) {
            $rotated = imagerotate($image, $rotate, 0);

            if ($rotated instanceof GdImage) {
                imagedestroy($image);
                $image = $rotated;
                imagealphablending($image, false);
                imagesavealpha($image, true);
            }
        }

        if (in_array($orientation, [2, 4, 5, 7], true)) {
            imageflip($image, IMG_FLIP_HORIZONTAL);
        }

        return $image;
    }

    /**
     * One size, never larger than what arrived.
     *
     * A 400px photograph asked for at 1280 is stored at 400: upscaling invents
     * detail, costs four times the bytes to say the same thing, and makes a
     * blurry picture look like a fault in the menu rather than in the photograph.
     * The client is told the real width, so its `srcset` stays honest.
     */
    private function render(GdImage $source, int $targetWidth, int $quality): EncodedImage
    {
        $width = imagesx($source);
        $height = imagesy($source);

        $scale = min(1.0, $targetWidth / max(1, $width));

        $outWidth = max(1, (int) round($width * $scale));
        $outHeight = max(1, (int) round($height * $scale));

        return $this->encode($this->resample($source, $outWidth, $outHeight), $quality);
    }

    /**
     * The blurred stand-in a surface can draw before the network answers.
     *
     * Sixteen pixels wide, WebP at quality 40: a few hundred bytes, small enough
     * to travel inside the JSON that describes the dish and be painted as a
     * background under the real photograph. It is what turns a grey rectangle
     * that pops into a picture — the pattern every photo-led product uses —
     * without a second request, a placeholder service, or a colour we guessed.
     */
    private function placeholder(GdImage $source): ?string
    {
        $width = imagesx($source);
        $height = imagesy($source);

        $outWidth = max(1, min($this->placeholderWidth, $width));
        $outHeight = max(1, (int) round($height * ($outWidth / max(1, $width))));

        $tiny = $this->encode($this->resample($source, $outWidth, $outHeight), 40);

        $encoded = 'data:image/webp;base64,'.base64_encode($tiny->bytes);

        // A guard rather than a rule: on a photograph this is 200–500 bytes. If
        // some input ever produces more, the dish is better off with no
        // placeholder than with a kilobyte of it repeated on every row of a
        // menu response.
        return strlen($encoded) > 2048 ? null : $encoded;
    }

    private function resample(GdImage $source, int $width, int $height): GdImage
    {
        $canvas = imagecreatetruecolor($width, $height);

        // Alpha survives the copy: a PNG of a drink with a transparent
        // background is a legitimate upload, and WebP can carry it.
        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);
        imagefill($canvas, 0, 0, imagecolorallocatealpha($canvas, 0, 0, 0, 127));

        imagecopyresampled(
            $canvas,
            $source,
            0, 0, 0, 0,
            $width, $height,
            imagesx($source), imagesy($source),
        );

        return $canvas;
    }

    /** Encodes and disposes: every caller here hands over a fresh canvas. */
    private function encode(GdImage $image, int $quality): EncodedImage
    {
        $width = imagesx($image);
        $height = imagesy($image);

        ob_start();
        imagewebp($image, null, $quality);
        $bytes = (string) ob_get_clean();

        imagedestroy($image);

        return new EncodedImage($bytes, $width, $height);
    }
}
