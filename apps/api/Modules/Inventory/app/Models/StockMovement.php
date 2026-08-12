<?php

declare(strict_types=1);

namespace Modules\Inventory\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Inventory\Database\Factories\StockMovementFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * An immutable audit line: every gram that entered or left the store.
 *
 * @method static StockMovementFactory factory(int $count = null, array $state = [])
 */
final class StockMovement extends Model
{
    /** @use HasFactory<StockMovementFactory> */
    use BelongsToTenant;

    use HasFactory;
    use LogsActivity;
    use SoftDeletes;

    protected $table = 'inventory.stock_movements';

    public const KINDS = ['receipt', 'consumption', 'write_off', 'transfer', 'stock_take'];

    protected $fillable = [
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
