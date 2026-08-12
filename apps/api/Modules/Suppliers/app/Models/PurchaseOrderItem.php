<?php

declare(strict_types=1);

namespace Modules\Suppliers\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Suppliers\Database\Factories\PurchaseOrderItemFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One line of a purchase order.
 *
 * @method static PurchaseOrderItemFactory factory(int $count = null, array $state = [])
 */
final class PurchaseOrderItem extends Model
{
    /** @use HasFactory<PurchaseOrderItemFactory> */
    use BelongsToTenant;

    use HasFactory;
    use LogsActivity;
    use SoftDeletes;

    protected $table = 'suppliers.purchase_order_items';

    protected $fillable = [
        'tenant_id',
        'purchase_order_id',
        'ingredient_id',
        'name',
        'quantity',
        'unit_price',
        'total_price',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_price' => 'integer',
            'total_price' => 'integer',
        ];
    }

    protected static function newFactory(): PurchaseOrderItemFactory
    {
        return PurchaseOrderItemFactory::new();
    }

    // ============ Relationships ============

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    // ============ Scopes ============

    public function scopeOfOrder(Builder $query, int $orderId): Builder
    {
        return $query->where('purchase_order_id', $orderId);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'purchase_order_id', 'ingredient_id', 'quantity', 'unit_price', 'total_price'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('suppliers.purchase_order_item');
    }
}
