<?php

declare(strict_types=1);

namespace Modules\Menu\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Menu\Database\Factories\ModifierGroupFactory;

/**
 * A question asked about a dish, and the rules for answering it.
 *
 * "Doneness — pick exactly one." "Add-ons — up to five." The rules are what
 * make the group worth being a row: without them a client would decide whether
 * two sauces are allowed, and two clients would decide differently.
 *
 * @property-read string|null $title The name in the reader's language
 * @property int $id
 * @property int|null $tenant_id
 * @property array<string, string> $name
 * @property bool $is_multi
 * @property int $min_choices
 * @property int $max_choices
 * @property int $sort
 * @property bool $is_active
 * @property-read Collection<int, ModifierOption> $options
 * @property-read Collection<int, MenuItem> $items
 *
 * @method static Builder<static>|ModifierGroup active()
 * @method static ModifierGroupFactory factory($count = null, $state = [])
 */
final class ModifierGroup extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<ModifierGroupFactory> */
    use HasFactory;

    use HasTranslations;
    use SoftDeletes;

    protected $table = 'menu.modifier_groups';

    /** @var list<string> */
    protected array $translatable = ['name'];

    protected $fillable = [
        'tenant_id',
        'name',
        'is_multi',
        'min_choices',
        'max_choices',
        'sort',
        'is_active',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'name' => 'array',
            'is_multi' => 'boolean',
            'min_choices' => 'integer',
            'max_choices' => 'integer',
            'sort' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    /**
     * The name in the reader's language.
     *
     * The same accessor MenuItem and MenuCategory carry. `$translatable` tells
     * HasTranslations which columns hold a `{uz,ru,en}` map; it does not create
     * a property to read one through, which is why three new models resolved
     * every name to an empty string until this was added — the API answered
     * correctly shaped questions with no words in them.
     */
    protected function title(): Attribute
    {
        return Attribute::get(fn (): ?string => $this->translate('name'));
    }

    /**
     * The module's own factory, named explicitly.
     *
     * Laravel resolves `Database\Factories\Modules\...\XFactory` by default,
     * which is not where a module keeps its factories. Every model here says so.
     */
    protected static function newFactory(): ModifierGroupFactory
    {
        return ModifierGroupFactory::new();
    }

    /** @return HasMany<ModifierOption, $this> */
    public function options(): HasMany
    {
        return $this->hasMany(ModifierOption::class)->orderBy('sort')->orderBy('id');
    }

    /** @return BelongsToMany<MenuItem, $this> */
    public function items(): BelongsToMany
    {
        return $this->belongsToMany(MenuItem::class, 'menu.menu_item_modifier_group');
    }

    /**
     * @param Builder<static> $query
     *
     * @return Builder<static>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
