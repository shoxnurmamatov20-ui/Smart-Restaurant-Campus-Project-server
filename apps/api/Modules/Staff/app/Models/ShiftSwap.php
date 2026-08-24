<?php

declare(strict_types=1);

namespace Modules\Staff\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Staff\Database\Factories\ShiftSwapFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * "I cannot work Thursday — can somebody take it?"
 *
 * A request, not a change. Nothing about the rota moves until a manager
 * approves it, and that asymmetry is the same one the till's approval ladder
 * uses: asking is open to the person it affects, granting needs `staff.manage`.
 * A waiter who could hand their own shift away would be a waiter who can empty
 * a Saturday night.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property int $shift_id
 * @property int $requested_by_id
 * @property int|null $offered_to_id null = open to anyone
 * @property string $status pending | approved | rejected | cancelled
 * @property string|null $reason
 * @property int|null $decided_by
 * @property Carbon|null $decided_at
 * @property string|null $decision_note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Shift|null $shift
 * @property-read StaffMember|null $requestedBy
 * @property-read StaffMember|null $offeredTo
 * @property-read User|null $decidedBy
 *
 * @method static \Modules\Staff\Database\Factories\ShiftSwapFactory factory($count = null, $state = [])
 * @method static Builder<static>|ShiftSwap newModelQuery()
 * @method static Builder<static>|ShiftSwap newQuery()
 * @method static Builder<static>|ShiftSwap onlyTrashed()
 * @method static Builder<static>|ShiftSwap pending()
 * @method static Builder<static>|ShiftSwap query()
 * @method static Builder<static>|ShiftSwap withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|ShiftSwap withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class ShiftSwap extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<ShiftSwapFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'staff.shift_swaps';

    public const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'shift_id',
        'requested_by_id',
        'offered_to_id',
        'status',
        'reason',
        'decided_by',
        'decided_at',
        'decision_note',
    ];

    protected function casts(): array
    {
        return ['decided_at' => 'datetime'];
    }

    protected static function newFactory(): ShiftSwapFactory
    {
        return ShiftSwapFactory::new();
    }

    // ============ Relationships ============

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(StaffMember::class, 'requested_by_id');
    }

    public function offeredTo(): BelongsTo
    {
        return $this->belongsTo(StaffMember::class, 'offered_to_id');
    }

    public function decidedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    // ============ Scopes ============

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', 'pending');
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'shift_id', 'requested_by_id', 'offered_to_id', 'status', 'decided_by'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('staff.shift_swap');
    }
}
