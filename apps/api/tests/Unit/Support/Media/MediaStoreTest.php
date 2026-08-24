<?php

declare(strict_types=1);

namespace Tests\Unit\Support\Media;

use App\Support\Media\ImageSet;
use App\Support\Media\MediaStore;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Where a photograph's files go, and how a client is told where they are.
 */
final class MediaStoreTest extends TestCase
{
    public function test_a_key_is_sharded_by_restaurant_and_named_by_content(): void
    {
        $store = MediaStore::forDisk('public');

        $key = $store->key('dish', 7412, 9183, '6b2c91f4a1b2', 'card');

        [$first, $second] = MediaStore::shards(7412);

        $this->assertSame("dish/{$first}/{$second}/7412/9183/6b2c91f4a1b2-card.webp", $key);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{2}$/', $first);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{2}$/', $second);
    }

    public function test_neighbouring_restaurants_land_in_different_shards(): void
    {
        // Sequential ids are what a database hands out, and the whole point
        // of hashing them is that 1000, 1001 and 1002 do not sit in one bucket.
        $shards = array_map(static fn (int $id): string => implode('/', MediaStore::shards($id)), range(1000, 1019));

        $this->assertGreaterThan(15, count(array_unique($shards)), 'twenty neighbours spread over at least sixteen buckets');
    }

    public function test_shards_are_stable_across_runs(): void
    {
        // A key that changed between deploys would orphan every photograph on
        // the platform at once. Pinned to a value rather than to a property.
        $this->assertSame(MediaStore::shards(1), MediaStore::shards(1));
        $this->assertSame(['fe', '6c'], MediaStore::shards(1));
    }

    public function test_the_hash_is_short_and_follows_the_bytes(): void
    {
        $a = MediaStore::hash('photograph one');
        $b = MediaStore::hash('photograph two');

        $this->assertSame(12, strlen($a));
        $this->assertNotSame($a, $b);
        $this->assertSame($a, MediaStore::hash('photograph one'));
    }

    public function test_an_image_set_builds_every_address_from_the_record(): void
    {
        // The fake keeps the disk's `url` only when told; a CDN in front of the
        // bucket is exactly the case the derived address exists for.
        Storage::fake('public', ['url' => 'https://cdn.example.test/storage']);

        $store = MediaStore::forDisk('public');

        $set = ImageSet::fromRecord([
            'hash' => 'abc123def456',
            'width' => 1600,
            'height' => 1200,
            'placeholder' => 'data:image/webp;base64,AAAA',
            'renditions' => [
                'full' => ['width' => 1600, 'height' => 1200],
                'thumb' => ['width' => 160, 'height' => 120],
                'card' => ['width' => 640, 'height' => 480],
            ],
        ], $store, 'dish', 5, 42);

        $this->assertInstanceOf(ImageSet::class, $set);

        [$first, $second] = MediaStore::shards(5);
        $base = "https://cdn.example.test/storage/dish/{$first}/{$second}/5/42/abc123def456";

        // Narrowest first, whatever order the record held them in — the order a
        // srcset wants — and `src` is the widest.
        $this->assertSame(['thumb', 'card', 'full'], array_keys($set->sizes));
        $this->assertSame("{$base}-full.webp", $set->src);
        $this->assertSame("{$base}-thumb.webp", $set->url('thumb'));
        $this->assertSame("{$base}-full.webp", $set->url('poster'), 'an unknown size answers the largest');
        $this->assertSame(160, $set->sizes['thumb']['width']);
        $this->assertSame('data:image/webp;base64,AAAA', $set->placeholder);

        $array = $set->toArray();
        $this->assertSame(['src', 'width', 'height', 'placeholder', 'sizes'], array_keys($array));
        $this->assertSame(1600, $array['width']);
    }

    public function test_a_record_this_code_cannot_read_answers_null_rather_than_failing_the_menu(): void
    {
        Storage::fake('public');
        $store = MediaStore::forDisk('public');

        $this->assertNull(ImageSet::fromRecord([], $store, 'dish', 1, 1));
        $this->assertNull(ImageSet::fromRecord(['hash' => 'x'], $store, 'dish', 1, 1));
        $this->assertNull(ImageSet::fromRecord(['hash' => 'x', 'renditions' => []], $store, 'dish', 1, 1));
        $this->assertNull(ImageSet::fromRecord(['hash' => 'x', 'renditions' => ['thumb' => 'not-an-array']], $store, 'dish', 1, 1));
    }

    public function test_files_are_written_public_and_deleted_as_a_set(): void
    {
        Storage::fake('public');
        $store = MediaStore::forDisk('public');

        $keys = [
            $store->key('dish', 1, 2, 'h', 'thumb'),
            $store->key('dish', 1, 2, 'h', 'card'),
        ];

        foreach ($keys as $key) {
            $store->put($key, 'bytes');
        }

        Storage::disk('public')->assertExists($keys);
        $this->assertSame('public', Storage::disk('public')->getVisibility($keys[0]));

        $store->delete($keys);
        $store->delete([]);

        Storage::disk('public')->assertMissing($keys);
    }
}
