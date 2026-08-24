<?php

declare(strict_types=1);

namespace Modules\Inventory\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One line of a prep card: how much of an ingredient goes into one batch.
 *
 * Per BATCH, not per usable unit. A cook doubling a batch multiplies these; a
 * dish costing a gram of the result divides by the yield. Storing the per-unit
 * figure instead would round a hundredth of a gram of onion to nothing and
 * quietly cost the zirvak at the price of the beef alone.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $prep_item_id
 * @property int $ingredient_id
 * @property int $quantity Base units of the ingredient in one batch
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Ingredient|null $ingredient
 * @property-read PrepItem|null $prepItem
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|PrepComponent newModelQuery()
 * @method static Builder<static>|PrepComponent newQuery()
 * @method static Builder<static>|PrepComponent query()
 *
 * @mixin \Eloquent
 */
final class PrepComponent extends Model
{
    use BelongsToTenant;

    protected $table = 'inventory.prep_components';

    protected $fillable = [
        'tenant_id',
        'prep_item_id',
        'ingredient_id',
        'quantity',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
        ];
    }

    public function prepItem(): BelongsTo
    {
        return $this->belongsTo(PrepItem::class);
    }

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class);
    }
}
