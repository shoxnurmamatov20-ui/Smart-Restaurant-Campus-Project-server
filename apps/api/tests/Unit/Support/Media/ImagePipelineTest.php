<?php

declare(strict_types=1);

namespace Tests\Unit\Support\Media;

use App\Support\Media\ImagePipeline;
use App\Support\Media\ImageRejected;
use App\Support\Media\ImageRendition;
use PHPUnit\Framework\TestCase;

/**
 * What the pipeline does to pixels — with no bucket, no database, no request.
 *
 * Every input here is drawn by GD inside the test, so what goes in is known to
 * the pixel and what comes out can be measured rather than eyeballed.
 */
final class ImagePipelineTest extends TestCase
{
    /** @return array<int, ImageRendition> */
    private function renditions(): array
    {
        return ImageRendition::fromConfig([
            'full' => ['width' => 1600, 'quality' => 82],
            'thumb' => ['width' => 160, 'quality' => 75],
            'card' => ['width' => 640, 'quality' => 80],
        ]);
    }

    private function jpeg(int $width, int $height, ?callable $paint = null): string
    {
        $image = imagecreatetruecolor($width, $height);
        imagefill($image, 0, 0, (int) imagecolorallocate($image, 200, 120, 40));

        if ($paint !== null) {
            $paint($image);
        }

        ob_start();
        imagejpeg($image, null, 90);
        imagedestroy($image);

        return (string) ob_get_clean();
    }

    /**
     * A JPEG that says "I was taken with the phone turned".
     *
     * GD cannot write EXIF, so the APP1 segment is assembled by hand and spliced
     * in after the SOI marker: a TIFF header, one IFD with one entry — tag
     * 0x0112, Orientation — and the value asked for. It is the smallest valid
     * EXIF block there is, and `exif_read_data` reads it like any camera's.
     */
    private function jpegWithOrientation(string $jpeg, int $orientation): string
    {
        $tiff = 'II'.pack('v', 42).pack('V', 8)            // little-endian, magic, IFD0 at byte 8
            .pack('v', 1)                                      // one entry
            .pack('v', 0x0112).pack('v', 3).pack('V', 1).pack('v', $orientation).pack('v', 0)
            .pack('V', 0);                                     // no next IFD

        $payload = "Exif\0\0".$tiff;
        $app1 = "\xFF\xE1".pack('n', strlen($payload) + 2).$payload;

        return substr($jpeg, 0, 2).$app1.substr($jpeg, 2);
    }

    private function png(int $width, int $height, bool $transparent): string
    {
        $image = imagecreatetruecolor($width, $height);
        imagealphablending($image, false);
        imagesavealpha($image, true);
        imagefill($image, 0, 0, (int) imagecolorallocatealpha($image, 30, 90, 200, $transparent ? 127 : 0));

        ob_start();
        imagepng($image);
        imagedestroy($image);

        return (string) ob_get_clean();
    }

    private function isWebp(string $bytes): bool
    {
        return str_starts_with($bytes, 'RIFF') && substr($bytes, 8, 4) === 'WEBP';
    }

    public function test_a_camera_original_becomes_three_webp_files_at_fixed_widths(): void
    {
        $processed = (new ImagePipeline)->process($this->jpeg(4000, 3000), $this->renditions());

        $this->assertSame(4000, $processed->width);
        $this->assertSame(3000, $processed->height);

        $this->assertSame(['thumb', 'card', 'full'], array_keys($processed->renditions));

        foreach ($processed->renditions as $rendition) {
            $this->assertTrue($this->isWebp($rendition->bytes), 'every rendition is WebP');
        }

        $this->assertSame([160, 120], [$processed->renditions['thumb']->width, $processed->renditions['thumb']->height]);
        $this->assertSame([640, 480], [$processed->renditions['card']->width, $processed->renditions['card']->height]);
        $this->assertSame([1600, 1200], [$processed->renditions['full']->width, $processed->renditions['full']->height]);

        // The dimensions recorded are the dimensions encoded — a client reserves
        // its box from these numbers and they have to be the file's own.
        foreach ($processed->renditions as $rendition) {
            $decoded = getimagesizefromstring($rendition->bytes);
            $this->assertIsArray($decoded);
            $this->assertSame([$rendition->width, $rendition->height], [$decoded[0], $decoded[1]]);
        }
    }

    public function test_the_bytes_stored_are_a_fraction_of_the_bytes_uploaded(): void
    {
        // Noise, so JPEG cannot compress the source to nothing and the
        // comparison means something.
        $source = $this->jpeg(3000, 2000, static function (\GdImage $image): void {
            mt_srand(7);
            for ($i = 0; $i < 20000; $i++) {
                imagesetpixel($image, mt_rand(0, 2999), mt_rand(0, 1999), (int) imagecolorallocate($image, mt_rand(0, 255), mt_rand(0, 255), mt_rand(0, 255)));
            }
        });

        $processed = (new ImagePipeline)->process($source, $this->renditions());

        // The whole set — all three sizes together — under what arrived.
        $this->assertLessThan(strlen($source), $processed->bytes());
        // And the tile a till draws is a few kilobytes, not a few hundred.
        $this->assertLessThan(12 * 1024, $processed->renditions['thumb']->size());
    }

