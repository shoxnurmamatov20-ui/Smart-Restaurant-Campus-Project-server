<?php

declare(strict_types=1);

namespace Modules\Kitchen\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Kitchen\Database\Factories\KitchenStationFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A section of the kitchen with its own screen — hot, cold, grill, bar, pastry.
 *
 * @method static KitchenStationFactory factory(int $count = null, array $state = [])
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
