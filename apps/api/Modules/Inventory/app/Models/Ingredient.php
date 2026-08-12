<?php

declare(strict_types=1);

namespace Modules\Inventory\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;
use Modules\Inventory\Database\Factories\IngredientFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A raw product the kitchen consumes.

 * Quantities are integers in the smallest unit of `unit` — grams, millilitres
 * or pieces. Same reasoning as money: a float kilogram accumulates error across
 * a month of write-offs and the stock-take never balances.
 *
 * @method static IngredientFactory factory(int $count = null, array $state = [])
 */
final class Ingredient extends Model
{
    /** @use HasFactory<IngredientFactory> */
    use BelongsToTenant;

    use HasFactory;
    use LogsActivity;
    use SoftDeletes;

    protected $table = 'inventory.ingredients';

    public const UNITS = ['g', 'ml', 'pcs'];

    public const STORAGES = ['dry', 'chilled', 'frozen'];

    protected $fillable = [
        'tenant_id',
        'sku',
        'name',
        'unit',
        'stock_quantity',
        'min_quantity',
        'cost_per_unit',
        'storage',
        'shelf_life_days',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'stock_quantity' => 'integer',
            'min_quantity' => 'integer',
            'cost_per_unit' => 'integer',
        ];
    }

    protected static function newFactory(): IngredientFactory
    {
        return IngredientFactory::new();
    }

    // ============ Relationships ============

    public function movements(): HasMany
    {
        return $this->hasMany(StockMovement::class)->latest('happened_at');
    }

    // ============ Accessors ============

    /** Below the reorder point — what the stock-alert bot pushes on. */
    protected function isLow(): Attribute
    {
        return Attribute::get(fn (): bool => $this->stock_quantity <= $this->min_quantity);
    }

    /** Value of what is on the shelf right now, in tiyin. */
    protected function stockValue(): Attribute
    {
        return Attribute::get(fn (): int => max(0, $this->stock_quantity) * $this->cost_per_unit);
    }

    // ============ Domain behaviour ============

    /**
     * Record a stock movement and move the running balance in one transaction.
     *
     * The balance is never written directly anywhere else: every change leaves
     * a movement row, so a stock-take discrepancy can always be traced to who
     * did what.
     */
    public function move(string $kind, int $quantity, ?string $reason = null, ?string $reference = null): StockMovement
    {
        return DB::transaction(function () use ($kind, $quantity, $reason, $reference): StockMovement {
            $movement = $this->movements()->create([
                'kind' => $kind,
                'quantity' => $quantity,
                'balance_after' => $this->stock_quantity + $quantity,
                'reason' => $reason,
                'reference' => $reference,
                'happened_at' => now(),
            ]);

            $this->forceFill(['stock_quantity' => $this->stock_quantity + $quantity])->save();

            return $movement;
        });
    }

    // ============ Scopes ============

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeLowStock(Builder $query): Builder
    {
        return $query->whereColumn('stock_quantity', '<=', 'min_quantity');
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'sku', 'name', 'unit', 'stock_quantity', 'min_quantity', 'cost_per_unit', 'is_active'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('inventory.ingredient');
    }
}
