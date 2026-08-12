<?php

declare(strict_types=1);

namespace Modules\Staff\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Staff\Database\Factories\AttendanceFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Actual clock-in and clock-out — what payroll is computed from.
 *
 * @method static AttendanceFactory factory(int $count = null, array $state = [])
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
