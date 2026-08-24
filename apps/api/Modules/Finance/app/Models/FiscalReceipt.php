<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasBusinessDate;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Modules\Finance\Database\Factories\FiscalReceiptFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One declaration to the tax authority, and its journey there.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property int|null $cash_shift_id
 * @property int|null $order_id Orders module id, no FK on purpose
 * @property string|null $order_number
 * @property Carbon|null $business_date
 * @property string $kind sale|refund|correction
 * @property int|null $parent_id The sale this document corrects
 * @property string $status pending|sent|registered|expired|void
 * @property int $total Tiyin declared
 * @property int $cash_total
 * @property int $card_total
 * @property int $vat_total
 * @property int $attempts
 * @property string|null $last_error
 * @property Carbon|null $next_attempt_at
 * @property Carbon|null $expires_at
 * @property string|null $provider
 * @property string|null $fiscal_sign
 * @property string|null $receipt_seq
 * @property string|null $module_no
 * @property string|null $qr_url
 * @property Carbon|null $registered_at
 * @property int $duplicates_printed
 * @property array<string, mixed>|null $payload
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read CashShift|null $cashShift
 * @property-read Collection<int, FiscalReceipt> $corrections
 * @property-read int|null $corrections_count
 * @property-read bool $is_legal
 * @property-read bool $is_settled
 * @property-read FiscalReceipt|null $parent
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|FiscalReceipt due()
 * @method static \Modules\Finance\Database\Factories\FiscalReceiptFactory factory($count = null, $state = [])
 * @method static Builder<static>|FiscalReceipt forBusinessDate(string $date)
 * @method static Builder<static>|FiscalReceipt forCurrentBusinessDate()
 * @method static Builder<static>|FiscalReceipt newModelQuery()
 * @method static Builder<static>|FiscalReceipt newQuery()
 * @method static Builder<static>|FiscalReceipt outstanding()
 * @method static Builder<static>|FiscalReceipt pastWindow(int $windowHours)
 * @method static Builder<static>|FiscalReceipt query()
 * @method static Builder<static>|FiscalReceipt whereAttempts($value)
 * @method static Builder<static>|FiscalReceipt whereCashShiftId($value)
 * @method static Builder<static>|FiscalReceipt whereFiscalSign($value)
 * @method static Builder<static>|FiscalReceipt whereId($value)
 * @method static Builder<static>|FiscalReceipt whereKind($value)
 * @method static Builder<static>|FiscalReceipt whereOrderId($value)
 * @method static Builder<static>|FiscalReceipt whereStatus($value)
 * @method static Builder<static>|FiscalReceipt whereTenantId($value)
 *
 * @mixin \Eloquent
 */
