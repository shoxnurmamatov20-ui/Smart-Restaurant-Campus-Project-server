<?php

declare(strict_types=1);

namespace Modules\Inventory\Models;

use App\Models\Branch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * How much of one product is on one venue's shelf.
 *
 * The breakdown of `ingredients.stock_quantity`, never a second copy of it. The
 * total stays on the ingredient because that is what a reorder point compares
 * against and what a single-venue restaurant reads all day; this table says
 * *where*, which is the question a transfer asks and the total cannot answer.
 *
 * Deliberately NOT `BelongsToBranch`. That trait means "no branch in context is
 * every branch", which is right for a movement and wrong here: this row exists
 * only to name a venue, so the branch is a required column and the caller says
 * which one it wants. The scope would also stamp `branch_id` on create from the
 * request context, and the destination leg of a transfer is precisely the write
 * whose branch is NOT the one the request is scoped to.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $branch_id
 * @property int $ingredient_id
 * @property int $quantity
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Branch|null $branch
 * @property-read Ingredient|null $ingredient
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|StockLevel newModelQuery()
 * @method static Builder<static>|StockLevel newQuery()
 * @method static Builder<static>|StockLevel query()
 *
 * @mixin \Eloquent
 */
final class StockLevel extends Model
{
    use BelongsToTenant;

    protected $table = 'inventory.stock_levels';

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'ingredient_id',
        'quantity',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class);
    }
}
