<?php

declare(strict_types=1);

namespace Modules\Marketplace\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A banner a merchant bought, for a slot, for a run of days.
 *
 * The one thing this platform sells by the DAY rather than by the order, which
 * is why it is not a `Promotion` of kind `ad_slot`. A promotion spends a budget
 * as guests use a code and stops when the budget runs out; a placement is
 * booked against a date, is queued behind whoever already holds that date, and
 * is billed whether or not anybody taps it. Folding the two together would make
 * `spent_tiyin` mean two different things on the same screen.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $store_id
 * @property string $slot
 * @property Carbon $starts_on
 * @property Carbon $ends_on
 * @property int $days
 * @property int $day_rate_tiyin
 * @property int $total_tiyin
 * @property int $billed_tiyin
 * @property string $state
 * @property int|null $settlement_id
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Store|null $store
 *
 * @method static Builder<static>|Placement live()
 * @method static Builder<static>|Placement newModelQuery()
 * @method static Builder<static>|Placement newQuery()
 * @method static Builder<static>|Placement query()
 *
 * @mixin \Eloquent
 */
final class Placement extends Model
{
    use BelongsToTenant;

    protected $table = 'marketplace.placements';

    /** Where a bought banner appears. */
    public const SLOTS = ['home_top', 'category_top'];

    public const STATES = ['booked', 'running', 'finished', 'cancelled'];

    /**
     * What each slot costs per day, in tiyin.
     *
     * Here rather than in config because it is a price list the platform quotes
     * on a screen and charges against a statement, and a value that can differ
     * between the web node and the queue worker is a merchant billed one figure
     * and shown another. A negotiated rate is snapshotted on the row, which is
     * what `day_rate_tiyin` is for.
     *
     * 180 000 so'm and 90 000 so'm a day — `AD_SLOTS` in
     * `apps/web/src/app/(merchant)/merchant-panels-data.ts` prints the same two
     * numbers, and they are the ones a merchant is quoted.
     */
    public const DAY_RATE_TIYIN = [
        'home_top' => 18_000_000,
        'category_top' => 9_000_000,
    ];

    /** Two weeks. Longer than that is a contract somebody negotiates. */
    public const MAX_DAYS = 14;

    /** @var list<string> */
    protected $fillable = [
        'tenant_id', 'store_id', 'slot', 'starts_on', 'ends_on', 'days',
        'day_rate_tiyin', 'total_tiyin', 'billed_tiyin', 'state', 'settlement_id',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'starts_on' => 'date',
            'ends_on' => 'date',
            'days' => 'integer',
            'day_rate_tiyin' => 'integer',
            'total_tiyin' => 'integer',
            'billed_tiyin' => 'integer',
            'settlement_id' => 'integer',
        ];
    }

    /** @return BelongsTo<Store, $this> */
    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'store_id');
    }

    /**
     * Placements that still owe the platform a banner.
     *
     * Cancelled is excluded and finished is not: a run that ended yesterday is
     * still holding its dates against anybody who wants them, which is what the
     * queue counts.
     *
     * @param  Builder<Placement>  $query
     */
    public function scopeLive(Builder $query): void
    {
        $query->whereIn('state', ['booked', 'running']);
    }

    /** What is still to be charged for, never negative. */
    public function unbilled(): int
    {
        return max(0, $this->total_tiyin - $this->billed_tiyin);
    }
}
