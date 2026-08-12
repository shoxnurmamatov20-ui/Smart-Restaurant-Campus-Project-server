<?php

declare(strict_types=1);

namespace Modules\Menu\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Menu\Database\Factories\MenuItemFactory;
use Modules\Menu\Models\Concerns\InvalidatesMenuCache;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One sellable position on the menu — a dish, a drink or a combo.
 *
 * Money is kept as an integer number of tiyin (1 UZS = 100 tiyin). Never
 * introduce a float here: a rounding drift of a hundredth of a so'm becomes a
 * real cash-drawer discrepancy once it is multiplied by a day of orders.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $menu_category_id
 * @property string $sku
 * @property array<string, string> $name
 * @property array<string, string>|null $description
 * @property string $kind
 * @property int $price Price in tiyin
 * @property int|null $cost_price Theoretical food cost in tiyin
 * @property string $currency
 * @property int $cook_time_minutes
 * @property string $station
 * @property bool $is_available
 * @property Carbon|null $stopped_until
 * @property string $status
 *
 * @method static MenuItemFactory factory(int $count = null, array $state = [])
 */
final class MenuItem extends Model
{
    /** Lives in the `menu` schema — see the 0000_01_01_000000 migration. */
    protected $table = 'menu.menu_items';

    /** @use HasFactory<MenuItemFactory> */
    use BelongsToTenant;

    use HasFactory;
    use HasTranslations;
    use InvalidatesMenuCache;
    use LogsActivity;
    use SoftDeletes;

    public const KINDS = ['food', 'drink', 'combo', 'other'];

    public const STATUSES = ['draft', 'active', 'archived'];

    public const STATIONS = ['hot', 'cold', 'grill', 'bar', 'pastry'];

    public const CHANNELS = ['dine_in', 'takeaway', 'delivery', 'aggregator'];

    protected $fillable = [
        'tenant_id',
        'menu_category_id',
        'sku',
        'name',
        'description',
        'kind',
        'price',
        'cost_price',
        'currency',
        'cook_time_minutes',
        'station',
        'weight_grams',
        'calories',
        'allergens',
        'is_halal',
        'is_vegetarian',
        'spice_level',
        'is_available',
        'stopped_until',
        'status',
        'image_url',
        'sort_order',
        'channels',
        'metadata',
    ];

    /** @var array<int, string> */
    protected array $translatable = ['name', 'description'];

    protected function casts(): array
    {
        return [
            'name' => 'array',
            'description' => 'array',
            'allergens' => 'array',
            'channels' => 'array',
            'metadata' => 'array',
            'price' => 'integer',
            'cost_price' => 'integer',
            'cook_time_minutes' => 'integer',
            'weight_grams' => 'integer',
            'calories' => 'integer',
            'spice_level' => 'integer',
            'sort_order' => 'integer',
            'is_halal' => 'boolean',
            'is_vegetarian' => 'boolean',
            'is_available' => 'boolean',
            'stopped_until' => 'datetime',
        ];
    }

    protected static function newFactory(): MenuItemFactory
    {
        return MenuItemFactory::new();
    }

    // ============ Relationships ============

    public function category(): BelongsTo
    {
        return $this->belongsTo(MenuCategory::class, 'menu_category_id');
    }

    // ============ Accessors ============

    /** Dish name in the request locale. */
    protected function title(): Attribute
    {
        return Attribute::get(fn (): ?string => $this->translate('name'));
    }

    /** Human-facing price in so'm (integer tiyin ÷ 100). */
    protected function priceUzs(): Attribute
    {
        return Attribute::get(fn (): float => round($this->price / 100, 2));
    }

    /**
     * Gross margin percentage against the theoretical food cost.
     * Null while no recipe has been costed yet.
     */
    protected function marginPercent(): Attribute
    {
        return Attribute::get(function (): ?float {
            if ($this->cost_price === null || $this->price <= 0) {
                return null;
            }

            return round((($this->price - $this->cost_price) / $this->price) * 100, 1);
        });
    }

    /**
     * Is the dish orderable right now?
     *
     * A stop-list entry can carry an expiry (`stopped_until`); once that moment
     * passes the dish is sellable again without anyone touching the POS.
     */
    protected function isOrderable(): Attribute
    {
        return Attribute::get(function (): bool {
            if ($this->status !== 'active') {
                return false;
            }

            if ($this->is_available) {
                return true;
            }

            return $this->stopped_until !== null && $this->stopped_until->isPast();
        });
    }

    // ============ Domain behaviour ============

    /**
     * Put the dish on the stop-list (ingredient ran out, equipment down).
     */
    public function stop(?Carbon $until = null): bool
    {
        return $this->update([
            'is_available' => false,
            'stopped_until' => $until,
        ]);
    }

    /** Return the dish to the menu. */
    public function resume(): bool
    {
        return $this->update([
            'is_available' => true,
            'stopped_until' => null,
        ]);
    }

    // ============ Scopes ============

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    /** Sellable right now — respects an expired stop-list entry. */
    public function scopeOrderable(Builder $query): Builder
    {
        return $query->where('status', 'active')
            ->where(function (Builder $q): void {
                $q->where('is_available', true)
                    ->orWhere('stopped_until', '<=', now());
            });
    }

    public function scopeOfStation(Builder $query, string $station): Builder
    {
        return $query->where('station', $station);
    }

    public function scopeOfCategory(Builder $query, int $categoryId): Builder
    {
        return $query->where('menu_category_id', $categoryId);
    }

    /** Items offered on a given sales channel. */
    public function scopeForChannel(Builder $query, string $channel): Builder
    {
        return $query->where(function (Builder $q) use ($channel): void {
            $q->whereNull('channels')
                ->orWhereJsonContains('channels', $channel);
        });
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly([
                'tenant_id', 'menu_category_id', 'sku', 'name', 'price', 'cost_price',
                'station', 'status', 'is_available', 'stopped_until',
            ])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('menu.item');
    }
}
