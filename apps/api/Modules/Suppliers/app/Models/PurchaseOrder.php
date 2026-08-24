<?php

declare(strict_types=1);

namespace Modules\Suppliers\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Support\Counters\BranchCounters;
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
 * @property int $paid_amount Settled so far, in tiyin — part payments are real
 * @property Carbon|null $paid_at When it was settled in full
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
 * @method static Builder<static>|PurchaseOrder outstanding()
 * @method static Builder<static>|PurchaseOrder query()
 * @method static Builder<static>|PurchaseOrder whereCreatedAt($value)
 * @method static Builder<static>|PurchaseOrder whereDeletedAt($value)
 * @method static Builder<static>|PurchaseOrder whereExpectedAt($value)
 * @method static Builder<static>|PurchaseOrder whereId($value)
 * @method static Builder<static>|PurchaseOrder whereNote($value)
 * @method static Builder<static>|PurchaseOrder wherePaidAmount($value)
 * @method static Builder<static>|PurchaseOrder wherePaidAt($value)
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

    /**
     * The three that leave an order still to be dealt with.
     *
     * A constant rather than a literal inside `scopeOpen`, because the supplier
     * list counts the same three from a subquery and a second copy of the list
     * is how "open" comes to mean two things on one screen.
     */
    public const OPEN_STATUSES = ['draft', 'sent', 'confirmed'];

    /**
     * Where an order may go from where it is.
     *
     * The ladder is one direction only, and that is the point: a confirmed
     * delivery cannot quietly become a draft again, because the supplier has
     * already loaded the van. `cancelled` hangs off the three open states and
     * off nothing else — calling off an order that has already been unloaded
     * into the store is not a cancellation, it is a return, and a return is a
     * different document with different stock in it.
     *
     * `received` is deliberately absent from every list here. It is not reached
     * by declaring it: it is reached by `PurchaseOrderController::receive()`,
     * which raises stock and grows the payable in the same transaction. A
     * status endpoint that could write it would be a way to mark a delivery
     * arrived without any of it landing on a shelf.
     *
     * @var array<string, list<string>>
     */
    public const TRANSITIONS = [
        'draft' => ['sent', 'cancelled'],
        'sent' => ['confirmed', 'cancelled'],
        'confirmed' => ['cancelled'],
        'received' => [],
        'cancelled' => [],
    ];

    /** Statuses whose lines and header may still be edited. */
    public const EDITABLE = ['draft', 'sent'];

    protected $fillable = [
        'tenant_id',
        'supplier_id',
        'number',
        'status',
        'expected_at',
        'received_at',
        'total',
        'paid_amount',
        'paid_at',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'expected_at' => 'datetime',
            'received_at' => 'datetime',
            'paid_at' => 'datetime',
            'total' => 'integer',
            'paid_amount' => 'integer',
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

    /**
     * The next document number, from the one place this codebase issues them.
     *
     * `PO-0009`, four digits, sharing the format the seeded book already uses.
     * Not scoped to a branch: suppliers belong to the business rather than to
     * an address — the same reasoning that keeps `branch_id` off this table —
     * so a chain's purchase numbering is one sequence and a buyer quoting
     * "PO-0042" on the phone means one document.
     *
     * See BranchCounters for the guarantee: consecutive, never duplicated, and
     * given back if the surrounding transaction rolls back.
     */
    public static function nextNumber(): string
    {
        return sprintf('PO-%04d', app(BranchCounters::class)->next('purchase_order.number'));
    }

    /** Whether this order may move to that status, by the ladder above. */
    public function mayBecome(string $status): bool
    {
        return in_array($status, self::TRANSITIONS[$this->status] ?? [], true);
    }

    public function recalculateTotal(): self
    {
        $this->forceFill(['total' => (int) $this->items()->sum('total_price')])->save();

        return $this;
    }

    // ============ Scopes ============

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', self::OPEN_STATUSES);
    }

    /**
     * Orders with money still owed on them — the payables list.
     *
     * Not the same as `open()`, and the difference is the whole reason this
     * scope exists: `open` is about DELIVERY (has the van arrived), this is
     * about MONEY (has the invoice been settled), and the two run on separate
     * clocks. A received order on thirty-day terms is closed and unpaid; a
     * deposit paid on a draft is open and part-settled.
     *
     * Cancelled orders are excluded because nobody owes anything on a delivery
     * that was called off.
     *
     * @param  Builder<PurchaseOrder>  $query
     * @return Builder<PurchaseOrder>
     */
    public function scopeOutstanding(Builder $query): Builder
    {
        return $query->whereNull('paid_at')
            ->where('status', '!=', 'cancelled')
            ->whereColumn('paid_amount', '<', 'total');
    }

    /**
     * What is still owed on this invoice, in tiyin.
     *
     * `outstandingAmount` rather than `outstanding`, because `scopeOutstanding`
     * already claims that name through Laravel's magic — a model method and a
     * scope with one name resolve to the scope, so `$order->outstanding()` would
     * have returned a query builder to anything that read it as a figure.
     */
    public function outstandingAmount(): int
    {
        return max(0, $this->total - $this->paid_amount);
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
