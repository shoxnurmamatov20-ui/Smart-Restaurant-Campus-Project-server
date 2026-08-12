<?php

declare(strict_types=1);

namespace Modules\Tables\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Tables\Database\Factories\HallFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A room of the venue — main hall, terrace, VIP wing.
 *
 * @method static HallFactory factory(int $count = null, array $state = [])
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
