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
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Suppliers\Database\Factories\PurchaseOrderFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * An order placed with a supplier. Receiving it is what actually moves stock.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $supplier_id
 * @property string $number
 * @property string $status draft
 * @property Carbon|null $expected_at
 * @property Carbon|null $received_at
 * @property int $total Amount in tiyin (1 UZS = 100 tiyin)
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Collection<int, PurchaseOrderItem> $items
 * @property-read int|null $items_count
 * @property-read Supplier|null $supplier
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Suppliers\Database\Factories\PurchaseOrderFactory factory($count = null, $state = [])
 * @method static Builder<static>|PurchaseOrder newModelQuery()
 * @method static Builder<static>|PurchaseOrder newQuery()
 * @method static Builder<static>|PurchaseOrder onlyTrashed()
 * @method static Builder<static>|PurchaseOrder open()
 * @method static Builder<static>|PurchaseOrder query()
 * @method static Builder<static>|PurchaseOrder whereCreatedAt($value)
 * @method static Builder<static>|PurchaseOrder whereDeletedAt($value)
 * @method static Builder<static>|PurchaseOrder whereExpectedAt($value)
 * @method static Builder<static>|PurchaseOrder whereId($value)
 * @method static Builder<static>|PurchaseOrder whereNote($value)
 * @method static Builder<static>|PurchaseOrder whereNumber($value)
 * @method static Builder<static>|PurchaseOrder whereReceivedAt($value)
 * @method static Builder<static>|PurchaseOrder whereStatus($value)
 * @method static Builder<static>|PurchaseOrder whereSupplierId($value)
 * @method static Builder<static>|PurchaseOrder whereTenantId($value)
 * @method static Builder<static>|PurchaseOrder whereTotal($value)
 * @method static Builder<static>|PurchaseOrder whereUpdatedAt($value)
 * @method static Builder<static>|PurchaseOrder withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|PurchaseOrder withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class PurchaseOrder extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<PurchaseOrderFactory> */
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
