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
 * @property Carbon|null $business_date The trading day this row belongs to — DECISIONS Q3
 * @property int|null $cash_shift_id
 * @property string $category rent
 * @property string $description
 * @property int $amount Amount in tiyin (1 UZS = 100 tiyin)
 * @property bool $paid_in_cash Only cash payouts affect the Z-report
 * @property Carbon|null $spent_at
 * @property Carbon|null $paid_at When the money left; null means filed and unpaid
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
 * @method static Builder<static>|Expense unpaid()
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

    /**
     * A payout is paid the moment it is recorded; an invoice is not.
     *
     * `paid_in_cash` is the difference and it is not a guess: it says notes
     * left a drawer, which is an event with no gap between happening and being
     * written down. Everything else — the rent, the electricity, an advertising
     * invoice — is filed when the paper arrives and paid on some later day the
     * accountant decides, so it starts null and the books screen's chip is what
     * closes it.
     *
     * Stamped from `spent_at` rather than the clock, so a payout entered an
     * hour late is not recorded as having been paid an hour after it was spent.
     */
    protected static function booted(): void
    {
        self::creating(function (self $expense): void {
            // `=== false`, not `!== true`: the column defaults to true and a
            // writer that never mentioned it means a drawer payout. Testing for
            // the positive would file those as unpaid while the database
            // recorded them as cash — a row that contradicts itself.
            if ($expense->paid_at !== null || $expense->paid_in_cash === false) {
                return;
            }

            $expense->paid_at = $expense->spent_at ?? now();
        });
    }

    protected $table = 'finance.expenses';

    /**
     * `refund` is money handed back to a guest for a bill an earlier, now-closed
     * shift took. It is not an expense in the accounting sense and it is exactly
     * one in the drawer's: notes left the till tonight. Naming it rather than
     * filing it under `other` is what lets a Z-report show it as its own line
     * instead of an unexplained payout — see EloquentTillLedger::refund().
     */
    public const CATEGORIES = ['rent', 'utilities', 'payroll', 'purchase', 'marketing', 'repair', 'refund', 'other'];

    protected $fillable = [
        'business_date',
        'tenant_id',
        'cash_shift_id',
        'category',
        'description',
        'amount',
        'paid_in_cash',
        'spent_at',
        // Nullable and meaningful: null is an invoice that has been filed and
        // not yet paid. See the migration for why every pre-existing row was
        // backfilled as paid rather than left null.
        'paid_at',
    ];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'spent_at' => 'datetime',
            'paid_at' => 'datetime',
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

    /** Filed, not yet paid — what the restaurant still owes on its own books. */
    public function scopeUnpaid(Builder $query): Builder
    {
        return $query->whereNull('paid_at');
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
            ->logOnly(['tenant_id', 'cash_shift_id', 'category', 'amount', 'paid_in_cash', 'paid_at'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('finance.expense');
    }
}
