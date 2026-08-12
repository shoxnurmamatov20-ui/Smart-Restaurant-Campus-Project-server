<?php

declare(strict_types=1);

namespace Modules\Menu\Services;

use App\Support\Tenancy\TenantContext;
use Closure;
use Illuminate\Support\Facades\Cache;

/**
 * Keeps the guest menu out of the database.
 *
 * The QR menu is the single most-requested endpoint the platform has: every
 * guest at every table opens it, usually more than once, and it is the only one
 * with no login to slow anybody down. Rebuilding it per request means the same
 * handful of queries — categories, their children, their orderable items —
 * running hundreds of times an hour per venue, for a payload that changes when
 * the chef changes it and not before.
 *
 * Invalidation is by version counter rather than by key enumeration: a menu
 * changes, the restaurant's counter moves, and every cached variant (channel ×
 * locale) is orphaned at once. No key list to keep in step, and no risk of a
 * stale variant nobody remembered to flush.
 *
 * The TTL is short on purpose. `stopped_until` expires on the clock rather than
 * on a write, so a dish coming back from the stop-list has no event to hang
 * invalidation on; the TTL is what bounds that delay.
 */
final class MenuCache
{
    /** A dish returning from the stop-list appears within this long. */
    private const TTL_SECONDS = 60;

    public function __construct(private readonly TenantContext $tenants) {}

    /**
     * Remember one variant of the menu.
     *
     * @template TValue
     *
     * @param Closure(): TValue $build
     *
     * @return TValue
     */
    public function remember(string $variant, Closure $build): mixed
    {
        $tenantId = $this->tenants->id();

        // No restaurant, nothing to key on — and nothing worth caching either.
        if ($tenantId === null) {
            return $build();
        }

        return Cache::remember(
            $this->key($tenantId, $variant),
            self::TTL_SECONDS,
            $build,
        );
    }

    /**
     * Mark this restaurant's menu as changed.
     *
     * Called from the model boot hooks, so every path that writes a dish — the
     * API, a seeder, an import, tinker — invalidates without having to remember to.
     */
    public function flush(?int $tenantId = null): void
    {
        $tenantId ??= $this->tenants->id();

        if ($tenantId === null) {
            return;
        }

        // increment() returns false when the key is absent, which is the normal
        // case on a cold cache — start the counter instead.
        if (Cache::increment($this->versionKey($tenantId)) === false) {
            Cache::forever($this->versionKey($tenantId), 1);
        }
    }

    /** What a client can compare to decide whether to re-download the menu. */
    public function etag(string $variant): string
    {
        return '"'.substr(hash('xxh128', $this->key($this->tenants->id() ?? 0, $variant)), 0, 24).'"';
    }

    public function ttl(): int
    {
        return self::TTL_SECONDS;
    }

    private function key(int $tenantId, string $variant): string
    {
        return sprintf('menu:%d:v%d:%s', $tenantId, $this->version($tenantId), $variant);
    }

    private function version(int $tenantId): int
    {
        return (int) Cache::get($this->versionKey($tenantId), 1);
    }

    private function versionKey(int $tenantId): string
    {
        return "menu:{$tenantId}:version";
    }
}
