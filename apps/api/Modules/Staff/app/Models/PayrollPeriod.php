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
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A month of wages for one venue: draft while it is a computation, frozen once
 * somebody has signed it off.
 *
 * The run is the unit people talk about — "have you done August yet" — and the
 * lines hang off it. `BelongsToBranch` is here and deliberately not on
 * `PayrollLine`: a run is for one venue's people, and repeating the venue on
 * every line would be a second place for it to be wrong.
 *
 * `LogsActivity`, which most read models on this platform do not carry. Money
 * that somebody signed off is the one category of row where "who changed this,
 * and when" has to be answerable a year later without anybody having thought to
 * ask at the time.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property string $period The payroll month, YYYY-MM
 * @property Carbon $starts_on
 * @property Carbon $ends_on
 * @property string $status draft | finalised
 * @property int $gross_tiyin
 * @property int $deductions_tiyin
 * @property int $net_tiyin
 * @property Carbon|null $finalised_at
 * @property int|null $finalised_by_user_id
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read bool $is_finalised
 * @property-read Collection<int, PayrollLine> $lines
 * @property-read int|null $lines_count
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|PayrollPeriod draft()
 * @method static Builder<static>|PayrollPeriod newModelQuery()
 * @method static Builder<static>|PayrollPeriod newQuery()
 * @method static Builder<static>|PayrollPeriod query()
 * @method static Builder<static>|PayrollPeriod whereBranchId($value)
 * @method static Builder<static>|PayrollPeriod whereCreatedAt($value)
 * @method static Builder<static>|PayrollPeriod whereDeductionsTiyin($value)
 * @method static Builder<static>|PayrollPeriod whereEndsOn($value)
 * @method static Builder<static>|PayrollPeriod whereFinalisedAt($value)
 * @method static Builder<static>|PayrollPeriod whereFinalisedByUserId($value)
 * @method static Builder<static>|PayrollPeriod whereGrossTiyin($value)
 * @method static Builder<static>|PayrollPeriod whereId($value)
 * @method static Builder<static>|PayrollPeriod whereNetTiyin($value)
 * @method static Builder<static>|PayrollPeriod whereNote($value)
 * @method static Builder<static>|PayrollPeriod wherePeriod($value)
 * @method static Builder<static>|PayrollPeriod whereStartsOn($value)
 * @method static Builder<static>|PayrollPeriod whereStatus($value)
 * @method static Builder<static>|PayrollPeriod whereTenantId($value)
 * @method static Builder<static>|PayrollPeriod whereUpdatedAt($value)
 *
 * @mixin \Eloquent
 */
final class PayrollPeriod extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;
    use LogsActivity;

    protected $table = 'staff.payroll_periods';

    /**
     * Two rungs, and nothing after the second.
     *
     * A month that turns out to be wrong once it has been signed off is
     * corrected by an adjustment in the next run, the way accounting corrects
     * things — not by editing what was already paid. That is why there is no
     * `reopened` here and no verb that would produce one.
     */
    public const STATUSES = ['draft', 'finalised'];

    /**
     * A month, `YYYY-MM`, with a real month number in it.
     *
     * Shared by the model and `StorePayrollPeriodRequest` so the rule is
     * written once: `2026-13` is not a month, and neither is `26-8`.
     */
    public const PERIOD_PATTERN = '/^\d{4}-(0[1-9]|1[0-2])$/';

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'period',
        'starts_on',
        'ends_on',
        'status',
        'gross_tiyin',
        'deductions_tiyin',
        'net_tiyin',
        'finalised_at',
        'finalised_by_user_id',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'starts_on' => 'date',
            'ends_on' => 'date',
            'finalised_at' => 'datetime',
            'gross_tiyin' => 'integer',
            'deductions_tiyin' => 'integer',
            'net_tiyin' => 'integer',
            'finalised_by_user_id' => 'integer',
        ];
    }

    // ============ Relationships ============

    public function lines(): HasMany
    {
        return $this->hasMany(PayrollLine::class);
    }

    // ============ Accessors ============

    /**
     * Read by three call sites that all mean the same thing: this run cannot be
     * rebuilt, its lines cannot be edited, and its totals will not move again.
     */
    protected function isFinalised(): Attribute
    {
        return Attribute::get(fn (): bool => $this->status === 'finalised');
    }

    // ============ Scopes ============

    public function scopeDraft(Builder $query): Builder
    {
        return $query->where('status', 'draft');
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly([
                'tenant_id', 'branch_id', 'period', 'status',
                'gross_tiyin', 'deductions_tiyin', 'net_tiyin', 'finalised_by_user_id',
            ])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('staff.payroll_period');
    }
}
