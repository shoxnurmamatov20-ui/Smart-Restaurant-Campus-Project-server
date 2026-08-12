<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Finance\Database\Factories\PaymentFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Money actually taken for an order.
 *
 * @method static PaymentFactory factory(int $count = null, array $state = [])
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
