<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasBusinessDate;
use App\Models\Tenant;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Finance\Database\Factories\ExpenseFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Money going out: rent, utilities, purchases, petty cash.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $cash_shift_id
 * @property string $category rent
 * @property string $description
 * @property int $amount Amount in tiyin (1 UZS = 100 tiyin)
 * @property bool $paid_in_cash Only cash payouts affect the Z-report
 * @property Carbon|null $spent_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read CashShift|null $cashShift
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Finance\Database\Factories\ExpenseFactory factory($count = null, $state = [])
 * @method static Builder<static>|Expense newModelQuery()
 * @method static Builder<static>|Expense newQuery()
 * @method static Builder<static>|Expense ofCategory(string $category)
 * @method static Builder<static>|Expense onlyTrashed()
 * @method static Builder<static>|Expense query()
 * @method static Builder<static>|Expense today()
 * @method static Builder<static>|Expense whereAmount($value)
 * @method static Builder<static>|Expense whereCashShiftId($value)
 * @method static Builder<static>|Expense whereCategory($value)
 * @method static Builder<static>|Expense whereCreatedAt($value)
 * @method static Builder<static>|Expense whereDeletedAt($value)
 * @method static Builder<static>|Expense whereDescription($value)
 * @method static Builder<static>|Expense whereId($value)
 * @method static Builder<static>|Expense wherePaidInCash($value)
 * @method static Builder<static>|Expense whereSpentAt($value)
 * @method static Builder<static>|Expense whereTenantId($value)
 * @method static Builder<static>|Expense whereUpdatedAt($value)
 * @method static Builder<static>|Expense withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Expense withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Expense extends Model
{
    use BelongsToTenant;
    use HasBusinessDate;

    /** @use HasFactory<ExpenseFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    /** The trading day for this row is taken from `spent_at`. */
    protected static function businessDateSource(): string
    {
        return 'spent_at';
    }

    protected $table = 'finance.expenses';

    public const CATEGORIES = ['rent', 'utilities', 'payroll', 'purchase', 'marketing', 'repair', 'other'];

    protected $fillable = [
        'business_date',
        'tenant_id',
        'cash_shift_id',
        'category',
        'description',
        'amount',
        'paid_in_cash',
        'spent_at',
    ];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'spent_at' => 'datetime',
            'amount' => 'integer',
            'paid_in_cash' => 'boolean',
        ];
    }

    protected static function newFactory(): ExpenseFactory
    {
        return ExpenseFactory::new();
    }

    // ============ Relationships ============

    public function cashShift(): BelongsTo
    {
        return $this->belongsTo(CashShift::class);
    }

    // ============ Scopes ============

    public function scopeOfCategory(Builder $query, string $category): Builder
    {
        return $query->where('category', $category);
    }

    /** Outgoings for the restaurant's current trading day. */
    public function scopeToday(Builder $query): Builder
    {
        $businessDay = app(BusinessDay::class);

        return $businessDay->constrain($query, 'spent_at', $businessDay->window());
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'cash_shift_id', 'category', 'amount', 'paid_in_cash'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('finance.expense');
    }
}
