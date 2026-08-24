<?php

declare(strict_types=1);

namespace Modules\Menu\Services;

use App\Support\Tenancy\BranchContext;
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
 *
 * Keys are per branch as well as per restaurant — see `key()`. The version counter
 * is not: a stop in one venue orphans every venue's cached menu, which is more
 * invalidation than strictly needed and the cheap side of the trade. The expensive
 * side would be a counter per branch and a chef in Chilonzor wondering why the QR
 * menu in the room still lists Manti.
 */
final class MenuCache
{
    /** A dish returning from the stop-list appears within this long. */
    private const TTL_SECONDS = 60;

    public function __construct(
        private readonly TenantContext $tenants,
        private readonly BranchContext $branches,
    ) {}

    /**
     * Remember one variant of the menu.
     *
     * @template TValue
     *
     * @param  Closure(): TValue  $build
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

    /**
     * The cache key, and the branch is part of it.
     *
     * Not decoration. The menu became branch-dependent the day the stop-list did:
     * Chilonzor is out of Manti and Termiz is not, and one key for both would serve
     * Chilonzor's answer to a guest sitting in Termiz — who would then order a dish
     * that is available, be told it is not, and be right.
     *
     * `0` for a request with no branch, which is a real state rather than a
     * fallback: a menu read across the whole business has no 86 sheet applied to
     * it, so it is a genuinely different answer and deserves its own key.
     */
    private function key(int $tenantId, string $variant): string
    {
        return sprintf(
            'menu:%d:b%d:v%d:%s',
            $tenantId,
            $this->branches->id() ?? 0,
            $this->version($tenantId),
            $variant,
        );
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
