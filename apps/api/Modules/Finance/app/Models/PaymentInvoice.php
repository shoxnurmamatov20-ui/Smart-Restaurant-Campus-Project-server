<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Contracts\Finance\PaymentInvoice as InvoiceHandle;
use App\Contracts\Finance\PaymentResult;
use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasBusinessDate;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Modules\Finance\Database\Factories\PaymentInvoiceFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One attempt to pay a bill through an external provider.
 *
 * Deliberately not a `Payment`: this is a conversation, and most of them end
 * with the guest closing the app. See the migration for why keeping the two
 * apart is what keeps the day's takings true.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property Carbon|null $business_date
 * @property int|null $branch_id
 * @property string $token Opaque public handle — never the row id
 * @property string $provider payme|click|uzum|sandbox
 * @property int|null $order_id Orders module id, no FK on purpose
 * @property string|null $order_number
 * @property int $amount Amount in tiyin (1 UZS = 100 tiyin)
 * @property string $state One of self::STATES
 * @property string|null $provider_invoice_id
 * @property string $pay_url
 * @property string|null $return_url
 * @property int|null $payment_id
 * @property Carbon|null $reserved_at
 * @property Carbon|null $paid_at
 * @property Carbon|null $cancelled_at
 * @property string|null $cancel_reason
 * @property string|null $last_error
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Finance\Database\Factories\PaymentInvoiceFactory factory($count = null, $state = [])
 * @method static Builder<static>|PaymentInvoice newModelQuery()
 * @method static Builder<static>|PaymentInvoice newQuery()
 * @method static Builder<static>|PaymentInvoice onlyTrashed()
 * @method static Builder<static>|PaymentInvoice paid()
 * @method static Builder<static>|PaymentInvoice query()
 * @method static Builder<static>|PaymentInvoice settled()
 * @method static Builder<static>|PaymentInvoice withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|PaymentInvoice withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class PaymentInvoice extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;
    use HasBusinessDate;

    /** @use HasFactory<PaymentInvoiceFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    /**
     * A meal declared but never paid for is not evidence of anything; a meal
     * paid for is. Kept in step with `finance.payments`, which is never
     * hard-deleted either.
     */
    protected $table = 'finance.payment_invoices';

    /** Mirrors App\Contracts\Finance\PaymentResult, plus the one state only we can reach. */
    public const STATES = [
        PaymentResult::PENDING,
        PaymentResult::PAID,
        PaymentResult::CANCELLED,
        PaymentResult::FAILED,
        /*
         * Nobody ever came back.
         *
         * Not `cancelled`, because nobody cancelled it — the guest closed the
         * tab. The two look the same on a screen and are different questions to
         * an accountant reconciling a provider's statement: a cancellation has a
         * counterpart on the provider's side, an expiry has none.
         */
        'expired',
    ];

    /** The trading day for this row is taken from when the attempt was opened. */
    protected static function businessDateSource(): string
    {
        return 'created_at';
    }

    protected $fillable = [
        'business_date',
        'tenant_id',
        'branch_id',
        'token',
        'provider',
        'order_id',
        'order_number',
        'amount',
        'state',
        'provider_invoice_id',
        'pay_url',
        'return_url',
        'payment_id',
        'reserved_at',
        'paid_at',
        'cancelled_at',
        'cancel_reason',
        'last_error',
    ];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'reserved_at' => 'datetime',
            'paid_at' => 'datetime',
            'cancelled_at' => 'datetime',
            /*
             * Postgres hands bigint back as a string through PDO, and a string
             * in a money path is a float waiting to happen. The same cast, and
             * the same reason, as Payment::casts().
             */
            'amount' => 'integer',
            'payment_id' => 'integer',
            'order_id' => 'integer',
        ];
    }

    protected static function newFactory(): PaymentInvoiceFactory
    {
        return PaymentInvoiceFactory::new();
    }

    // ============ Domain behaviour ============

    /**
     * 32 hex characters of randomness.
     *
     * `Str::random()` draws from the same CSPRNG; hex is chosen so the value
     * survives a URL, a QR code and a bank's own form field without escaping —
     * three places this token demonstrably ends up.
     */
    public static function mintToken(): string
    {
        return bin2hex(random_bytes(16));
    }

    /** Still worth polling: the guest may yet pay. */
    public function isOpen(): bool
    {
        return in_array($this->state, [PaymentResult::PENDING], true);
    }

    /** The handle a guest surface is allowed to see. */
    public function handle(): InvoiceHandle
    {
        return new InvoiceHandle(
            provider: $this->provider,
            token: $this->token,
            invoiceId: $this->provider_invoice_id,
            payUrl: $this->pay_url,
            amount: $this->amount,
            state: $this->state,
            orderId: $this->order_id,
            orderNumber: $this->order_number,
        );
    }

    /**
     * The reference a stranger's payment carries into the day's takings.
     *
     * Provider first, because "PAYME 6512…" is what an accountant matches
     * against a settlement statement; the token is ours and means nothing to
     * them. Truncated to what `finance.payments.reference` can hold.
     */
    public function tenderReference(): string
    {
        return Str::limit(
            mb_strtoupper($this->provider).' '.($this->provider_invoice_id ?? $this->token),
            120,
            '',
        );
    }

    // ============ Scopes ============

    /** @param Builder<static> $query */
    public function scopePaid(Builder $query): Builder
    {
        return $query->where('state', PaymentResult::PAID);
    }

    /**
     * Anything that will never move again — for the sweeper and for reports.
     *
     * @param  Builder<static>  $query
     */
    public function scopeSettled(Builder $query): Builder
    {
        return $query->whereIn('state', [PaymentResult::PAID, PaymentResult::CANCELLED, 'expired']);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'provider', 'order_id', 'amount', 'state', 'provider_invoice_id', 'payment_id'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('finance.payment_invoice');
    }
}
