<?php

declare(strict_types=1);

namespace Modules\Staff\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One person's month: the row a payslip is printed from.
 *
 * `BelongsToTenant` and not `BelongsToBranch`, on purpose — see the migration.
 * The venue is a property of the run; a line's only structural question is
 * which run it is part of.
 *
 * `hourly_rate` is a copy of what `staff_members.hourly_rate` said at the
 * moment the run was built, and copying it is the entire point of the table:
 * a rise in September must not restate the August that was already paid.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $payroll_period_id
 * @property int $staff_member_id
 * @property int $minutes_worked From attendance, not from the rota
 * @property int $hourly_rate Tiyin per hour, snapshotted when the run was built
 * @property int $basic_tiyin
 * @property int $service_charge_tiyin
 * @property int $bonus_tiyin
 * @property int $deductions_tiyin
 * @property int $net_tiyin
 * @property int $shifts_count
 * @property int $late_count
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read StaffMember|null $member
 * @property-read PayrollPeriod|null $period
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|PayrollLine newModelQuery()
 * @method static Builder<static>|PayrollLine newQuery()
 * @method static Builder<static>|PayrollLine query()
 * @method static Builder<static>|PayrollLine whereBasicTiyin($value)
 * @method static Builder<static>|PayrollLine whereBonusTiyin($value)
 * @method static Builder<static>|PayrollLine whereCreatedAt($value)
 * @method static Builder<static>|PayrollLine whereDeductionsTiyin($value)
 * @method static Builder<static>|PayrollLine whereHourlyRate($value)
 * @method static Builder<static>|PayrollLine whereId($value)
 * @method static Builder<static>|PayrollLine whereLateCount($value)
 * @method static Builder<static>|PayrollLine whereMinutesWorked($value)
 * @method static Builder<static>|PayrollLine whereNetTiyin($value)
 * @method static Builder<static>|PayrollLine whereNote($value)
 * @method static Builder<static>|PayrollLine wherePayrollPeriodId($value)
 * @method static Builder<static>|PayrollLine whereServiceChargeTiyin($value)
 * @method static Builder<static>|PayrollLine whereShiftsCount($value)
 * @method static Builder<static>|PayrollLine whereStaffMemberId($value)
 * @method static Builder<static>|PayrollLine whereTenantId($value)
 * @method static Builder<static>|PayrollLine whereUpdatedAt($value)
 *
 * @mixin \Eloquent
 */
final class PayrollLine extends Model
{
    use BelongsToTenant;

    protected $table = 'staff.payroll_lines';

    protected $fillable = [
        'tenant_id',
        'payroll_period_id',
        'staff_member_id',
        'minutes_worked',
        'hourly_rate',
        'basic_tiyin',
        'service_charge_tiyin',
        'bonus_tiyin',
        'deductions_tiyin',
        'net_tiyin',
        'shifts_count',
        'late_count',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'minutes_worked' => 'integer',
            'hourly_rate' => 'integer',
            'basic_tiyin' => 'integer',
            'service_charge_tiyin' => 'integer',
            'bonus_tiyin' => 'integer',
            'deductions_tiyin' => 'integer',
            'net_tiyin' => 'integer',
            'shifts_count' => 'integer',
            'late_count' => 'integer',
        ];
    }

    // ============ Relationships ============

    public function period(): BelongsTo
    {
        return $this->belongsTo(PayrollPeriod::class, 'payroll_period_id');
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(StaffMember::class, 'staff_member_id');
    }

    // ============ Derived figures ============

    /**
     * What this line is worth, from the four columns that make it up.
     *
     * A method rather than a database expression or a repeated sum at each call
     * site, because three of them need it — the builder writing a fresh line,
     * the PATCH that adds a bonus, and any future import — and three copies of
     * one addition is three chances to leave out the service charge. That
     * particular omission would be invisible on every line where the pool has
     * not been shared yet, which is today all of them.
     *
     * May be negative: an advance larger than the month that followed it is a
     * real thing, and the column is signed for exactly that.
     */
    public function computedNet(): int
    {
        return $this->basic_tiyin
            + $this->service_charge_tiyin
            + $this->bonus_tiyin
            - $this->deductions_tiyin;
    }
}
