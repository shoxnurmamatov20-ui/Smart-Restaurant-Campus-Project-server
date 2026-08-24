<?php

declare(strict_types=1);

namespace Modules\Inventory\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Support\Tenancy\BranchContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Inventory\Database\Factories\IngredientFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A raw product the kitchen consumes.
 *
 * Quantities are integers in the smallest unit of `unit` — grams, millilitres
 * or pieces. Same reasoning as money: a float kilogram accumulates error across
 * a month of write-offs and the stock-take never balances.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $sku
 * @property string|null $barcode
 * @property string $name
 * @property string $unit g
 * @property string|null $purchase_unit What a person counts and buys in
 * @property int $units_per_purchase Base units in one purchase unit
 * @property-read int $factor
 * @property-read int $price_tiyin
 * @property string $store main | kitchen | bar
 * @property int $stock_quantity Running balance, moved only by StockMovement
 * @property int $min_quantity Reorder point
 * @property int $cost_per_unit Tiyin per one base unit
 * @property string|null $storage dry
 * @property int|null $shelf_life_days
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read bool $is_low
 * @property-read Collection<int, StockMovement> $movements
 * @property-read int|null $movements_count
 * @property-read Collection<int, StockLevel> $levels
 * @property-read int|null $levels_count
 * @property-read int $stock_value
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|Ingredient active()
 * @method static \Modules\Inventory\Database\Factories\IngredientFactory factory($count = null, $state = [])
 * @method static Builder<static>|Ingredient lowStock()
 * @method static Builder<static>|Ingredient newModelQuery()
 * @method static Builder<static>|Ingredient newQuery()
 * @method static Builder<static>|Ingredient onlyTrashed()
 * @method static Builder<static>|Ingredient query()
 * @method static Builder<static>|Ingredient whereCostPerUnit($value)
 * @method static Builder<static>|Ingredient whereCreatedAt($value)
 * @method static Builder<static>|Ingredient whereDeletedAt($value)
 * @method static Builder<static>|Ingredient whereId($value)
 * @method static Builder<static>|Ingredient whereIsActive($value)
 * @method static Builder<static>|Ingredient whereMinQuantity($value)
 * @method static Builder<static>|Ingredient whereName($value)
 * @method static Builder<static>|Ingredient whereShelfLifeDays($value)
 * @method static Builder<static>|Ingredient whereSku($value)
 * @method static Builder<static>|Ingredient whereStockQuantity($value)
 * @method static Builder<static>|Ingredient whereStorage($value)
 * @method static Builder<static>|Ingredient whereTenantId($value)
 * @method static Builder<static>|Ingredient whereUnit($value)
 * @method static Builder<static>|Ingredient whereUpdatedAt($value)
 * @method static Builder<static>|Ingredient withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Ingredient withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Ingredient extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<IngredientFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'inventory.ingredients';

    /** The base units a balance is held in. Always whole numbers. */
    public const UNITS = ['g', 'ml', 'pcs'];

    /**
     * The units a person counts and a supplier sells in.
     *
     * Not the same list as UNITS and not derivable from it: `case` and `tray`
     * carry no weight of their own, they carry a count, and how many is the
     * product's business rather than the unit's. A hard-coded `g → kg ÷1000`
     * map is what this replaces — it could not say "24 bottles".
     */
    public const PURCHASE_UNITS = ['g', 'ml', 'pcs', 'kg', 'l', 'case', 'sack', 'tray', 'box'];

    public const STORAGES = ['dry', 'chilled', 'frozen'];

    /** The three shelves the store screen's chips filter by. */
    public const STORES = ['main', 'kitchen', 'bar'];

    protected $fillable = [
        'tenant_id',
        'sku',
        'barcode',
        'name',
        'unit',
        'purchase_unit',
        'units_per_purchase',
        'stock_quantity',
        'min_quantity',
        'cost_per_unit',
        'storage',
        'store',
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
            'units_per_purchase' => 'integer',
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

    /** The same balance, broken down by venue. See move(). */
    public function levels(): HasMany
    {
        return $this->hasMany(StockLevel::class);
    }

    // ============ Accessors ============

    /** Below the reorder point — what the stock-alert bot pushes on. */
    protected function isLow(): Attribute
    {
        return Attribute::get(fn (): bool => $this->stock_quantity <= $this->min_quantity);
    }

    /**
     * How many base units one purchase unit holds — never zero.
     *
     * A row seeded before this column existed carries the default of 1, which
     * is correct for pieces and wrong for a kilogram; the migration cannot
     * guess, so the seeder fills it in and this guards the division below
     * against a row nobody has got to yet. Dividing by a stored zero would put
     * an infinity on a storekeeper's screen.
     */
    protected function factor(): Attribute
    {
        return Attribute::get(fn (): int => max(1, $this->units_per_purchase));
    }

    /**
     * What one purchase unit costs, in tiyin.
     *
     * Derived, never stored. `cost_per_unit` is the price of one *base* unit,
     * and a second column holding the price of one kilogram is two numbers that
     * disagree the first time a price changes — which is the mistake this
     * module's own seeder made once already, valuing the whole store room at
     * thirty thousand so'm.
     */
    protected function priceTiyin(): Attribute
    {
        return Attribute::get(fn (): int => $this->cost_per_unit * $this->factor);
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
     *
     * **Two balances, one write.** `stock_quantity` is the restaurant's total
     * and stays authoritative — it is what the reorder point compares against
     * and what a single-venue restaurant reads all day. `stock_levels` is the
     * same movement attributed to a shelf, and it is what makes a transfer
     * mean anything: `-25 kg` at Chilonzor and `+25 kg` at Termiz net to zero
     * on the total once both legs have posted, and move two rows there, which
     * is the part a storekeeper can act on.
     *
     * `$branchId` defaults to the venue the request is scoped to, so receiving,
     * counting and writing off keep the breakdown without any of their callers
     * knowing this table exists. A transfer passes it explicitly, because the
     * destination leg is precisely the write whose venue is NOT the request's.
     * With no branch either way nothing is attributed — which is what happens
     * in a one-venue restaurant, and is not a hole.
     */
    public function move(
        string $kind,
        int $quantity,
        ?string $reason = null,
        ?string $reference = null,
        ?int $branchId = null,
    ): StockMovement {
        $branchId ??= app(BranchContext::class)->id();

        return DB::transaction(function () use ($kind, $quantity, $reason, $reference, $branchId): StockMovement {
            $movement = $this->movements()->create([
                'kind' => $kind,
                'branch_id' => $branchId,
                'quantity' => $quantity,
                'balance_after' => $this->stock_quantity + $quantity,
                'reason' => $reason,
                'reference' => $reference,
                'happened_at' => now(),
            ]);

            $this->forceFill(['stock_quantity' => $this->stock_quantity + $quantity])->save();

            if ($branchId !== null) {
                $this->shiftShelf($branchId, $quantity);
            }

            return $movement;
        });
    }

    /**
     * Move one venue's shelf by the same amount, creating the row if needed.
     *
     * An upsert rather than firstOrCreate-then-increment: two tabs posting the
     * same delivery a second apart would otherwise both find nothing and both
     * insert, and the unique key would turn the second one into a 500 on a
     * screen that had done nothing wrong. `increment` is on the raw builder so
     * the addition happens in PostgreSQL — read-modify-write in PHP is the
     * other way two concurrent receipts lose one of themselves.
     */
    private function shiftShelf(int $branchId, int $quantity): void
    {
        StockLevel::query()->upsert(
            [[
                'tenant_id' => $this->tenant_id,
                'branch_id' => $branchId,
                'ingredient_id' => $this->id,
                'quantity' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]],
            ['tenant_id', 'branch_id', 'ingredient_id'],
            // Nothing to update on conflict — the row is only being ensured.
            // `updated_at` is deliberately not touched here; the increment
            // below is the write, and bumping the timestamp twice would make
            // "when did this shelf last move" mean "when was it last asked".
            ['ingredient_id'],
        );

        StockLevel::query()
            ->where('branch_id', $branchId)
            ->where('ingredient_id', $this->id)
            ->increment('quantity', $quantity, ['updated_at' => now()]);
    }

    // ============ Scopes ============

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeInStore(Builder $query, string $store): Builder
    {
        return $query->where('store', $store);
    }

    public function scopeLowStock(Builder $query): Builder
    {
        return $query->whereColumn('stock_quantity', '<=', 'min_quantity');
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'sku', 'barcode', 'name', 'unit', 'purchase_unit', 'units_per_purchase', 'store', 'stock_quantity', 'min_quantity', 'cost_per_unit', 'is_active'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('inventory.ingredient');
    }
}
