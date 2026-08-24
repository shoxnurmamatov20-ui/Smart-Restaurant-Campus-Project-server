<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasBusinessDate;
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
 * @property Carbon|null $business_date The trading day this row belongs to — DECISIONS Q3
 * @property int|null $branch_id The venue that took it — a payment happens at an address
 * @property int|null $cash_shift_id
 * @property int|null $order_id Orders module id, no FK on purpose
 * @property string|null $order_number
 * @property string $method One of self::METHODS
 * @property int $amount Amount in tiyin (1 UZS = 100 tiyin) — what stayed, never what was handed over
 * @property string|null $reference Acquirer authorisation code or gateway transaction id
 * @property int $tip Tiyin on top of the bill, DECISIONS Q6 — never revenue
 * @property int $rounding Tiyin added by cash rounding, DECISIONS Q7 — SIGNED
 * @property int $fee_amount Tiyin the acquirer keeps — not the restaurant's
 * @property int $fee_bps The fee rate in basis points, snapshotted at capture
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
 * @property-read Branch|null $branch
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
    /*
     * A payment happens at an address — CLAUDE.md's third rule. The column has
     * been here since tender detail landed; the trait had not, so nothing scoped
     * a read by venue and a chain's owner asking one branch for its takings got
     * the whole estate's. An unset branch still means "all of them", which is
     * what an owner's dashboard and every cross-branch report want.
     */
    use BelongsToBranch;
    use BelongsToTenant;
    use HasBusinessDate;

    /** @use HasFactory<PaymentFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    /** The trading day for this row is taken from `paid_at`. */
    protected static function businessDateSource(): string
    {
        return 'paid_at';
    }

    protected $table = 'finance.payments';

    /**
     * How money can arrive.
     *
     * The card schemes are named individually because they cost different amounts:
     * Uzcard and Humo take 1.2%, Visa and Mastercard 2.4%. A single `card` method
     * cannot carry that, so an owner comparing card revenue against a bank
     * statement would be comparing two numbers that differ by a percentage nobody
     * could reconstruct.
     *
     * `card` stays for the tills that already send it, and its fee rate is
     * deliberately zero — a visibly missing figure rather than a plausible guess in
     * a margin report nobody could trace. See App\Support\Finance\AcquirerFees.
     */
    public const METHODS = [
        'cash',
        'card',
        'uzcard',
        'humo',
        'visa',
        'mastercard',
        'payme',
        'click',
        'uzum',
        'corporate',
        /*
         * A guest's own tab — "balansiga yozildi · pul kelmadi".
         *
         * Not the same as `corporate`, which looks similar and is not: a company
         * account is a contract with a business that settles by bank transfer, and
         * the money does arrive. `credit` is a regular signing for lunch, and the
         * money is a debt until they come back on Friday.
         *
         * A Z-report that folded the two together would explain neither, which is
         * the whole reason the phase exists: the gap between what was sold and what
         * was banked has to have a name, or it reads as a shortfall.
         */
        'credit',
    ];

    public const STATUSES = ['captured', 'refunded'];

    protected $fillable = [
        'business_date',
        'tenant_id',
        'branch_id',
        'cash_shift_id',
        'order_id',
        'order_number',
        'method',
        'amount',
        'reference',
        'tip',
        'rounding',
        'fee_amount',
        'fee_bps',
        'status',
        'fiscal_receipt_no',
        'paid_at',
        'refunded_at',
        'refund_reason',
    ];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'paid_at' => 'datetime',
            'refunded_at' => 'datetime',
            /*
             * Every money column cast to integer, not only the amount.
             *
             * Postgres returns bigint as a string through PDO, and a string in a
             * money path is a float waiting to happen: `'4500000' + 0.0` is how a
             * tiyin becomes a rounding error. `rounding` is signed and casting it
             * keeps the minus sign an integer rather than a numeric string that
             * sorts wrong.
             */
            'amount' => 'integer',
            'tip' => 'integer',
            'rounding' => 'integer',
            'fee_amount' => 'integer',
            'fee_bps' => 'integer',
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
