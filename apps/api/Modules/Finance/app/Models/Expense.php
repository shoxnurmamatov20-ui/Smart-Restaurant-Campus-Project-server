<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Finance\Database\Factories\ExpenseFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Money going out: rent, utilities, purchases, petty cash.
 *
 * @method static ExpenseFactory factory(int $count = null, array $state = [])
 */
final class Expense extends Model
{
    /** @use HasFactory<ExpenseFactory> */
    use BelongsToTenant;

    use HasFactory;
    use LogsActivity;
    use SoftDeletes;

    protected $table = 'finance.expenses';

    public const CATEGORIES = ['rent', 'utilities', 'payroll', 'purchase', 'marketing', 'repair', 'other'];

    protected $fillable = [
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
