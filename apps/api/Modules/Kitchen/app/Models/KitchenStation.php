<?php

declare(strict_types=1);

namespace Modules\Kitchen\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Kitchen\Database\Factories\KitchenStationFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A section of the kitchen with its own screen — hot, cold, grill, bar, pastry.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $code Matches MenuItem::STATIONS, e.g. grill
 * @property string $name
 * @property int $sla_minutes Ticket is late past this
 * @property int $sort_order
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property int|null $branch_id
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read Tenant|null $tenant
 * @property-read Collection<int, KitchenTicket> $tickets
 * @property-read int|null $tickets_count
 *
 * @method static Builder<static>|KitchenStation active()
 * @method static \Modules\Kitchen\Database\Factories\KitchenStationFactory factory($count = null, $state = [])
 * @method static Builder<static>|KitchenStation newModelQuery()
 * @method static Builder<static>|KitchenStation newQuery()
 * @method static Builder<static>|KitchenStation onlyTrashed()
 * @method static Builder<static>|KitchenStation query()
 * @method static Builder<static>|KitchenStation whereBranchId($value)
 * @method static Builder<static>|KitchenStation whereCode($value)
 * @method static Builder<static>|KitchenStation whereCreatedAt($value)
 * @method static Builder<static>|KitchenStation whereDeletedAt($value)
 * @method static Builder<static>|KitchenStation whereId($value)
 * @method static Builder<static>|KitchenStation whereIsActive($value)
 * @method static Builder<static>|KitchenStation whereName($value)
 * @method static Builder<static>|KitchenStation whereSlaMinutes($value)
 * @method static Builder<static>|KitchenStation whereSortOrder($value)
 * @method static Builder<static>|KitchenStation whereTenantId($value)
 * @method static Builder<static>|KitchenStation whereUpdatedAt($value)
 * @method static Builder<static>|KitchenStation withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|KitchenStation withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class KitchenStation extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<KitchenStationFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'kitchen.kitchen_stations';

    protected $fillable = [
        'tenant_id',
        'code',
        'name',
        'sla_minutes',
        'sort_order',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'sla_minutes' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    protected static function newFactory(): KitchenStationFactory
    {
        return KitchenStationFactory::new();
    }

    // ============ Relationships ============

    public function tickets(): HasMany
    {
        return $this->hasMany(KitchenTicket::class, 'station', 'code');
    }

    // ============ Scopes ============

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'code', 'name', 'sla_minutes', 'is_active'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('kitchen.station');
    }
}
