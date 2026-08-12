<?php

declare(strict_types=1);

namespace Modules\Tables\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Tables\Database\Factories\RestaurantTableFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One table on the floor.

 * Named RestaurantTable rather than Table because "tables" is far too generic
 * a class name to import next to Eloquent's own schema vocabulary.
 *
 * @method static RestaurantTableFactory factory(int $count = null, array $state = [])
 */
final class RestaurantTable extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<RestaurantTableFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'tables.restaurant_tables';

    public const KINDS = ['regular', 'vip', 'terrace', 'bar'];

    public const STATUSES = ['free', 'occupied', 'reserved', 'cleaning'];

    protected $fillable = [
        'tenant_id',
        'hall_id',
        'label',
        'seats',
        'kind',
        'status',
        'qr_token',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'seats' => 'integer',
        ];
    }

    protected static function newFactory(): RestaurantTableFactory
    {
        return RestaurantTableFactory::new();
    }

    // ============ Relationships ============

    public function hall(): BelongsTo
    {
        return $this->belongsTo(Hall::class, 'hall_id');
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(Reservation::class, 'restaurant_table_id');
    }

    // ============ Domain behaviour ============

    /**
     * Seat guests at this table.
     *
     * Returns false rather than throwing when the table is not seatable, so a
     * waiter tapping a busy table gets a plain "no" instead of a 500.
     */
    public function occupy(): bool
    {
        if (! in_array($this->status, ['free', 'reserved'], true)) {
            return false;
        }

        return $this->update(['status' => 'occupied']);
    }

    /** Guests left — the table needs clearing before it can be sold again. */
    public function release(): bool
    {
        return $this->update(['status' => 'cleaning']);
    }

    public function markFree(): bool
    {
        return $this->update(['status' => 'free']);
    }

    // ============ Scopes ============

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeFree(Builder $query): Builder
    {
        return $query->where('status', 'free')->where('is_active', true);
    }

    public function scopeOfHall(Builder $query, int $hallId): Builder
    {
        return $query->where('hall_id', $hallId);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'hall_id', 'label', 'seats', 'kind', 'status', 'is_active'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('tables.table');
    }
}
