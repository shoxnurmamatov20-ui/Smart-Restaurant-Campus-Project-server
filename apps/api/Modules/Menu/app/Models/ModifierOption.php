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
use Modules\Menu\Database\Factories\ModifierOptionFactory;

/**
 * One answer, and what it adds to the price.
 *
 * `price_delta` is tiyin and may be negative: a smaller portion at a lower
 * price is an answer to "what size", not a second dish on the menu.
 *
 * @property-read string|null $title The name in the reader's language
 * @property int $id
 * @property int|null $tenant_id
 * @property int $modifier_group_id
 * @property array<string, string> $name
 * @property int $price_delta
 * @property int $sort
 * @property bool $is_active
 * @property-read ModifierGroup $group
 *
 * @method static Builder<static>|ModifierOption active()
 * @method static ModifierOptionFactory factory($count = null, $state = [])
 */
final class ModifierOption extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<ModifierOptionFactory> */
    use HasFactory;

    use HasTranslations;
    use SoftDeletes;

    protected $table = 'menu.modifier_options';

    /** @var list<string> */
    protected array $translatable = ['name'];

    protected $fillable = [
        'tenant_id',
        'modifier_group_id',
        'name',
        'price_delta',
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
            'price_delta' => 'integer',
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
    protected static function newFactory(): ModifierOptionFactory
    {
        return ModifierOptionFactory::new();
    }

    /** @return BelongsTo<ModifierGroup, $this> */
    public function group(): BelongsTo
    {
        return $this->belongsTo(ModifierGroup::class, 'modifier_group_id');
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
