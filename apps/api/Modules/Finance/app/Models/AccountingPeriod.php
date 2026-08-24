<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One month of books, open or shut.
 *
 * See the migration for why this is per restaurant rather than per branch, and
 * for why the lock — not the row — is the feature.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $period `YYYY-MM`
 * @property Carbon $starts_on
 * @property Carbon $ends_on
 * @property string $status One of self::STATUSES
 * @property int $revenue_tiyin Frozen at the close
 * @property int $expenses_tiyin Frozen at the close
 * @property Carbon|null $closed_at
 * @property int|null $closed_by_user_id
 * @property Carbon|null $reopened_at
 * @property int|null $reopened_by_user_id
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|AccountingPeriod closed()
 * @method static Builder<static>|AccountingPeriod newModelQuery()
 * @method static Builder<static>|AccountingPeriod newQuery()
 * @method static Builder<static>|AccountingPeriod query()
 *
 * @mixin \Eloquent
 */
final class AccountingPeriod extends Model
{
    use BelongsToTenant;
    use LogsActivity;

    protected $table = 'finance.accounting_periods';

    public const STATUSES = ['open', 'closed'];

    protected $fillable = [
        'tenant_id',
        'period',
        'starts_on',
        'ends_on',
        'status',
        'revenue_tiyin',
        'expenses_tiyin',
        'closed_at',
        'closed_by_user_id',
        'reopened_at',
        'reopened_by_user_id',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'starts_on' => 'date',
            'ends_on' => 'date',
            'revenue_tiyin' => 'integer',
            'expenses_tiyin' => 'integer',
            'closed_at' => 'datetime',
            'reopened_at' => 'datetime',
        ];
    }

    /**
     * The first and last trading day of a `YYYY-MM`.
     *
     * Here rather than in the controller because three callers need the same
     * two dates — opening a period, closing one, and the lock deciding which
     * period a row falls in — and three copies of "the zeroth day of next
     * month" is three chances to be off by one on a 31st.
     *
     * @return array{0: string, 1: string} `Y-m-d`, inclusive
     */
    public static function bounds(string $period): array
    {
        $start = Carbon::createFromFormat('Y-m-d', $period.'-01');

        // `createFromFormat` returns false on a malformed string in theory; the
        // request rule already refused anything that is not `YYYY-MM`, and a
        // guard here would be an unreachable branch static analysis then asks
        // about. Fail loudly instead if it ever is reached.
        if (! $start instanceof Carbon) {
            throw new \InvalidArgumentException("Not a period: {$period}");
        }

        $start = $start->startOfDay();

        return [$start->toDateString(), $start->copy()->endOfMonth()->toDateString()];
    }

    public function isClosed(): bool
    {
        return $this->status === 'closed';
    }

    // ============ Scopes ============

    /**
     * @param Builder<AccountingPeriod> $query
     *
     * @return Builder<AccountingPeriod>
     */
    public function scopeClosed(Builder $query): Builder
    {
        return $query->where('status', 'closed');
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'period', 'status', 'revenue_tiyin', 'expenses_tiyin', 'closed_by_user_id', 'reopened_by_user_id'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('finance.accounting_period');
    }
}
