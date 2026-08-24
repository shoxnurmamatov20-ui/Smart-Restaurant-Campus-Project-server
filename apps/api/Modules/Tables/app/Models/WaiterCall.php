<?php

declare(strict_types=1);

namespace Modules\Tables\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A table asked for something.
 *
 * Two kinds, one shape: `waiter` is a raised hand and `bill` is "we would like
 * to pay". They differ by a word, so they are one table — see the migration for
 * why two would be two queries on one screen and two places for "somebody
 * noticed" to drift apart.
 *
 * Deliberately NOT soft-deleted, unlike everything else in this module. A call
 * ends by being answered, and `closed_at` says when; a row that could vanish
 * would take the only evidence of how long a table waited with it, which is the
 * single number this table exists to produce.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property int $restaurant_table_id
 * @property string $kind waiter|bill
 * @property string $status open|acknowledged|done|expired
 * @property int|null $order_id Orders module id, no FK on purpose
 * @property int|null $seat_no
 * @property string|null $note
 * @property int|null $acknowledged_by_user_id
 * @property Carbon|null $acknowledged_at
 * @property Carbon|null $closed_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read RestaurantTable|null $restaurantTable
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|WaiterCall live()
 * @method static Builder<static>|WaiterCall newModelQuery()
 * @method static Builder<static>|WaiterCall newQuery()
 * @method static Builder<static>|WaiterCall query()
 *
 * @mixin \Eloquent
 */
final class WaiterCall extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;
    use LogsActivity;

    protected $table = 'tables.waiter_calls';

    /** A raised hand, or a request for the bill. */
    public const KINDS = ['waiter', 'bill'];

    /**
     * Two of these are still somebody's problem.
     *
     * `open` is nobody has looked, `acknowledged` is a waiter has said "coming".
     * Both keep the table off the "may I ask again" list, which is why the
     * partial unique index in the migration names them together.
     *
     * @var list<string>
     */
    public const LIVE_STATUSES = ['open', 'acknowledged'];

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'restaurant_table_id',
        'kind',
        'status',
        'order_id',
        'seat_no',
        'note',
        'acknowledged_by_user_id',
        'acknowledged_at',
        'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'seat_no' => 'integer',
            'acknowledged_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    // ============ Relationships ============

    public function restaurantTable(): BelongsTo
    {
        return $this->belongsTo(RestaurantTable::class, 'restaurant_table_id');
    }

    // ============ Scopes ============

    /**
     * Calls somebody still has to answer.
     *
     * @param Builder<WaiterCall> $query
     *
     * @return Builder<WaiterCall>
     */
    public function scopeLive(Builder $query): Builder
    {
        return $query->whereIn('status', self::LIVE_STATUSES);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'restaurant_table_id', 'kind', 'status', 'acknowledged_by_user_id'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('tables.waiter_call');
    }
}
