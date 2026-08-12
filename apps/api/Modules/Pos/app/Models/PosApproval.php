<?php

declare(strict_types=1);

namespace Modules\Pos\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
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
 * @method static PosApprovalFactory factory(int $count = null, array $state = [])
 */
final class PosApproval extends Model
{
    /** @use HasFactory<PosApprovalFactory> */
    use BelongsToTenant;

    use HasFactory;
    use LogsActivity;

    protected $table = 'pos.approvals';

    public const ACTIONS = [
        'void_line', 'void_order', 'discount', 'price_override',
        'reopen_bill', 'refund', 'drawer_open', 'comp',
    ];

    public const STATUSES = ['pending', 'approved', 'rejected', 'expired', 'used'];

    protected $fillable = [
        'tenant_id',
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
