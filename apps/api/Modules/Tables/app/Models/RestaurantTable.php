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
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Tables\Database\Factories\RestaurantTableFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One table on the floor.
 *
 * Named RestaurantTable rather than Table because "tables" is far too generic
 * a class name to import next to Eloquent's own schema vocabulary.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $hall_id
 * @property string $label What the guests and waiters call it, e.g. A-7
 * @property int $seats
 * @property string $kind regular
 * @property string $status free
 * @property string|null $qr_token Opens the public QR menu for this table
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property int|null $branch_id
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read Hall|null $hall
 * @property-read Collection<int, Reservation> $reservations
 * @property-read int|null $reservations_count
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|RestaurantTable active()
 * @method static \Modules\Tables\Database\Factories\RestaurantTableFactory factory($count = null, $state = [])
 * @method static Builder<static>|RestaurantTable free()
 * @method static Builder<static>|RestaurantTable newModelQuery()
 * @method static Builder<static>|RestaurantTable newQuery()
 * @method static Builder<static>|RestaurantTable ofHall(int $hallId)
 * @method static Builder<static>|RestaurantTable onlyTrashed()
 * @method static Builder<static>|RestaurantTable query()
 * @method static Builder<static>|RestaurantTable whereBranchId($value)
 * @method static Builder<static>|RestaurantTable whereCreatedAt($value)
 * @method static Builder<static>|RestaurantTable whereDeletedAt($value)
 * @method static Builder<static>|RestaurantTable whereHallId($value)
 * @method static Builder<static>|RestaurantTable whereId($value)
 * @method static Builder<static>|RestaurantTable whereIsActive($value)
 * @method static Builder<static>|RestaurantTable whereKind($value)
 * @method static Builder<static>|RestaurantTable whereLabel($value)
 * @method static Builder<static>|RestaurantTable whereQrToken($value)
 * @method static Builder<static>|RestaurantTable whereSeats($value)
 * @method static Builder<static>|RestaurantTable whereStatus($value)
 * @method static Builder<static>|RestaurantTable whereTenantId($value)
 * @method static Builder<static>|RestaurantTable whereUpdatedAt($value)
 * @method static Builder<static>|RestaurantTable withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|RestaurantTable withoutTrashed()
 *
 * @mixin \Eloquent
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
