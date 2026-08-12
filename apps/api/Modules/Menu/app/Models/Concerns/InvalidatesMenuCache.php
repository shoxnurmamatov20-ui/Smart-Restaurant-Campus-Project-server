<?php

declare(strict_types=1);

namespace Modules\Menu\Models\Concerns;

use Illuminate\Database\Eloquent\Model;
use Modules\Menu\Services\MenuCache;

/**
 * Bumps the restaurant's menu version whenever the menu changes.
 *
 * On the model rather than in the controller on purpose: a dish gets repriced
 * from the API, from a seeder, from an import, from tinker and from a queued
 * job, and a guest reading a stale price on a QR code is the same complaint
 * whichever path wrote it.
 *
 * `saved` covers both create and update; `deleted` and `restored` cover a dish
 * leaving and returning. The tenant is taken from the row rather than from the
 * request, because a console command has no request behind it.
 */
trait InvalidatesMenuCache
{
    protected static function bootInvalidatesMenuCache(): void
    {
        foreach (['saved', 'deleted', 'restored'] as $event) {
            static::registerModelEvent($event, static function (Model $model): void {
                $tenantId = $model->getAttribute('tenant_id');

                app(MenuCache::class)->flush(is_int($tenantId) ? $tenantId : null);
            });
        }
    }
}
