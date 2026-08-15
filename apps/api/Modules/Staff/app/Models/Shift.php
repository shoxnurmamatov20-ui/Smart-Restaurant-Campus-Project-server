<?php

declare(strict_types=1);

namespace Modules\Staff\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Staff\Database\Factories\ShiftFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A planned working slot on the rota.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $staff_member_id
 * @property Carbon $starts_at
 * @property Carbon $ends_at
 * @property string|null $role
 * @property string $status planned
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property int|null $branch_id
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read StaffMember|null $member
 * @property-read float $planned_hours
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Staff\Database\Factories\ShiftFactory factory($count = null, $state = [])
 * @method static Builder<static>|Shift newModelQuery()
 * @method static Builder<static>|Shift newQuery()
 * @method static Builder<static>|Shift onlyTrashed()
 * @method static Builder<static>|Shift query()
 * @method static Builder<static>|Shift upcoming()
 * @method static Builder<static>|Shift whereBranchId($value)
 * @method static Builder<static>|Shift whereCreatedAt($value)
 * @method static Builder<static>|Shift whereDeletedAt($value)
 * @method static Builder<static>|Shift whereEndsAt($value)
 * @method static Builder<static>|Shift whereId($value)
 * @method static Builder<static>|Shift whereNote($value)
 * @method static Builder<static>|Shift whereRole($value)
 * @method static Builder<static>|Shift whereStaffMemberId($value)
 * @method static Builder<static>|Shift whereStartsAt($value)
 * @method static Builder<static>|Shift whereStatus($value)
 * @method static Builder<static>|Shift whereTenantId($value)
 * @method static Builder<static>|Shift whereUpdatedAt($value)
 * @method static Builder<static>|Shift withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Shift withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Shift extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<ShiftFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'staff.shifts';

    public const STATUSES = ['planned', 'confirmed', 'swapped', 'cancelled'];

    protected $fillable = [
        'tenant_id',
        'staff_member_id',
        'starts_at',
        'ends_at',
        'role',
        'status',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    protected static function newFactory(): ShiftFactory
    {
        return ShiftFactory::new();
    }

    // ============ Relationships ============

    public function member(): BelongsTo
    {
        return $this->belongsTo(StaffMember::class, 'staff_member_id');
    }

    // ============ Accessors ============

    protected function plannedHours(): Attribute
    {
        return Attribute::get(fn (): float => $this->starts_at && $this->ends_at
            ? round($this->starts_at->diffInMinutes($this->ends_at) / 60, 2)
            : 0.0);
    }

    // ============ Scopes ============

    public function scopeUpcoming(Builder $query): Builder
    {
        return $query->where('starts_at', '>=', now())->whereIn('status', ['planned', 'confirmed']);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'staff_member_id', 'starts_at', 'ends_at', 'status'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('staff.shift');
    }
}