final class FiscalReceipt extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;
    use HasBusinessDate;

    /** @use HasFactory<FiscalReceiptFactory> */
    use HasFactory;

    use LogsActivity;

    protected $table = 'finance.fiscal_receipts';

    /**
     * `sale` declares a meal. `refund` reverses one — and it is a fiscal
     * document of its own rather than a deletion, because a declaration already
     * filed cannot be unfiled; it can only be corrected by another one.
     * `correction` is the same mechanism for a sale that was declared wrongly
     * rather than returned.
     */
    public const KINDS = ['sale', 'refund', 'correction'];

    /**
     * Where a document is on its way to the tax authority.
     *
     *   `pending`     written locally, not yet accepted. Retried with backoff;
     *                 `attempts` and `last_error` say how it is going.
     *   `sent`        handed over and awaiting an answer. Only some providers
     *                 answer asynchronously; for the rest this is a moment.
     *   `registered`  accepted, and `fiscal_sign` is the proof. Terminal.
     *   `expired`     the window closed without acceptance. Terminal, and the
     *                 one status a manager has to see: it is no longer a queue
     *                 item, it is a liability.
     *   `void`        superseded before it was ever filed — a sale corrected
     *                 while the original was still pending. Nothing was
     *                 declared, so nothing needs correcting.
     */
    public const STATUSES = ['pending', 'sent', 'registered', 'expired', 'void'];

    /** The trading day for this row is taken from when the document was raised. */
    protected static function businessDateSource(): string
    {
        return 'created_at';
    }

    protected $fillable = [
        'business_date',
        'tenant_id',
        'branch_id',
        'cash_shift_id',
        'order_id',
        'order_number',
        'kind',
        'parent_id',
        'status',
        'total',
        'cash_total',
        'card_total',
        'vat_total',
        'attempts',
        'last_error',
        'next_attempt_at',
        'expires_at',
        'provider',
        'fiscal_sign',
        'receipt_seq',
        'module_no',
        'qr_url',
        'registered_at',
        'duplicates_printed',
        'payload',
    ];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'next_attempt_at' => 'datetime',
            'expires_at' => 'datetime',
            'registered_at' => 'datetime',
            'payload' => 'array',
            // Postgres returns bigint as a string through PDO, and a string in a
            // money path is one implicit cast away from being a float.
            'total' => 'integer',
            'cash_total' => 'integer',
            'card_total' => 'integer',
            'vat_total' => 'integer',
            'attempts' => 'integer',
            'duplicates_printed' => 'integer',
        ];
    }

    protected static function newFactory(): FiscalReceiptFactory
    {
        return FiscalReceiptFactory::new();
    }

    // ============ Relationships ============

    /** @return BelongsTo<CashShift, $this> */
    public function cashShift(): BelongsTo
    {
        return $this->belongsTo(CashShift::class);
    }

    /** @return BelongsTo<self, $this> */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    // ============ Accessors ============

    /**
     * The guest has something they can actually check.
     *
     * A receipt without a fiscal sign is a piece of paper: the QR leads nowhere
     * and the tax authority has never heard of the meal.
     */
    protected function isLegal(): Attribute
    {
        return Attribute::get(fn (): bool => $this->status === 'registered'
            && $this->fiscal_sign !== null);
    }

    /** Nothing more will happen to this document. */
    protected function isSettled(): Attribute
    {
        return Attribute::get(fn (): bool => in_array($this->status, ['registered', 'expired', 'void'], true));
    }

    // ============ Scopes ============

    /**
     * Documents the relay should pick up now.
     *
     * `next_attempt_at` null means never tried; otherwise the backoff has to
     * have elapsed. Ordered by the caller — this only says which ones are ripe.
     */
    public function scopeDue(Builder $query): Builder
    {
        return $query
            ->whereIn('status', ['pending', 'sent'])
            ->where(fn (Builder $q) => $q
                ->whereNull('next_attempt_at')
                ->orWhere('next_attempt_at', '<=', now()));
    }

    /**
     * Everything that has not reached the tax authority, ripe or not.
     *
     * This is the figure a till shows as `fiscal_pending` and a Z-report names:
     * a cashier closing a shift is entitled to know that four of tonight's meals
     * have not been declared.
     */
    public function scopeOutstanding(Builder $query): Builder
    {
        return $query->whereIn('status', ['pending', 'sent']);
    }

    /**
     * Documents the authority's window has already closed on.
     *
     * The second branch is the one worth explaining. `expires_at` is written by
     * the registrar on every document it raises, so in practice it is always
     * there — but the column is nullable, and a row that arrived any other way
     * (a repair script, an import from a till that traded before its OFD was
     * configured) would otherwise have no deadline at all. It would then be
     * retried forever and never counted as a liability, which is precisely the
     * quiet way of never filing anything that the window exists to prevent.
     *
     * So a document with no deadline still has one: the window runs from when
     * the meal was sold, not from whether a column got filled in.
     */
    public function scopePastWindow(Builder $query, int $windowHours): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->where('expires_at', '<=', now())
            ->orWhere(fn (Builder $undated) => $undated
                ->whereNull('expires_at')
                ->where('created_at', '<=', now()->subHours($windowHours))));
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'order_id', 'kind', 'status', 'total', 'fiscal_sign', 'attempts'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('finance.fiscal_receipt');
    }
}
