<?php

declare(strict_types=1);

namespace App\Support\Media;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;

/**
 * Where an object goes, what it is called, and how it is reached.
 *
 * ---------------------------------------------------------------------------
 * The key, and why it looks like that
 *
 *   dish/3f/a1/7412/9183/6b2c91f4-card.webp
 *   └┬─┘ └┬┘ └┬┘ └┬─┘ └┬─┘ └───┬──┘ └─┬─┘
 *    │    │   │   │    │       │      the rendition
 *    │    │   │   │    │       the content hash
 *    │    │   │   │    the dish
 *    │    │   │   the restaurant
 *    │    two shard levels, from a hash of the restaurant id
 *    what kind of thing this is
 *
 * **The two shard levels are the part that is about scale.** This platform is
 * built for every restaurant in the country and then some; a flat
 * `dish/{tenant}/…` tree puts a directory entry per restaurant in one directory.
 * ext4 copes with a few hundred thousand and then `readdir` becomes the slowest
 * thing on the box; an S3 prefix is partitioned by its leading characters, so a
 * common prefix concentrates every write on one partition and the bucket starts
 * answering 503 SlowDown under load. Two hex levels is 65 536 buckets — a
 * million restaurants is fifteen per bucket, and the same layout works on a
 * local disk, on MinIO and on S3 without a migration between them.
 *
 * **The content hash is what makes the URL immutable.** A dish re-photographed
 * gets a new hash, so the old URL is never re-used, so every layer between the
 * bucket and the phone — CDN, nginx, the browser's own cache — can be told to
 * keep the file for a year and never revalidate. The store this replaced used a
 * fixed path with `?v={timestamp}`, which is the same idea with three flaws: a
 * query string is ignored by some CDN configurations, an intermediate cache
 * that keys on the path alone serves the previous photograph, and a rollback of
 * the row leaves the URL pointing at bytes that no longer match it.
 *
 * The hash is of the ORIGINAL upload, not of each rendition, so all three
 * renditions of one photograph share it and the set can be deleted by prefix
 * without listing the bucket.
 */
final class MediaStore
{
    public function __construct(private readonly string $disk) {}

    public static function forDisk(string $disk): self
    {
        return new self($disk);
    }

    /**
     * The key for one rendition of one photograph.
     *
     * @param string $kind what this is a photograph of — `dish` today
     * @param int $tenantId the restaurant, which is also what shards the tree
     * @param int $ownerId the row the photograph belongs to
     * @param string $hash the content hash of the upload
     * @param string $rendition the size's name
     */
    public function key(string $kind, int $tenantId, int $ownerId, string $hash, string $rendition): string
    {
        [$first, $second] = self::shards($tenantId);

        return sprintf('%s/%s/%s/%d/%d/%s-%s.webp', $kind, $first, $second, $tenantId, $ownerId, $hash, $rendition);
    }

    /**
     * Two hex bytes from the restaurant id.
     *
     * `crc32` and not `sha1`: this is a bucketing function, not a security one,
     * and the only property needed is that consecutive ids land in different
     * buckets — which sequential ids through a hash do, and sequential ids
     * through `% 256` do not.
     *
     * @return array{0: string, 1: string}
     */
    public static function shards(int $tenantId): array
    {
        $digest = dechex(crc32('tenant:'.$tenantId));
        $digest = str_pad($digest, 8, '0', STR_PAD_LEFT);

        return [substr($digest, 0, 2), substr($digest, 2, 2)];
    }

    /** The content hash a key carries — short on purpose; it is a cache key, not a checksum. */
    public static function hash(string $binary): string
    {
        return substr(hash('xxh128', $binary), 0, 12);
    }

    public function put(string $key, string $bytes): void
    {
        /*
         * `public` visibility, spelled out rather than left to the disk.
         *
         * On S3 it is the object ACL; on a local disk it is the file mode. A
         * dish photograph is on a public menu — there is nothing to protect —
         * and an object written private is a 403 that looks exactly like a
         * missing file from the outside.
         */
        $this->filesystem()->put($key, $bytes, 'public');
    }

    /** @param array<int, string> $keys */
    public function delete(array $keys): void
    {
        if ($keys === []) {
            return;
        }

        $this->filesystem()->delete($keys);
    }

    /**
     * The address a browser asks for.
     *
     * Built at read time from the key rather than stored beside it, so moving a
     * bucket behind a CDN — or moving from the local disk to MinIO — is a
     * config change rather than an `UPDATE` over every menu on the platform.
     */
    public function url(string $key): string
    {
        return $this->filesystem()->url($key);
    }

    public function exists(string $key): bool
    {
        return $this->filesystem()->exists($key);
    }

    private function filesystem(): Filesystem
    {
        return Storage::disk($this->disk);
    }
}
