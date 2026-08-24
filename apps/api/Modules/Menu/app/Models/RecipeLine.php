<?php

declare(strict_types=1);

namespace Modules\Menu\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Modules\Menu\Database\Factories\RecipeLineFactory;

/**
 * One component of a dish's technical card.
 *
 * Either raw goods off the shelf or something the kitchen prepped, never both —
 * the database holds a CHECK to that effect and the migration says why. The
 * component's NAME and its COST are not here and cannot be: they belong to
 * Inventory, and Menu may not import it. `App\Contracts\Inventory\ShelfCosts`
 * is how a card is priced.
 *
 * No soft deletes. A line taken off a card is not history somebody audits — the
 * card as it stands is the recipe, and a deleted-but-present line is exactly
 * the sort of row a `sum()` picks up six months later.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $menu_item_id
 * @property int|null $ingredient_id
 * @property int|null $prep_item_id
 * @property int $quantity Base units in ONE portion
 * @property int $sort
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read MenuItem|null $item
 * @property-read Tenant|null $tenant
 *
 * @method static RecipeLineFactory factory($count = null, $state = [])
 * @method static Builder<static>|RecipeLine newModelQuery()
 * @method static Builder<static>|RecipeLine newQuery()
 * @method static Builder<static>|RecipeLine query()
 *
 * @mixin \Eloquent
 */
final class RecipeLine extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<RecipeLineFactory> */
    use HasFactory;

    protected $table = 'menu.recipe_lines';

    protected $fillable = [
        'tenant_id',
        'menu_item_id',
        'ingredient_id',
        'prep_item_id',
        'quantity',
        'sort',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'menu_item_id' => 'integer',
            'ingredient_id' => 'integer',
            'prep_item_id' => 'integer',
            'quantity' => 'integer',
            'sort' => 'integer',
        ];
    }

    /**
     * The module's own factory, named explicitly — Laravel would otherwise look
     * in `Database\Factories\Modules\...`, which is not where a module keeps them.
     */
    protected static function newFactory(): RecipeLineFactory
    {
        return RecipeLineFactory::new();
    }

    /** @return BelongsTo<MenuItem, $this> */
    public function item(): BelongsTo
    {
        return $this->belongsTo(MenuItem::class, 'menu_item_id');
    }
}
