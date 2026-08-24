<?php

declare(strict_types=1);

namespace Modules\Inventory\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Something the kitchen makes out of ingredients before service starts.
 *
 * Zirvak, broth, dough, mince. Bought by nobody and consumed by everything,
 * which is why the platform could describe a sack of flour and a plate of manti
 * and nothing in between.
 *
 * Quantities are integers in `unit`, exactly like `Ingredient` and for the same
 * reason: 6.5 litres of reduced stock is a float that will not reconcile after
 * a month of batches.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $code
 * @property array<string, string> $name
 * @property string $unit g | ml
 * @property int $batch_quantity What one batch yields before loss
 * @property int $loss_percent
 * @property int $shelf_life_days
 * @property int $on_hand
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Collection<int, PrepComponent> $components
 * @property-read int|null $components_count
 * @property-read int $batch_cost
 * @property-read int $unit_cost
 * @property-read int $usable_yield
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|PrepItem active()
 * @method static Builder<static>|PrepItem newModelQuery()
 * @method static Builder<static>|PrepItem newQuery()
 * @method static Builder<static>|PrepItem onlyTrashed()
 * @method static Builder<static>|PrepItem query()
 * @method static Builder<static>|PrepItem withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|PrepItem withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class PrepItem extends Model
{
    use BelongsToTenant;
    use HasTranslations;
    use LogsActivity;
    use SoftDeletes;

    protected $table = 'inventory.prep_items';

    /** The base units a prep balance is held in — never a purchase unit. */
    public const UNITS = ['g', 'ml'];

    protected array $translatable = ['name'];

    protected $fillable = [
        'tenant_id',
        'code',
        'name',
        'unit',
        'batch_quantity',
        'loss_percent',
        'shelf_life_days',
        'on_hand',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'name' => 'array',
            'batch_quantity' => 'integer',
            'loss_percent' => 'integer',
            'shelf_life_days' => 'integer',
            'on_hand' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    // ============ Relationships ============

    public function components(): HasMany
    {
        return $this->hasMany(PrepComponent::class);
    }

    // ============ Accessors ============

    /**
     * Usable base units out of one batch, after loss.
     *
     * At least one: a card entered as "100% loss" is a typo, and a zero yield
     * would divide the unit cost by nothing three lines below.
     */
    protected function usableYield(): Attribute
    {
        return Attribute::get(fn (): int => max(
            1,
            (int) round($this->batch_quantity * (100 - min(99, $this->loss_percent)) / 100),
        ));
    }

    /**
     * What the raw goods for one batch cost, in tiyin.
     *
     * Needs `components.ingredient` loaded; an unloaded relation would answer
     * zero rather than N+1 its way to the right number, so the resource eager
     * loads and the tests assert the figure rather than the shape.
     */
    protected function batchCost(): Attribute
    {
        return Attribute::get(fn (): int => (int) $this->components->sum(
            static fn (PrepComponent $line): int => $line->quantity * ($line->ingredient->cost_per_unit ?? 0),
        ));
    }

    /**
     * Cost per USABLE base unit — the number a recipe card should quote.
     *
     * Divided by the yield rather than the batch, because eight litres of stock
     * simmered down to six and a half still cost what eight litres of beef and
     * onion cost. Dividing by the batch understates every dish that uses it.
     */
    protected function unitCost(): Attribute
    {
        return Attribute::get(fn (): int => intdiv($this->batch_cost, $this->usable_yield));
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
            ->logOnly(['tenant_id', 'code', 'name', 'unit', 'batch_quantity', 'loss_percent', 'on_hand', 'is_active'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('inventory.prep_item');
    }
}
