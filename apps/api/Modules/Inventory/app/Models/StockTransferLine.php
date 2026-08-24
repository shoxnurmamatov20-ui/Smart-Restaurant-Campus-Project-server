<?php

declare(strict_types=1);

namespace Modules\Inventory\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One product on one transfer.
 *
 * `unit_cost_tiyin` is frozen when the transfer is written rather than read
 * from the ingredient at display time. A transfer is what one venue charged
 * another, and the shelf price moves every delivery — a report run in November
 * against today's cost would restate what Chilonzor billed Termiz in August.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $stock_transfer_id
 * @property int $ingredient_id
 * @property int $quantity
 * @property int $unit_cost_tiyin
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Ingredient|null $ingredient
 * @property-read StockTransfer|null $transfer
 * @property-read int $value_tiyin
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|StockTransferLine newModelQuery()
 * @method static Builder<static>|StockTransferLine newQuery()
 * @method static Builder<static>|StockTransferLine query()
 *
 * @mixin \Eloquent
 */
final class StockTransferLine extends Model
{
    use BelongsToTenant;

    protected $table = 'inventory.stock_transfer_lines';

    protected $fillable = [
        'tenant_id',
        'stock_transfer_id',
        'ingredient_id',
        'quantity',
        'unit_cost_tiyin',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_cost_tiyin' => 'integer',
        ];
    }

    public function transfer(): BelongsTo
    {
        return $this->belongsTo(StockTransfer::class, 'stock_transfer_id');
    }

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class);
    }

    /** What this line was worth when it left, in tiyin. */
    protected function valueTiyin(): Attribute
    {
        return Attribute::get(fn (): int => $this->quantity * $this->unit_cost_tiyin);
    }
}
