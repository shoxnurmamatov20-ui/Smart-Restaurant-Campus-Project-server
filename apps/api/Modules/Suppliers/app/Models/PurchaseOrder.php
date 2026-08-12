<?php

declare(strict_types=1);

namespace Modules\Suppliers\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Suppliers\Database\Factories\PurchaseOrderFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * An order placed with a supplier. Receiving it is what actually moves stock.
 *
 * @method static PurchaseOrderFactory factory(int $count = null, array $state = [])
 */
final class PurchaseOrder extends Model
{
    /** @use HasFactory<PurchaseOrderFactory> */
    use BelongsToTenant;

    use HasFactory;
    use LogsActivity;
    use SoftDeletes;

    protected $table = 'suppliers.purchase_orders';

    public const STATUSES = ['draft', 'sent', 'confirmed', 'received', 'cancelled'];

    protected $fillable = [
        'tenant_id',
        'supplier_id',
        'number',
        'status',
        'expected_at',
        'received_at',
        'total',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'expected_at' => 'datetime',
            'received_at' => 'datetime',
            'total' => 'integer',
        ];
    }

    protected static function newFactory(): PurchaseOrderFactory
    {
        return PurchaseOrderFactory::new();
    }

    // ============ Relationships ============

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class);
    }

    // ============ Domain behaviour ============

    public function recalculateTotal(): self
    {
        $this->forceFill(['total' => (int) $this->items()->sum('total_price')])->save();

        return $this;
    }

    // ============ Scopes ============

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', ['draft', 'sent', 'confirmed']);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'supplier_id', 'number', 'status', 'total', 'received_at'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('suppliers.purchase_order');
    }
}
