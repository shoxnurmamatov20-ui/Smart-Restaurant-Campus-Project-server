<?php

declare(strict_types=1);

namespace Modules\Pos\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Modules\Pos\Database\Factories\PosApprovalFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One manager's authorisation, requested and answered.
 *
 * The lifecycle is deliberately narrow. An approval is created `pending`,
 * answered once, and spent once — `used` is a terminal state, so a cashier
 * cannot get one void signed off and then quietly apply it to three more.
 * It also expires in minutes, because an authorisation that can be banked for
 * later is not an authorisation, it is a licence.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id Null only on a request raised from a phone
 * @property int|null $terminal_id Null when nobody was at a till
 * @property int|null $session_id
 * @property string $action void_line|void_order|discount|price_override|reopen_bill|refund|drawer_open|comp|shift_variance
 * @property string|null $subject_type bill|line|payment|drawer|shift
 * @property int|null $subject_id
 * @property int|null $amount Tiyin — how much is at stake
 * @property string $reason
 * @property int $requested_by_user_id
 * @property int|null $approved_by_user_id
 * @property string $status pending|approved|rejected|expired|used
 * @property string|null $method pin|remote — how the manager answered
 * @property Carbon $requested_at
 * @property Carbon|null $decided_at
 * @property Carbon $expires_at
 * @property Carbon|null $used_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read User|null $approvedBy
 * @property-read bool $is_spendable
 * @property-read User $requestedBy
 * @property-read Tenant|null $tenant
 * @property-read Branch|null $branch
 * @property-read Terminal|null $terminal
 *
 * @method static \Modules\Pos\Database\Factories\PosApprovalFactory factory($count = null, $state = [])
 * @method static Builder<static>|PosApproval newModelQuery()
 * @method static Builder<static>|PosApproval newQuery()
 * @method static Builder<static>|PosApproval pending()
 * @method static Builder<static>|PosApproval query()
 * @method static Builder<static>|PosApproval spendable()
 * @method static Builder<static>|PosApproval whereAction($value)
 * @method static Builder<static>|PosApproval whereAmount($value)
 * @method static Builder<static>|PosApproval whereApprovedByUserId($value)
 * @method static Builder<static>|PosApproval whereCreatedAt($value)
 * @method static Builder<static>|PosApproval whereDecidedAt($value)
 * @method static Builder<static>|PosApproval whereExpiresAt($value)
 * @method static Builder<static>|PosApproval whereId($value)
 * @method static Builder<static>|PosApproval whereMethod($value)
 * @method static Builder<static>|PosApproval whereReason($value)
 * @method static Builder<static>|PosApproval whereRequestedAt($value)
 * @method static Builder<static>|PosApproval whereRequestedByUserId($value)
 * @method static Builder<static>|PosApproval whereSessionId($value)
 * @method static Builder<static>|PosApproval whereStatus($value)
 * @method static Builder<static>|PosApproval whereSubjectId($value)
 * @method static Builder<static>|PosApproval whereSubjectType($value)
 * @method static Builder<static>|PosApproval whereTenantId($value)
 * @method static Builder<static>|PosApproval whereTerminalId($value)
 * @method static Builder<static>|PosApproval whereUpdatedAt($value)
 * @method static Builder<static>|PosApproval whereUsedAt($value)
 *
 * @mixin \Eloquent
 */
final class PosApproval extends Model
{
    /*
     * An approval happens at an address.
     *
     * It always did — it was read through `terminal.branch_id` instead, which
     * stopped working the moment a waiter's phone could raise one with no
     * terminal at all. See the migration that added the column.
     */
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<PosApprovalFactory> */
    use HasFactory;

    use LogsActivity;

    protected $table = 'pos.approvals';

    /**
     * Everything a manager can be asked to agree to.
     *
     * `shift_variance` is the odd one and belongs here rather than in Finance:
     * closing a drawer that is short by more than a threshold needs somebody
     * else's name, and the tempting shortcut is for the till to post an
     * `approved_by_user_id` alongside the count. That is a claim, not a
     * signature — a cashier knows their manager's id. Routing it through this
     * table instead gives it what every other authorisation here has: an expiry,
     * a binding to its subject and its amount, a single use, and an answer that
     * can come from a phone.
     */
    public const ACTIONS = [
        'void_line', 'void_order', 'discount', 'price_override',
        'reopen_bill', 'refund', 'drawer_open', 'comp', 'shift_variance',
        /*
         * Signing for a meal past the guest's own ceiling.
         *
         * The subject stays `bill` — this is a decision about one table's bill, not
         * about the customer record — so `SUBJECTS` needs nothing. What a manager is
         * agreeing to is a specific amount of the restaurant's money leaving on
         * trust, which is why the signature is bound to the amount like every other.
         */
        'credit_sale',
    ];

    /**
     * What an authorisation can be about.
     *
     * On the model rather than inline in the controller, because the gate, the
     * request validator and the fraud ledger all have to agree on this list —
     * `shift` was added and only the validator knew, so a request the gate would
     * have accepted was refused at the door.
     *
     * @var array<int, string>
     */
    public const SUBJECTS = ['bill', 'line', 'payment', 'drawer', 'shift'];

    public const STATUSES = ['pending', 'approved', 'rejected', 'expired', 'used'];

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'terminal_id',
        'session_id',
        'action',
        'subject_type',
        'subject_id',
        'amount',
        'reason',
        'requested_by_user_id',
        'approved_by_user_id',
        'status',
        'method',
        'requested_at',
        'decided_at',
        'expires_at',
        'used_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'subject_id' => 'integer',
            'terminal_id' => 'integer',
            'session_id' => 'integer',
            'requested_by_user_id' => 'integer',
            'approved_by_user_id' => 'integer',
            'requested_at' => 'datetime',
            'decided_at' => 'datetime',
            'expires_at' => 'datetime',
            'used_at' => 'datetime',
        ];
    }

    protected static function newFactory(): PosApprovalFactory
    {
        return PosApprovalFactory::new();
    }

    // ============ Relationships ============

    public function terminal(): BelongsTo
    {
        return $this->belongsTo(Terminal::class);
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    // ============ Accessors ============

    protected function isSpendable(): Attribute
    {
        return Attribute::get(fn (): bool => $this->status === 'approved'
            && $this->expires_at !== null
            && $this->expires_at->isFuture());
    }

    // ============ Domain behaviour ============

    public function decide(User $manager, bool $approved, string $method = 'pin'): bool
    {
        if ($this->status !== 'pending') {
            return false;
        }

        if ($this->expires_at !== null && $this->expires_at->isPast()) {
            $this->update(['status' => 'expired']);

            return false;
        }

        return $this->update([
            'status' => $approved ? 'approved' : 'rejected',
            'approved_by_user_id' => $manager->getKey(),
            'method' => $method,
            'decided_at' => now(),
        ]);
    }

    /** Spend it. One authorisation, one act. */
    public function markUsed(): bool
    {
        if (! $this->is_spendable) {
            return false;
        }

        return $this->update(['status' => 'used', 'used_at' => now()]);
    }

    // ============ Scopes ============

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', 'pending');
    }

    public function scopeSpendable(Builder $query): Builder
    {
        return $query->where('status', 'approved')->where('expires_at', '>', now());
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly([
                'tenant_id', 'terminal_id', 'action', 'subject_type', 'subject_id',
                'amount', 'reason', 'requested_by_user_id', 'approved_by_user_id', 'status',
            ])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('pos.approval');
    }
}
