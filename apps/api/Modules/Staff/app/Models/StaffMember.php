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
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Staff\Database\Factories\StaffMemberFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Someone who works here: waiter, cook, cashier, courier, manager.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $user_id Linked login account, if any
 * @property string $employee_code
 * @property string $first_name
 * @property string $last_name
 * @property string|null $phone
 * @property string $position waiter
 * @property string|null $branch_code
 * @property int $hourly_rate Tiyin per hour
 * @property string $status active
 * @property Carbon|null $hired_at
 * @property Carbon|null $terminated_at
 * @property Carbon|null $health_book_expires_at Sanitary book — a HACCP requirement
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property int|null $branch_id
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Collection<int, Attendance> $attendances
 * @property-read int|null $attendances_count
 * @property-read Branch|null $branch
 * @property-read string $full_name
 * @property-read bool $health_book_expired
 * @property-read Collection<int, Shift> $shifts
 * @property-read int|null $shifts_count
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|StaffMember active()
 * @method static \Modules\Staff\Database\Factories\StaffMemberFactory factory($count = null, $state = [])
 * @method static Builder<static>|StaffMember newModelQuery()
 * @method static Builder<static>|StaffMember newQuery()
 * @method static Builder<static>|StaffMember ofPosition(string $position)
 * @method static Builder<static>|StaffMember onlyTrashed()
 * @method static Builder<static>|StaffMember query()
 * @method static Builder<static>|StaffMember whereBranchCode($value)
 * @method static Builder<static>|StaffMember whereBranchId($value)
 * @method static Builder<static>|StaffMember whereCreatedAt($value)
 * @method static Builder<static>|StaffMember whereDeletedAt($value)
 * @method static Builder<static>|StaffMember whereEmployeeCode($value)
 * @method static Builder<static>|StaffMember whereFirstName($value)
 * @method static Builder<static>|StaffMember whereHealthBookExpiresAt($value)
 * @method static Builder<static>|StaffMember whereHiredAt($value)
 * @method static Builder<static>|StaffMember whereHourlyRate($value)
 * @method static Builder<static>|StaffMember whereId($value)
 * @method static Builder<static>|StaffMember whereLastName($value)
 * @method static Builder<static>|StaffMember wherePhone($value)
 * @method static Builder<static>|StaffMember wherePosition($value)
 * @method static Builder<static>|StaffMember whereStatus($value)
 * @method static Builder<static>|StaffMember whereTenantId($value)
 * @method static Builder<static>|StaffMember whereTerminatedAt($value)
 * @method static Builder<static>|StaffMember whereUpdatedAt($value)
 * @method static Builder<static>|StaffMember whereUserId($value)
 * @method static Builder<static>|StaffMember withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|StaffMember withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class StaffMember extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<StaffMemberFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'staff.staff_members';

    public const POSITIONS = ['waiter', 'cook', 'chef', 'cashier', 'bartender', 'host', 'courier', 'storekeeper', 'manager'];

    public const STATUSES = ['active', 'on_leave', 'suspended', 'terminated'];

    protected $fillable = [
        'tenant_id',
        'user_id',
        'employee_code',
        'first_name',
        'last_name',
        'phone',
        'position',
        'branch_code',
        'hourly_rate',
        'status',
        'hired_at',
        'terminated_at',
        'health_book_expires_at',
    ];

    protected function casts(): array
    {
        return [
            'hired_at' => 'date',
            'terminated_at' => 'date',
            'health_book_expires_at' => 'date',
            'hourly_rate' => 'integer',
        ];
    }

    protected static function newFactory(): StaffMemberFactory
    {
        return StaffMemberFactory::new();
    }

    // ============ Relationships ============

    public function shifts(): HasMany
    {
        return $this->hasMany(Shift::class);
    }

    public function attendances(): HasMany
    {
        return $this->hasMany(Attendance::class)->latest('checked_in_at');
    }

    // ============ Accessors ============

    protected function fullName(): Attribute
    {
        return Attribute::get(fn (): string => trim("{$this->last_name} {$this->first_name}"));
    }

    /**
     * A lapsed sanitary book is not paperwork — an inspector can close the
     * kitchen over it, so it surfaces as a first-class flag.
     */
    protected function healthBookExpired(): Attribute
    {
        return Attribute::get(fn (): bool => $this->health_book_expires_at !== null
            && $this->health_book_expires_at->isPast());
    }

    // ============ Scopes ============

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    public function scopeOfPosition(Builder $query, string $position): Builder
    {
        return $query->where('position', $position);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'employee_code', 'first_name', 'last_name', 'position', 'status', 'hourly_rate'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('staff.staff_member');
    }
}
