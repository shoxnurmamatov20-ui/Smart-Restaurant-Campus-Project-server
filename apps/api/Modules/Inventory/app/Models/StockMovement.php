<?php

declare(strict_types=1);

namespace Modules\Inventory\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasBusinessDate;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Inventory\Database\Factories\StockMovementFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * An immutable audit line: every gram that entered or left the store.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $ingredient_id
 * @property string $kind receipt
 * @property int $quantity Signed: positive in, negative out
 * @property int $balance_after
 * @property string|null $reason
 * @property string|null $reference Purchase order or order number
 * @property Carbon|null $happened_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Ingredient|null $ingredient
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Inventory\Database\Factories\StockMovementFactory factory($count = null, $state = [])
 * @method static Builder<static>|StockMovement losses()
 * @method static Builder<static>|StockMovement newModelQuery()
 * @method static Builder<static>|StockMovement newQuery()
 * @method static Builder<static>|StockMovement ofKind(string $kind)
 * @method static Builder<static>|StockMovement onlyTrashed()
 * @method static Builder<static>|StockMovement query()
 * @method static Builder<static>|StockMovement whereBalanceAfter($value)
 * @method static Builder<static>|StockMovement whereCreatedAt($value)
 * @method static Builder<static>|StockMovement whereDeletedAt($value)
 * @method static Builder<static>|StockMovement whereHappenedAt($value)
 * @method static Builder<static>|StockMovement whereId($value)
 * @method static Builder<static>|StockMovement whereIngredientId($value)
 * @method static Builder<static>|StockMovement whereKind($value)
 * @method static Builder<static>|StockMovement whereQuantity($value)
 * @method static Builder<static>|StockMovement whereReason($value)
 * @method static Builder<static>|StockMovement whereReference($value)
 * @method static Builder<static>|StockMovement whereTenantId($value)
 * @method static Builder<static>|StockMovement whereUpdatedAt($value)
 * @method static Builder<static>|StockMovement withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|StockMovement withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class StockMovement extends Model
{
    use BelongsToTenant;
    use HasBusinessDate;

    /** @use HasFactory<StockMovementFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    /** The trading day for this row is taken from `happened_at`. */
    protected static function businessDateSource(): string
    {
        return 'happened_at';
    }

    protected $table = 'inventory.stock_movements';

    public const KINDS = ['receipt', 'consumption', 'write_off', 'transfer', 'stock_take'];

    protected $fillable = [
        'business_date',
        'tenant_id',
        'ingredient_id',
        'kind',
        'quantity',
        'balance_after',
        'reason',
        'reference',
        'happened_at',
    ];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'happened_at' => 'datetime',
            'quantity' => 'integer',
            'balance_after' => 'integer',
        ];
    }

    protected static function newFactory(): StockMovementFactory
    {
        return StockMovementFactory::new();
    }

    // ============ Relationships ============

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class);
    }

    // ============ Scopes ============

    public function scopeOfKind(Builder $query, string $kind): Builder
    {
        return $query->where('kind', $kind);
    }

    public function scopeLosses(Builder $query): Builder
    {
        return $query->where('kind', 'write_off');
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'ingredient_id', 'kind', 'quantity', 'balance_after', 'reason'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('inventory.stock_movement');
    }
}
