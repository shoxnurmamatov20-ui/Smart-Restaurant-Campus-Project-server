<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * One day of one page of one restaurant's website, counted.
 *
 * See the migration for why this is an aggregate rather than a log, and why
 * nothing personal is on it. The model adds one thing: an increment that is
 * safe under concurrency, which is the only write there is.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property Carbon $day
 * @property string $path
 * @property int $visits
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|SiteVisit newModelQuery()
 * @method static Builder<static>|SiteVisit newQuery()
 * @method static Builder<static>|SiteVisit query()
 *
 * @mixin \Eloquent
 */
final class SiteVisit extends Model
{
    use BelongsToTenant;

    protected $table = 'site_visits';

    /** How long a path may be before it stops being a page. */
    private const PATH_LIMIT = 120;

    protected $fillable = ['tenant_id', 'day', 'path', 'visits'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'day' => 'date',
            'visits' => 'integer',
        ];
    }

    /**
     * Somebody looked at a page. Add one.
     *
     * A single upsert rather than select-then-update, and it has to be: two
     * renders landing together would otherwise both read 40 and both write 41.
     * `ON CONFLICT … DO UPDATE` makes the read and the write one statement the
     * database serialises for us.
     *
     * Never throws. This is a counter beside a page that has to render: a
     * restaurant's shop window must not 500 because an analytics row would not
     * write. A visit lost is a visit lost; a page that did not load is a
     * customer lost.
     */
    public static function record(int $tenantId, string $path, ?string $day = null): void
    {
        $row = [
            'tenant_id' => $tenantId,
            'day' => $day ?? now()->toDateString(),
            'path' => self::normalise($path),
            'visits' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        /*
         * One indexed upsert, in the request.
         *
         * Every visit to one restaurant's front page touches ONE row — the
         * conflict target is `(tenant_id, day, path)` — so Postgres serialises
         * them behind a row lock held for microseconds. That is the right
         * trade at the traffic a restaurant's own website sees, and the
         * alternatives are worse in ways worth writing down:
         *
         *   - `terminating()` looked right and is a double-count waiting to
         *     happen: the callbacks are not cleared between runs, so a queue
         *     worker (a long-lived process) replays every callback it has
         *     registered on the next job.
         *   - A queued job per page view trades a row lock for a Redis write
         *     and a worker, which is more moving parts for the same number.
         *
         * If one restaurant ever outgrows a single row per page per day, the
         * answer is a bucket column (`hash % 16`) summed on read — not a
         * bigger lock and not a slower page.
         */
        try {
            DB::table('site_visits')->upsert(
                [$row],
                ['tenant_id', 'day', 'path'],
                // The increment, expressed where the conflict is resolved.
                // `now()` in application time rather than SQL's: Postgres
                // answers in its own server's zone and these columns hold
                // naive UTC — five hours of drift a day on a box in Tashkent.
                ['visits' => DB::raw('site_visits.visits + 1'), 'updated_at' => now()],
            );
        } catch (\Throwable) {
            // Deliberately swallowed — see the docblock.
        }
    }

    /**
     * A path this table will accept, or `/`.
     *
     * Query strings are cut off: `?utm_source=…` makes every share of the same
     * page a different page, and the ranking would then be a list of campaign
     * tags rather than of pages. Anything unreasonably long is not a page
     * either, and truncating rather than refusing keeps the counter counting.
     */
    private static function normalise(string $path): string
    {
        $clean = strtok($path, '?') ?: '/';
        $clean = '/'.ltrim(trim($clean), '/');

        return mb_substr($clean, 0, self::PATH_LIMIT);
    }
}
