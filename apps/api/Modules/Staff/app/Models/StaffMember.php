<?php

declare(strict_types=1);

namespace Modules\Staff\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Staff\Database\Factories\StaffMemberFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Someone who works here: waiter, cook, cashier, courier, manager.
 *
 * @method static StaffMemberFactory factory(int $count = null, array $state = [])
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
