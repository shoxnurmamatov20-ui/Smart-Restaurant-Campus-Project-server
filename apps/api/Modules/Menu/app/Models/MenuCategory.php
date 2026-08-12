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
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Menu\Database\Factories\MenuCategoryFactory;
use Modules\Menu\Models\Concerns\InvalidatesMenuCache;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A menu section — "Issiq taomlar", "Salatlar", "Ichimliklar".
 *
 * Categories form a tree so a large restaurant can nest
 * "Ichimliklar → Sovuq ichimliklar → Freshlar".
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $parent_id
 * @property string $slug
 * @property array<string, string> $name
 * @property array<string, string>|null $description
 * @property string|null $icon
 * @property int $sort_order
 * @property bool $is_active
 *
 * @method static MenuCategoryFactory factory(int $count = null, array $state = [])
 */
final class MenuCategory extends Model
{
    /** Lives in the `menu` schema — see the 0000_01_01_000000 migration. */
    protected $table = 'menu.menu_categories';

    /** @use HasFactory<MenuCategoryFactory> */
    use BelongsToTenant;

    use HasFactory;
    use HasTranslations;
    use InvalidatesMenuCache;
    use LogsActivity;
    use SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'parent_id',
        'slug',
        'name',
        'description',
        'icon',
        'image_url',
        'sort_order',
        'is_active',
    ];

    /** @var array<int, string> */
    protected array $translatable = ['name', 'description'];

    protected function casts(): array
    {
        return [
            'name' => 'array',
            'description' => 'array',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    protected static function newFactory(): MenuCategoryFactory
    {
        return MenuCategoryFactory::new();
    }

    // ============ Relationships ============

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('sort_order');
    }

    public function items(): HasMany
    {
        return $this->hasMany(MenuItem::class, 'menu_category_id')->orderBy('sort_order');
    }

    // ============ Accessors ============

    /**
     * Category title in the request locale — what a guest actually sees.
     */
    protected function title(): Attribute
    {
        return Attribute::get(fn (): ?string => $this->translate('name'));
    }

    // ============ Scopes ============

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /** Top-level sections only. */
    public function scopeRoot(Builder $query): Builder
    {
        return $query->whereNull('parent_id');
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'parent_id', 'slug', 'name', 'is_active', 'sort_order'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('menu.category');
    }
}
