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
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Tables\Database\Factories\HallFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A room of the venue — main hall, terrace, VIP wing.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $code Unique per tenant, e.g. MAIN
 * @property string $name
 * @property int $capacity
 * @property int $sort_order
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property int|null $branch_id
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read Collection<int, RestaurantTable> $tables
 * @property-read int|null $tables_count
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|Hall active()
 * @method static \Modules\Tables\Database\Factories\HallFactory factory($count = null, $state = [])
 * @method static Builder<static>|Hall newModelQuery()
 * @method static Builder<static>|Hall newQuery()
 * @method static Builder<static>|Hall onlyTrashed()
 * @method static Builder<static>|Hall query()
 * @method static Builder<static>|Hall whereBranchId($value)
 * @method static Builder<static>|Hall whereCapacity($value)
 * @method static Builder<static>|Hall whereCode($value)
 * @method static Builder<static>|Hall whereCreatedAt($value)
 * @method static Builder<static>|Hall whereDeletedAt($value)
 * @method static Builder<static>|Hall whereId($value)
 * @method static Builder<static>|Hall whereIsActive($value)
 * @method static Builder<static>|Hall whereName($value)
 * @method static Builder<static>|Hall whereSortOrder($value)
 * @method static Builder<static>|Hall whereTenantId($value)
 * @method static Builder<static>|Hall whereUpdatedAt($value)
 * @method static Builder<static>|Hall withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Hall withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Hall extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<HallFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'tables.halls';

    protected $fillable = [
        'tenant_id',
        'code',
        'name',
        'capacity',
        'sort_order',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'capacity' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    protected static function newFactory(): HallFactory
    {
        return HallFactory::new();
    }

    // ============ Relationships ============

    public function tables(): HasMany
    {
        return $this->hasMany(RestaurantTable::class, 'hall_id')->orderBy('label');
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
            ->logOnly(['tenant_id', 'code', 'name', 'capacity', 'is_active'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('tables.hall');
    }
}
