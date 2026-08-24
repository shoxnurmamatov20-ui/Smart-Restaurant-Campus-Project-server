<?php

declare(strict_types=1);

namespace Modules\Marketplace\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A dish this storefront sells, and what it costs here.
 *
 * The row is a MARKUP over the catalogue rather than a second price. A price
 * typed in twice is a price that drifts: a restaurant raising plov by two
 * thousand in the dining room means to raise it here too, and a snapshot column
 * would leave them selling below cost until somebody noticed. The catalogue
 * price is read through `MenuCatalog`, never from Menu's tables.
 *
 * `menu_item_id` carries no foreign key — see the migration.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $store_id
 * @property int $menu_item_id
 * @property int $markup_tiyin
 * @property bool $is_listed
 * @property int $sort_order
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 *
 * @method static \Illuminate\Database\Eloquent\Builder<static>|StoreItem newModelQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|StoreItem newQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|StoreItem query()
 *
 * @mixin \Eloquent
 */
final class StoreItem extends Model
{
    use BelongsToTenant;

    protected $table = 'marketplace.store_items';

    /** @var list<string> */
    protected $fillable = [
        'tenant_id', 'store_id', 'menu_item_id', 'markup_tiyin', 'is_listed', 'sort_order',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'markup_tiyin' => 'integer',
            'is_listed' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    /** @return BelongsTo<Store, $this> */
    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'store_id');
    }

    /**
     * What a guest pays here, given what the dining room charges.
     *
     * Floored at zero rather than allowed to go negative: a markup edited into
     * a number larger than the dish is a typing mistake, and a negative price
     * would be money the restaurant pays somebody to eat.
     */
    public function marketPrice(int $cataloguePriceTiyin): int
    {
        return max(0, $cataloguePriceTiyin + $this->markup_tiyin);
    }
}
