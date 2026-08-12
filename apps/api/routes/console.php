<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schedule;

/*
|--------------------------------------------------------------------------
| Scheduled work — Smart Restaurant Campus
|--------------------------------------------------------------------------
| Requires one cron entry on the server:
|   * * * * * cd /path/to/apps/api && php artisan schedule:run >> /dev/null 2>&1
*/

/*
 * The outbox safety net. EventBus delivers straight after commit, so this
 * normally finds nothing — it exists for the times a subscriber was throwing or
 * a worker died mid-request. `withoutOverlapping` matters: two relays running
 * together would deliver the same event twice to every subscriber.
 */
Schedule::command('events:relay')
    ->everyMinute()
    ->withoutOverlapping()
    ->runInBackground();

/*
 * Audit retention, per config/activitylog.php (two years). Runs at a dead hour
 * because it deletes in bulk.
 */
Schedule::command('activitylog:clean')
    ->dailyAt('03:30')
    ->withoutOverlapping();

/*
 * Expired Sanctum tokens. A device token nobody revoked is a way in.
 */
Schedule::command('sanctum:prune-expired --hours=24')
    ->daily();