    public function test_a_small_photograph_is_never_upscaled(): void
    {
        $processed = (new ImagePipeline)->process($this->jpeg(300, 200), $this->renditions());

        $this->assertSame([160, 107], [$processed->renditions['thumb']->width, $processed->renditions['thumb']->height]);
        // `card` asks for 640 and `full` for 1600; the photograph has 300 to
        // give and that is what they get. Invented pixels are bytes that say
        // nothing and a blur that looks like our fault.
        $this->assertSame([300, 200], [$processed->renditions['card']->width, $processed->renditions['card']->height]);
        $this->assertSame([300, 200], [$processed->renditions['full']->width, $processed->renditions['full']->height]);
    }

    public function test_a_photograph_taken_sideways_is_turned_upright(): void
    {
        // Landscape on the sensor, with a mark in the top-left so the turn can
        // be seen: after a 6 ("rotate 90° clockwise") the frame is portrait and
        // the mark is top-right.
        $sideways = $this->jpegWithOrientation(
            $this->jpeg(400, 200, static function (\GdImage $image): void {
                imagefilledrectangle($image, 0, 0, 60, 60, (int) imagecolorallocate($image, 255, 255, 255));
            }),
            6,
        );

        $processed = (new ImagePipeline)->process($sideways, $this->renditions());

        $this->assertSame([200, 400], [$processed->width, $processed->height], 'portrait after the turn');

        $full = imagecreatefromstring($processed->renditions['full']->bytes);
        $this->assertInstanceOf(\GdImage::class, $full);

        $topRight = imagecolorsforindex($full, imagecolorat($full, 190, 10));
        $topLeft = imagecolorsforindex($full, imagecolorat($full, 10, 10));

        $this->assertGreaterThan(200, $topRight['red'], 'the white mark moved to the top-right');
        $this->assertLessThan(240, $topLeft['red'], 'and the top-left is the orange background');
    }

    public function test_a_png_keeps_its_transparency(): void
    {
        $processed = (new ImagePipeline)->process($this->png(400, 400, transparent: true), $this->renditions());

        $card = imagecreatefromstring($processed->renditions['card']->bytes);
        $this->assertInstanceOf(\GdImage::class, $card);

        $pixel = imagecolorsforindex($card, imagecolorat($card, 200, 200));
        // GD's alpha runs 0 (opaque) to 127 (transparent).
        $this->assertGreaterThan(100, $pixel['alpha'], 'a transparent drink photograph stays transparent');
    }

    public function test_the_placeholder_is_tiny_and_inline(): void
    {
        $processed = (new ImagePipeline)->process($this->jpeg(1200, 800), $this->renditions());

        $this->assertIsString($processed->placeholder);
        $this->assertStringStartsWith('data:image/webp;base64,', $processed->placeholder);
        // Small enough to travel in the JSON of every dish on a menu without
        // being the biggest thing in it.
        $this->assertLessThan(1024, strlen($processed->placeholder));

        $decoded = getimagesizefromstring((string) base64_decode(substr($processed->placeholder, strlen('data:image/webp;base64,')), true));
        $this->assertIsArray($decoded);
        $this->assertSame([16, 11], [$decoded[0], $decoded[1]]);
    }

    public function test_too_many_pixels_are_refused_before_anything_is_decoded(): void
    {
        $this->expectException(ImageRejected::class);

        try {
            (new ImagePipeline(maxMegapixels: 0.5))->process($this->jpeg(1000, 1000), $this->renditions());
        } catch (ImageRejected $rejected) {
            $this->assertSame('too_many_pixels', $rejected->reason);

            throw $rejected;
        }
    }

    public function test_bytes_that_are_not_an_image_are_refused(): void
    {
        try {
            (new ImagePipeline)->process('%PDF-1.7 not a picture at all', $this->renditions());
            $this->fail('a PDF is not a photograph');
        } catch (ImageRejected $rejected) {
            $this->assertSame('unreadable', $rejected->reason);
        }
    }

    public function test_a_format_the_menu_does_not_take_is_refused_by_name(): void
    {
        $image = imagecreatetruecolor(50, 50);
        ob_start();
        imagegif($image);
        imagedestroy($image);
        $gif = (string) ob_get_clean();

        try {
            (new ImagePipeline)->process($gif, $this->renditions());
            $this->fail('GIF is not on the list');
        } catch (ImageRejected $rejected) {
            $this->assertSame('unsupported_format', $rejected->reason);
        }
    }

    public function test_renditions_come_out_narrowest_first_whatever_order_they_were_declared_in(): void
    {
        $names = array_map(static fn (ImageRendition $r): string => $r->name, $this->renditions());

        $this->assertSame(['thumb', 'card', 'full'], $names);
    }
}
