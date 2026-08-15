<?php

declare(strict_types=1);

namespace Modules\Staff\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Staff\Database\Factories\AttendanceFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Actual clock-in and clock-out — what payroll is computed from.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $staff_member_id
 * @property Carbon $checked_in_at
 * @property Carbon|null $checked_out_at
 * @property string $method face
 * @property int $minutes_worked
 * @property bool $is_late
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property int|null $branch_id
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read int $earned_tiyin
 * @property-read bool $is_open
 * @property-read StaffMember|null $member
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Staff\Database\Factories\AttendanceFactory factory($count = null, $state = [])
 * @method static Builder<static>|Attendance newModelQuery()
 * @method static Builder<static>|Attendance newQuery()
 * @method static Builder<static>|Attendance onlyTrashed()
 * @method static Builder<static>|Attendance open()
 * @method static Builder<static>|Attendance query()
 * @method static Builder<static>|Attendance today()
 * @method static Builder<static>|Attendance whereBranchId($value)
 * @method static Builder<static>|Attendance whereCheckedInAt($value)
 * @method static Builder<static>|Attendance whereCheckedOutAt($value)
 * @method static Builder<static>|Attendance whereCreatedAt($value)
 * @method static Builder<static>|Attendance whereDeletedAt($value)
 * @method static Builder<static>|Attendance whereId($value)
 * @method static Builder<static>|Attendance whereIsLate($value)
 * @method static Builder<static>|Attendance whereMethod($value)
 * @method static Builder<static>|Attendance whereMinutesWorked($value)
 * @method static Builder<static>|Attendance whereNote($value)
 * @method static Builder<static>|Attendance whereStaffMemberId($value)
 * @method static Builder<static>|Attendance whereTenantId($value)
 * @method static Builder<static>|Attendance whereUpdatedAt($value)
 * @method static Builder<static>|Attendance withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Attendance withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Attendance extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<AttendanceFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'staff.attendances';

    public const METHODS = ['face', 'qr', 'pin'];

    protected $fillable = [
        'tenant_id',
        'staff_member_id',
        'checked_in_at',
        'checked_out_at',
        'method',
        'minutes_worked',
        'is_late',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'checked_in_at' => 'datetime',
            'checked_out_at' => 'datetime',
            'is_late' => 'boolean',
            'minutes_worked' => 'integer',
        ];
    }

    protected static function newFactory(): AttendanceFactory
    {
        return AttendanceFactory::new();
    }

    // ============ Relationships ============

    public function member(): BelongsTo
    {
        return $this->belongsTo(StaffMember::class, 'staff_member_id');
    }

    // ============ Accessors ============

    protected function isOpen(): Attribute
    {
        return Attribute::get(fn (): bool => $this->checked_out_at === null);
    }

    /** Pay owed for this record, from the member's hourly rate. */
    protected function earnedTiyin(): Attribute
    {
        return Attribute::get(fn (): int => (int) round(
            ($this->minutes_worked / 60) * (int) ($this->member?->hourly_rate ?? 0),
        ));
    }

    // ============ Domain behaviour ============

    /**
     * Close the record and freeze the minutes worked.
     *
     * Minutes are stored, not derived on read: an hourly rate that changes next
     * month must not silently rewrite what someone earned last month.
     */
    public function checkOut(): bool
    {
        if ($this->checked_out_at !== null) {
            return false;
        }

        $now = now();

        return $this->update([
            'checked_out_at' => $now,
            'minutes_worked' => max(0, (int) $this->checked_in_at->diffInMinutes($now)),
        ]);
    }

    // ============ Scopes ============

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNull('checked_out_at');
    }

    /**
     * Check-ins for the restaurant's current trading day.
     *
     * A cook clocking in at 05:00 for the morning prep is on today's shift; one
     * clocking in at 23:00 is still on tonight's.
     */
    public function scopeToday(Builder $query): Builder
    {
        $businessDay = app(BusinessDay::class);

        return $businessDay->constrain($query, 'checked_in_at', $businessDay->window());
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'staff_member_id', 'checked_in_at', 'checked_out_at', 'minutes_worked', 'is_late'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('staff.attendance');
    }
}
