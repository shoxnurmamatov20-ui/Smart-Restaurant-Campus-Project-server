<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Finance\Database\Factories\PaymentFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Money actually taken for an order.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $cash_shift_id
 * @property int|null $order_id Orders module id, no FK on purpose
 * @property string|null $order_number
 * @property string $method cash
 * @property int $amount Amount in tiyin (1 UZS = 100 tiyin)
 * @property string $status captured
 * @property string|null $fiscal_receipt_no From the fiscal module
 * @property Carbon|null $paid_at
 * @property Carbon|null $refunded_at
 * @property string|null $refund_reason
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read CashShift|null $cashShift
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|Payment captured()
 * @method static \Modules\Finance\Database\Factories\PaymentFactory factory($count = null, $state = [])
 * @method static Builder<static>|Payment newModelQuery()
 * @method static Builder<static>|Payment newQuery()
 * @method static Builder<static>|Payment onlyTrashed()
 * @method static Builder<static>|Payment query()
 * @method static Builder<static>|Payment today()
 * @method static Builder<static>|Payment whereAmount($value)
 * @method static Builder<static>|Payment whereCashShiftId($value)
 * @method static Builder<static>|Payment whereCreatedAt($value)
 * @method static Builder<static>|Payment whereDeletedAt($value)
 * @method static Builder<static>|Payment whereFiscalReceiptNo($value)
 * @method static Builder<static>|Payment whereId($value)
 * @method static Builder<static>|Payment whereMethod($value)
 * @method static Builder<static>|Payment whereOrderId($value)
 * @method static Builder<static>|Payment whereOrderNumber($value)
 * @method static Builder<static>|Payment wherePaidAt($value)
 * @method static Builder<static>|Payment whereRefundReason($value)
 * @method static Builder<static>|Payment whereRefundedAt($value)
 * @method static Builder<static>|Payment whereStatus($value)
 * @method static Builder<static>|Payment whereTenantId($value)
 * @method static Builder<static>|Payment whereUpdatedAt($value)
 * @method static Builder<static>|Payment withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Payment withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Payment extends Model
{
    /** @use HasFactory<PaymentFactory> */
    use BelongsToTenant;

    use HasFactory;
    use LogsActivity;
    use SoftDeletes;

    protected $table = 'finance.payments';

    public const METHODS = ['cash', 'card', 'payme', 'click', 'uzum', 'corporate'];

    public const STATUSES = ['captured', 'refunded'];

    protected $fillable = [
        'tenant_id',
        'cash_shift_id',
        'order_id',
        'order_number',
        'method',
        'amount',
        'status',
        'fiscal_receipt_no',
        'paid_at',
        'refunded_at',
        'refund_reason',
    ];

    protected function casts(): array
    {
        return [
            'paid_at' => 'datetime',
            'refunded_at' => 'datetime',
            'amount' => 'integer',
        ];
    }

    protected static function newFactory(): PaymentFactory
    {
        return PaymentFactory::new();
    }

    // ============ Relationships ============

    public function cashShift(): BelongsTo
    {
        return $this->belongsTo(CashShift::class);
    }

    // ============ Domain behaviour ============

    /**
     * Refund. The row is never deleted — a refund is an event that has to stay
     * visible in the day's takings, not a way to make money disappear.
     */
    public function refund(string $reason): bool
    {
        if ($this->status === 'refunded') {
            return false;
        }

        return $this->update([
            'status' => 'refunded',
            'refunded_at' => now(),
            'refund_reason' => $reason,
        ]);
    }

    // ============ Scopes ============

    public function scopeCaptured(Builder $query): Builder
    {
        return $query->where('status', 'captured');
    }

    /**
     * Takings for the restaurant's current trading day.
     *
     * A range on the raw column, not `whereDate` — see App\Support\Tenancy\BusinessDay
     * for why that matters both to the Z-report's accuracy and to whether
     * PostgreSQL can use the index on `(tenant_id, paid_at)`.
     */
    public function scopeToday(Builder $query): Builder
    {
        $businessDay = app(BusinessDay::class);

        return $businessDay->constrain($query, 'paid_at', $businessDay->window());
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'cash_shift_id', 'order_id', 'method', 'amount', 'status', 'refund_reason'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('finance.payment');
    }
}
