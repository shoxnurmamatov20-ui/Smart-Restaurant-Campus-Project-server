<?php

declare(strict_types=1);

namespace Modules\Menu\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
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
 * @property string $slug URL-safe key, unique per tenant
 * @property array<array-key, mixed> $name {"uz": "...", "ru": "...", "en": "..."}
 * @property array<array-key, mixed>|null $description
 * @property string|null $icon Lucide icon key for the UI
 * @property string|null $image_url
 * @property int $sort_order
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Collection<int, MenuCategory> $children
 * @property-read int|null $children_count
 * @property-read Collection<int, MenuItem> $items
 * @property-read int|null $items_count
 * @property-read MenuCategory|null $parent
 * @property-read Tenant|null $tenant
 * @property-read string|null $title
 *
 * @method static Builder<static>|MenuCategory active()
 * @method static \Modules\Menu\Database\Factories\MenuCategoryFactory factory($count = null, $state = [])
 * @method static Builder<static>|MenuCategory newModelQuery()
 * @method static Builder<static>|MenuCategory newQuery()
 * @method static Builder<static>|MenuCategory onlyTrashed()
 * @method static Builder<static>|MenuCategory query()
 * @method static Builder<static>|MenuCategory root()
 * @method static Builder<static>|MenuCategory whereCreatedAt($value)
 * @method static Builder<static>|MenuCategory whereDeletedAt($value)
 * @method static Builder<static>|MenuCategory whereDescription($value)
 * @method static Builder<static>|MenuCategory whereIcon($value)
 * @method static Builder<static>|MenuCategory whereId($value)
 * @method static Builder<static>|MenuCategory whereImageUrl($value)
 * @method static Builder<static>|MenuCategory whereIsActive($value)
 * @method static Builder<static>|MenuCategory whereName($value)
 * @method static Builder<static>|MenuCategory whereParentId($value)
 * @method static Builder<static>|MenuCategory whereSlug($value)
 * @method static Builder<static>|MenuCategory whereSortOrder($value)
 * @method static Builder<static>|MenuCategory whereTenantId($value)
 * @method static Builder<static>|MenuCategory whereUpdatedAt($value)
 * @method static Builder<static>|MenuCategory withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|MenuCategory withoutTrashed()
 *
 * @mixin \Eloquent
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
