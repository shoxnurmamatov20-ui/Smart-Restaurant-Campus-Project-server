<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

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
use Modules\Finance\Database\Factories\CashShiftFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A cashier's session at the till, from opening float to Z-report.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $number
 * @property int|null $opened_by_user_id
 * @property Carbon $opened_at
 * @property Carbon|null $closed_at
 * @property int $opening_cash Amount in tiyin (1 UZS = 100 tiyin)
 * @property int $expected_cash Opening float + cash payments − payouts
 * @property int $counted_cash What the cashier actually counted
 * @property int $difference counted − expected; negative means short
 * @property string $status open
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property int|null $branch_id
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read Collection<int, Expense> $expenses
 * @property-read int|null $expenses_count
 * @property-read bool $is_open
 * @property-read Collection<int, Payment> $payments
 * @property-read int|null $payments_count
 * @property-read Tenant|null $tenant
 * @property-read int $total_takings
 *
 * @method static \Modules\Finance\Database\Factories\CashShiftFactory factory($count = null, $state = [])
 * @method static Builder<static>|CashShift newModelQuery()
 * @method static Builder<static>|CashShift newQuery()
 * @method static Builder<static>|CashShift onlyTrashed()
 * @method static Builder<static>|CashShift open()
 * @method static Builder<static>|CashShift query()
 * @method static Builder<static>|CashShift whereBranchId($value)
 * @method static Builder<static>|CashShift whereClosedAt($value)
 * @method static Builder<static>|CashShift whereCountedCash($value)
 * @method static Builder<static>|CashShift whereCreatedAt($value)
 * @method static Builder<static>|CashShift whereDeletedAt($value)
 * @method static Builder<static>|CashShift whereDifference($value)
 * @method static Builder<static>|CashShift whereExpectedCash($value)
 * @method static Builder<static>|CashShift whereId($value)
 * @method static Builder<static>|CashShift whereNote($value)
 * @method static Builder<static>|CashShift whereNumber($value)
 * @method static Builder<static>|CashShift whereOpenedAt($value)
 * @method static Builder<static>|CashShift whereOpenedByUserId($value)
 * @method static Builder<static>|CashShift whereOpeningCash($value)
 * @method static Builder<static>|CashShift whereStatus($value)
 * @method static Builder<static>|CashShift whereTenantId($value)
 * @method static Builder<static>|CashShift whereUpdatedAt($value)
 * @method static Builder<static>|CashShift withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|CashShift withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class CashShift extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<CashShiftFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'finance.cash_shifts';

    public const STATUSES = ['open', 'closed'];

    protected $fillable = [
        'tenant_id',
        'number',
        'opened_by_user_id',
        'opened_at',
        'closed_at',
        'opening_cash',
        'expected_cash',
        'counted_cash',
        'difference',
        'status',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'opened_at' => 'datetime',
            'closed_at' => 'datetime',
            'opening_cash' => 'integer',
            'expected_cash' => 'integer',
            'counted_cash' => 'integer',
            'difference' => 'integer',
        ];
    }

    protected static function newFactory(): CashShiftFactory
    {
        return CashShiftFactory::new();
    }

    // ============ Relationships ============

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class);
    }

    // ============ Accessors ============

    protected function isOpen(): Attribute
    {
        return Attribute::get(fn (): bool => $this->status === 'open');
    }

    /** Everything taken this session, by any method. */
    protected function totalTakings(): Attribute
    {
        return Attribute::get(fn (): int => (int) $this->payments()
            ->where('status', 'captured')->sum('amount'));
    }

    // ============ Domain behaviour ============

    /**
     * Close the till and compute the Z-report.
     *
     * The expected cash is derived here, never sent by the client: the whole
     * point of the count is to compare the drawer against what the system says
     * should be in it.
     */
    public function close(int $countedCash, ?string $note = null): bool
    {
        if ($this->status === 'closed') {
            return false;
        }

        $cashIn = (int) $this->payments()
            ->where('status', 'captured')->where('method', 'cash')->sum('amount');
        $cashOut = (int) $this->expenses()->where('paid_in_cash', true)->sum('amount');
        $expected = $this->opening_cash + $cashIn - $cashOut;

        return $this->update([
            'status' => 'closed',
            'closed_at' => now(),
            'expected_cash' => $expected,
            'counted_cash' => $countedCash,
            'difference' => $countedCash - $expected,
            'note' => $note ?? $this->note,
        ]);
    }

    // ============ Scopes ============

    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('status', 'open');
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'number', 'opened_at', 'closed_at', 'expected_cash', 'counted_cash', 'difference', 'status'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('finance.cash_shift');
    }
}
