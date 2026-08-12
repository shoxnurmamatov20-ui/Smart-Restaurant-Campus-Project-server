<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Finance\Database\Factories\CashShiftFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A cashier's session at the till, from opening float to Z-report.
 *
 * @method static CashShiftFactory factory(int $count = null, array $state = [])
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
