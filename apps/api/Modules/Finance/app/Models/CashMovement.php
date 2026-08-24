<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasBusinessDate;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Modules\Finance\Database\Factories\CashMovementFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Money moving without anything being bought.
 *
 * Change brought from the safe, a miscount corrected, notes swapped for coins.
 * It is not revenue and must never reach the takings — but it IS in the box at
 * counting time, and a shift that did not know about it reported the drawer over
 * by exactly the amount somebody helpfully brought.
 *
 * Since the cash book, a row can also belong to an ACCOUNT rather than a drawer
 * — the safe, the bank, the office float — and two rows pointing at each other
 * through `counterpart_id` are one transfer. A single-legged transfer was the
 * defect that made this necessary: money leaving the till for the safe read as
 * money gone, so a night that made a profit showed a loss.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property int|null $cash_shift_id Null on a movement between accounts — no drawer was open
 * @property int|null $cash_account_id The safe, the bank or the office float
 * @property int|null $counterpart_id The other leg, when this row is half of a transfer
 * @property int|null $cash_count_id Set when the money was counted by note on the way in
 * @property Carbon|null $business_date
 * @property string $direction in|out
 * @property int $amount Amount in tiyin (1 UZS = 100 tiyin), always positive
 * @property string $reason
 * @property int|null $recorded_by_user_id
 * @property Carbon $occurred_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read CashAccount|null $cashAccount
 * @property-read CashCount|null $cashCount
 * @property-read CashShift|null $cashShift
 * @property-read CashMovement|null $counterpart
 * @property-read User|null $recordedBy
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Finance\Database\Factories\CashMovementFactory factory($count = null, $state = [])
 * @method static Builder<static>|CashMovement incoming()
 * @method static Builder<static>|CashMovement newModelQuery()
 * @method static Builder<static>|CashMovement newQuery()
 * @method static Builder<static>|CashMovement query()
 * @method static Builder<static>|CashMovement whereAmount($value)
 * @method static Builder<static>|CashMovement whereBranchId($value)
 * @method static Builder<static>|CashMovement whereBusinessDate($value)
 * @method static Builder<static>|CashMovement whereCashAccountId($value)
 * @method static Builder<static>|CashMovement whereCashCountId($value)
 * @method static Builder<static>|CashMovement whereCashShiftId($value)
 * @method static Builder<static>|CashMovement whereCounterpartId($value)
 * @method static Builder<static>|CashMovement whereCreatedAt($value)
 * @method static Builder<static>|CashMovement whereDirection($value)
 * @method static Builder<static>|CashMovement whereId($value)
 * @method static Builder<static>|CashMovement whereOccurredAt($value)
 * @method static Builder<static>|CashMovement whereReason($value)
 * @method static Builder<static>|CashMovement whereRecordedByUserId($value)
 * @method static Builder<static>|CashMovement whereTenantId($value)
 * @method static Builder<static>|CashMovement whereUpdatedAt($value)
 *
 * @mixin \Eloquent
 */
final class CashMovement extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;
    use HasBusinessDate;

    /** @use HasFactory<CashMovementFactory> */
    use HasFactory;

    use LogsActivity;

    protected $table = 'finance.cash_movements';

    public const DIRECTIONS = ['in', 'out'];

    /** The trading day for this row is taken from when the drawer opened. */
    protected static function businessDateSource(): string
    {
        return 'occurred_at';
    }

    protected $fillable = [
        'business_date',
        'tenant_id',
        'branch_id',
        'cash_shift_id',
        'cash_account_id',
        'counterpart_id',
        'cash_count_id',
        'direction',
        'amount',
        'reason',
        'recorded_by_user_id',
        'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'occurred_at' => 'datetime',
            'amount' => 'integer',
        ];
    }

    protected static function newFactory(): CashMovementFactory
    {
        return CashMovementFactory::new();
    }

    // ============ Relationships ============

    /** @return BelongsTo<CashShift, $this> */
    public function cashShift(): BelongsTo
    {
        return $this->belongsTo(CashShift::class);
    }

    /** @return BelongsTo<CashCount, $this> */
    public function cashCount(): BelongsTo
    {
        return $this->belongsTo(CashCount::class);
    }

    /**
     * The safe, the bank or the office float this row moved.
     *
     * Null on a drawer movement, which is every row written before the cash
     * book existed — see the 2026_08_22_200400 migration for why both anchors
     * are nullable and a CHECK insists on one of them.
     *
     * @return BelongsTo<CashAccount, $this>
     */
    public function cashAccount(): BelongsTo
    {
        return $this->belongsTo(CashAccount::class);
    }

    /**
     * The other leg, when this row is half of a transfer.
     *
     * Set on both rows so either can be read first: a ledger scrolled from the
     * bank's side has to be able to say where the money came from without
     * scanning for a row that happens to have the same amount and minute.
     *
     * @return BelongsTo<CashMovement, $this>
     */
    public function counterpart(): BelongsTo
    {
        return $this->belongsTo(self::class, 'counterpart_id');
    }

    /** @return BelongsTo<User, $this> */
    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by_user_id');
    }

    // ============ Scopes ============

    public function scopeIncoming(Builder $query): Builder
    {
        return $query->where('direction', 'in');
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'cash_shift_id', 'direction', 'amount', 'reason', 'recorded_by_user_id'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('finance.cash_movement');
    }
}
