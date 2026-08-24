<?php

declare(strict_types=1);

namespace Modules\Staff\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\UserPin;
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

    /*
     * Eleven, and the last two are desk jobs: an accountant and an order
     * operator sit at the console rather than carry a phone, and both are
     * roles the console's own matrix names (`roles.ts`). They were missing
     * here, which meant an owner could not hire either of them — the two
     * roles existed on the server with nobody able to be given them.
     */
    public const POSITIONS = ['waiter', 'cook', 'chef', 'cashier', 'bartender', 'host', 'courier', 'storekeeper', 'manager', 'accountant', 'operator'];

    public const STATUSES = ['active', 'on_leave', 'suspended', 'terminated'];

    protected $fillable = [
        'tenant_id',
        /*
         * The column has existed since `2026_08_13_000200` and was never
         * fillable, so every member created through the API landed at whatever
         * branch the request context happened to hold — and the roster screen's
         * branch column had nothing to read. A manager hiring somebody for
         * another venue could not say so.
         */
        'branch_id',
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

    /** Swaps this person asked for. The ones offered to them hang off `offered_to_id`. */
    public function shiftSwaps(): HasMany
    {
        return $this->hasMany(ShiftSwap::class, 'requested_by_id');
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

    // ============ Derived figures ============

    /**
     * The three roster columns that are facts about history, not about the
     * person.
     *
     * Turnout, when they last worked, and whether they can sign in at all. None
     * of them can be a column — every one would be right on the day it was
     * written and wrong the next morning, with nothing on the screen to say
     * which — and none of them can be a per-row query either, because that is
     * three statements times thirty people on a list a manager opens daily.
     *
     * So: subqueries, one statement for the whole page.
     *
     * "Turned up" is an attendance that starts inside the shift's own window,
     * from three hours before it to the moment it ends. The lead-in is what
     * makes it correct rather than approximately correct: a cook rostered
     * 08:00–20:00 who clocks in at 05:40 for the morning prep turned up for
     * that shift, and counting only from 08:00 would mark them absent for a day
     * they worked twelve hours of.
     */
    public function scopeWithRosterFigures(Builder $query, ?Carbon $since = null): Builder
    {
        $from = $since ?? now()->subDays(30);
        $attended = <<<'SQL'
            exists (
                select 1 from staff.attendances a
                where a.staff_member_id = staff.shifts.staff_member_id
                  and a.deleted_at is null
                  and a.checked_in_at >= staff.shifts.starts_at - interval '3 hours'
                  and a.checked_in_at <= staff.shifts.ends_at
            )
        SQL;

        /** @param Builder<Shift> $shifts */
        $due = static fn (Builder $shifts): Builder => $shifts
            ->whereNotNull('published_at')
            ->where('status', '!=', 'cancelled')
            // Already happened. A shift next Friday is not turnout yet, and
            // counting it would drag every rate down as the week is published.
            ->where('starts_at', '<=', now())
            ->where('starts_at', '>=', $from);

        return $query
            ->withCount([
                'shifts as shifts_due_count' => $due,
                'shifts as shifts_attended_count' => static fn (Builder $shifts): Builder => $due($shifts)
                    ->whereRaw($attended),
            ])
            ->addSelect([
                'last_shift_at' => Shift::query()
                    ->selectRaw('max(starts_at)')
                    ->whereColumn('staff.shifts.staff_member_id', 'staff.staff_members.id')
                    ->whereNotNull('published_at')
                    ->where('status', '!=', 'cancelled')
                    ->where('starts_at', '<=', now()),
                /*
                 * Whether they can sign in — at a till or on their own phone.
                 *
                 * Read as an existence check rather than as a join, because
                 * `public.user_pins` holds a hash and a lockout counter and
                 * neither belongs anywhere near a roster list. The column
                 * answers one bit: has this person been given a PIN.
                 */
                'has_pin' => UserPin::query()
                    ->selectRaw('count(*)')
                    ->whereColumn('public.user_pins.user_id', 'staff.staff_members.user_id'),
            ]);
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
            ->logOnly(['tenant_id', 'branch_id', 'employee_code', 'first_name', 'last_name', 'position', 'status', 'hourly_rate'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('staff.staff_member');
    }
}
