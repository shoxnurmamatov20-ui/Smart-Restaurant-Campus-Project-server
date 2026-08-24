<?php

declare(strict_types=1);

namespace Modules\Marketplace\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One dish on a marketplace order, priced and named at the moment it was
 * ordered.
 *
 * Both are snapshots, and both for the same reason: a dish renamed, repriced or
 * withdrawn next month must not change what the guest was shown, what a dispute
 * is about, or what a settlement itemises. This is the rule
 * `orders.order_items` follows one module over, and the marketplace needs it
 * more, not less — the settlement statement is read weeks later by somebody
 * checking whether they were paid the right amount.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $order_id
 * @property int $menu_item_id
 * @property array<array-key, mixed> $name
 * @property int $unit_price_tiyin
 * @property int $quantity
 * @property int $line_total_tiyin
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 *
 * @method static \Illuminate\Database\Eloquent\Builder<static>|MarketOrderLine newModelQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|MarketOrderLine newQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|MarketOrderLine query()
 *
 * @mixin \Eloquent
 */
final class MarketOrderLine extends Model
{
    use BelongsToTenant, HasTranslations;

    protected $table = 'marketplace.order_lines';

    /** @var list<string> */
    protected $fillable = [
        'tenant_id', 'order_id', 'menu_item_id', 'name',
        'unit_price_tiyin', 'quantity', 'line_total_tiyin', 'note',
    ];

    /** @var list<string> */
    protected array $translatable = ['name'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'name' => 'array',
            'unit_price_tiyin' => 'integer',
            'quantity' => 'integer',
            'line_total_tiyin' => 'integer',
        ];
    }

    /** @return BelongsTo<MarketOrder, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(MarketOrder::class, 'order_id');
    }
}
