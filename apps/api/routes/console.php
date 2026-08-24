<?php

declare(strict_types=1);

use App\Models\Tenant;
use Illuminate\Support\Facades\Log;
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

// The replay window is 48 hours (DATABASE.md §6.4); anything older can never be
// replayed, and this table is read by every write in the system — left alone it
// grows by one row per write forever.
Schedule::command('idempotency:prune')->hourly();

/*
|--------------------------------------------------------------------------
| Backups
|--------------------------------------------------------------------------
|
| `spatie/laravel-backup` has been a dependency since this project was set up
| and nothing has ever run it. The package was installed, the config file was
| published, and the three commands that make it a backup rather than a library
| were never scheduled — so a disk loss destroyed every order, payment, shift
| and Z-report the restaurant had ever taken, with no copy anywhere.
|
| Three commands and each does a different job. Running only the first is the
| usual mistake: it produces a directory that fills until the disk does, and
| gives no signal at all on the day the backups quietly stop.
*/

/*
 * 02:40, which is after the trading day and before the log cleanup at 03:30.
 *
 * Not midnight: a venue that closes at 23:00 is still cashing up, and a dump
 * taken mid-settlement is a dump of a half-closed shift. `withoutOverlapping`
 * because a slow night's dump must not have a second one started on top of it.
 */
Schedule::command('backup:run')
    ->dailyAt('02:40')
    ->withoutOverlapping()
    ->runInBackground()
    /*
     * A failed backup is a critical event, not a log line.
     *
     * `srcp-health` reads the freshness of the newest dump and alerts through
     * `srcp-notify` when it ages past a day — which catches this AND every
     * other way a backup stops happening, including the scheduler itself
     * dying. This line is the immediate half of the same signal.
     */
    ->onFailure(static function (): void {
        Log::critical('backup.run_failed', [
            'detail' => 'backup:run exited non-zero — the newest dump is now stale',
        ]);
    });

/*
 * Then prune, by the policy in config/backup.php rather than by a number here.
 *
 * After the run and not before: cleaning first would delete the oldest copy
 * while the newest one does not exist yet, which is the one window where a
 * retention policy can leave nothing at all.
 */
Schedule::command('backup:clean')
    ->dailyAt('03:10')
    ->withoutOverlapping();

/*
 * And the one that matters most, which is the one usually left out.
 *
 * `backup:monitor` does not make a backup — it checks that the newest one is
 * recent enough and large enough. Without it, a backup that silently stopped
 * three weeks ago looks exactly like one that ran last night: a directory with
 * files in it. This is the check that tells the difference.
 */
Schedule::command('backup:monitor')
    ->dailyAt('06:00')
    ->onFailure(static function (): void {
        Log::critical('backup.unhealthy', [
            'detail' => 'backup:monitor reports the newest dump is missing, stale or too small',
        ]);
    });

/*
 * The demo restaurant, kept in today.
 *
 * Half of what makes a demo look alive is dated: the rota is three days either
 * side of the day it was seeded, the bookings are for that evening. Seeded
 * once on a Monday, by Friday the crew app shows no shift and the floor no
 * booking — and somebody decides the product is broken. `demo:seed` runs the
 * module-declared demo set with the tenant set and every seeder in it is
 * idempotent, so running it every morning moves the window without piling
 * anything up. `SeedDemoTenantTest` keeps the second run from growing the
 * first. Nothing happens on a box with no demo tenant — a real restaurant's
 * server never runs this.
 */
Schedule::command('demo:seed')
    ->dailyAt('04:10')
    ->when(static fn (): bool => Tenant::query()->where('slug', 'demo-restaurant')->exists())
    ->withoutOverlapping();
