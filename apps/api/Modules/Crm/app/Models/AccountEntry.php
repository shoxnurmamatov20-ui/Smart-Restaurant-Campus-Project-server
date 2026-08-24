<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Activity;
use App\Models\Branch;
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
use Modules\Crm\Database\Factories\AccountEntryFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One line of a guest's tab.
 *
 * Append-only. Nothing here is ever edited or deleted — a charge raised in error
 * is answered by a `reversal`, a debt the restaurant gives up on by a
 * `writeoff`, and a balance that drifted by an `adjustment` with a sentence
 * attached. That is not ceremony: `customers.account_balance` is the sum of
 * these rows, so a row that could change would be a balance that changed with
 * nothing to point at.
 *
 * `amount` is signed and says what the line did to the balance, positive meaning
 * the guest owes more. `balance_after` is the balance once it was posted, so a
 * statement can be read top to bottom without adding anything up — and so a
 * disagreement between the ledger and the customer row can be located at the
 * line where it started rather than merely detected.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property int $customer_id
 * @property Carbon|null $business_date
 * @property string $kind charge|settlement|reversal|adjustment|writeoff
 * @property int $amount Tiyin, signed — what this line did to the balance
 * @property int $balance_after Tiyin, signed
 * @property int|null $order_id
 * @property string|null $order_number
 * @property int|null $payment_id
 * @property int|null $approval_id
 * @property int|null $recorded_by_user_id
 * @property string|null $note
 * @property Carbon $occurred_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read Customer|null $customer
 * @property-read bool $increases_debt
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Crm\Database\Factories\AccountEntryFactory factory($count = null, $state = [])
 * @method static Builder<static>|AccountEntry forBusinessDate(string $date)
 * @method static Builder<static>|AccountEntry newModelQuery()
 * @method static Builder<static>|AccountEntry newQuery()
 * @method static Builder<static>|AccountEntry ofKind(string $kind)
 * @method static Builder<static>|AccountEntry query()
 * @method static Builder<static>|AccountEntry whereAmount($value)
 * @method static Builder<static>|AccountEntry whereApprovalId($value)
 * @method static Builder<static>|AccountEntry whereBalanceAfter($value)
 * @method static Builder<static>|AccountEntry whereBranchId($value)
 * @method static Builder<static>|AccountEntry whereBusinessDate($value)
 * @method static Builder<static>|AccountEntry whereCreatedAt($value)
 * @method static Builder<static>|AccountEntry whereCustomerId($value)
 * @method static Builder<static>|AccountEntry whereId($value)
 * @method static Builder<static>|AccountEntry whereKind($value)
 * @method static Builder<static>|AccountEntry whereNote($value)
 * @method static Builder<static>|AccountEntry whereOccurredAt($value)
 * @method static Builder<static>|AccountEntry whereOrderId($value)
 * @method static Builder<static>|AccountEntry whereOrderNumber($value)
 * @method static Builder<static>|AccountEntry wherePaymentId($value)
 * @method static Builder<static>|AccountEntry whereRecordedByUserId($value)
 * @method static Builder<static>|AccountEntry whereTenantId($value)
 * @method static Builder<static>|AccountEntry whereUpdatedAt($value)
 *
 * @mixin \Eloquent
 */
final class AccountEntry extends Model
{
    use BelongsToTenant;
    use HasBusinessDate;

    /** @use HasFactory<AccountEntryFactory> */
    use HasFactory;

    use LogsActivity;

    protected $table = 'crm.account_entries';

    /**
     * What a line can be.
     *
     * `reversal` and `writeoff` both reduce a debt and are deliberately not the
     * same word. A reversal says the sale did not happen — the guest sent the
     * food back, the bill was refunded — and the restaurant is owed nothing. A
     * writeoff says the sale happened, the guest owes it, and the restaurant has
     * decided it will not collect. One is a correction, the other is a loss, and
     * an accountant reading a year of tabs has to be able to tell them apart:
     * only the second is money the business actually lost.
     */
    public const KINDS = ['charge', 'settlement', 'reversal', 'adjustment', 'writeoff'];

    /** The trading day for this row is taken from when it happened. */
    protected static function businessDateSource(): string
    {
        return 'occurred_at';
    }

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'customer_id',
        'business_date',
        'kind',
        'amount',
        'balance_after',
        'order_id',
        'order_number',
        'payment_id',
        'approval_id',
        'recorded_by_user_id',
        'note',
        'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'occurred_at' => 'datetime',
            /*
             * Every one of these an integer, for the reason Payment states at
             * length: Postgres hands bigint back through PDO as a string, and a
             * string in a money path is a float waiting to happen. `amount` and
             * `balance_after` are signed, and casting keeps the minus an integer
             * rather than a numeric string that sorts before every positive.
             */
            'amount' => 'integer',
            'balance_after' => 'integer',
            'order_id' => 'integer',
            'payment_id' => 'integer',
            'approval_id' => 'integer',
            'recorded_by_user_id' => 'integer',
        ];
    }

    protected static function newFactory(): AccountEntryFactory
    {
        return AccountEntryFactory::new();
    }

    // ============ Relationships ============

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Where the credit was extended — a column, deliberately not `BelongsToBranch`.
     *
     * The trait would come with its global scope, and the scope would be wrong
     * here. A tab belongs to the guest, and a guest belongs to the business: the
     * customer row itself has no branch, and the balance on it is the sum of
     * every line whichever venue signed for it. Read the ledger through the
     * trait with `X-Branch` set and a statement comes back missing the lines from
     * the other branch — with `balance_after` jumping between rows, which is the
     * one number on the page a guest would read as proof the restaurant cannot
     * count.
     *
     * So the column is filled from the branch context when a line is posted, and
     * nothing narrows the read. "Which branch let them run this up" stays
     * answerable; "what do they owe" stays one number.
     */
    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    // ============ Accessors ============

    protected function increasesDebt(): Attribute
    {
        return Attribute::get(fn (): bool => $this->amount > 0);
    }

    // ============ Scopes ============

    public function scopeOfKind(Builder $query, string $kind): Builder
    {
        return $query->where('kind', $kind);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly([
                'tenant_id', 'branch_id', 'customer_id', 'kind', 'amount',
                'balance_after', 'order_id', 'payment_id', 'approval_id', 'recorded_by_user_id',
            ])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('crm.account_entry');
    }
}
