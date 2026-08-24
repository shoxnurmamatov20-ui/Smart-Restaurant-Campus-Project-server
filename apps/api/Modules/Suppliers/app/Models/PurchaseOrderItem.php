<?php

declare(strict_types=1);

namespace Modules\Suppliers\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Suppliers\Database\Factories\PurchaseOrderItemFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One line of a purchase order.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $purchase_order_id
 * @property int|null $ingredient_id Inventory module id, no FK on purpose
 * @property string $name
 * @property string|null $unit The unit the quantity is counted in: g | ml | pcs
 * @property int $quantity
 * @property int|null $received_quantity Base units counted off the van; null means nobody counted
 * @property int $unit_price Amount in tiyin (1 UZS = 100 tiyin)
 * @property int $total_price Amount in tiyin (1 UZS = 100 tiyin)
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read PurchaseOrder|null $purchaseOrder
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Suppliers\Database\Factories\PurchaseOrderItemFactory factory($count = null, $state = [])
 * @method static Builder<static>|PurchaseOrderItem newModelQuery()
 * @method static Builder<static>|PurchaseOrderItem newQuery()
 * @method static Builder<static>|PurchaseOrderItem ofOrder(int $orderId)
 * @method static Builder<static>|PurchaseOrderItem onlyTrashed()
 * @method static Builder<static>|PurchaseOrderItem query()
 * @method static Builder<static>|PurchaseOrderItem whereCreatedAt($value)
 * @method static Builder<static>|PurchaseOrderItem whereDeletedAt($value)
 * @method static Builder<static>|PurchaseOrderItem whereId($value)
 * @method static Builder<static>|PurchaseOrderItem whereIngredientId($value)
 * @method static Builder<static>|PurchaseOrderItem whereName($value)
 * @method static Builder<static>|PurchaseOrderItem wherePurchaseOrderId($value)
 * @method static Builder<static>|PurchaseOrderItem whereQuantity($value)
 * @method static Builder<static>|PurchaseOrderItem whereTenantId($value)
 * @method static Builder<static>|PurchaseOrderItem whereTotalPrice($value)
 * @method static Builder<static>|PurchaseOrderItem whereUnit($value)
 * @method static Builder<static>|PurchaseOrderItem whereUnitPrice($value)
 * @method static Builder<static>|PurchaseOrderItem whereUpdatedAt($value)
 * @method static Builder<static>|PurchaseOrderItem withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|PurchaseOrderItem withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class PurchaseOrderItem extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<PurchaseOrderItemFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'suppliers.purchase_order_items';

    protected $fillable = [
        'tenant_id',
        'purchase_order_id',
        'ingredient_id',
        'name',
        'unit',
        'quantity',
        'received_quantity',
        'unit_price',
        'total_price',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'received_quantity' => 'integer',
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
