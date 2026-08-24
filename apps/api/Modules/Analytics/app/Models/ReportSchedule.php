<?php

declare(strict_types=1);

namespace Modules\Analytics\Models;

use App\Models\Branch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A report that arrives without anybody asking for it.
 *
 * Deliberately NOT `BelongsToBranch`, even though `branch_id` is on the row.
 * The trait means "no branch in context is every branch", which would show a
 * manager scoped to Chilonzor every schedule on the platform's other venues the
 * moment they cleared the switcher. Here the column is the schedule's SUBJECT
 * rather than its location — what the report is about, not where it was written
 * — and the console filters on it explicitly.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property int|null $created_by
 * @property string $kind
 * @property string $period
 * @property string $frequency
 * @property array<int, array{channel: string, target: string}> $destinations
 * @property array<string, mixed>|null $definition
 * @property bool $is_active
 * @property Carbon $next_run_at
 * @property Carbon|null $last_run_at
 * @property string|null $last_status
 * @property string|null $last_error
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Branch|null $branch
 * @property-read User|null $author
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|ReportSchedule due()
 * @method static Builder<static>|ReportSchedule newModelQuery()
 * @method static Builder<static>|ReportSchedule newQuery()
 * @method static Builder<static>|ReportSchedule query()
 *
 * @mixin \Eloquent
 */
final class ReportSchedule extends Model
{
    use BelongsToTenant;

    protected $table = 'analytics.report_schedules';

    public const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarter'];

    public const CHANNELS = ['mail', 'telegram'];

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'created_by',
        'kind',
        'period',
        'frequency',
        'destinations',
        'definition',
        'is_active',
        'next_run_at',
        'last_run_at',
        'last_status',
        'last_error',
    ];

    protected function casts(): array
    {
        return [
            'destinations' => 'array',
            'definition' => 'array',
            'is_active' => 'boolean',
            'next_run_at' => 'datetime',
            'last_run_at' => 'datetime',
        ];
    }

    // ============ Relationships ============

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ============ Domain behaviour ============

    /**
     * When a schedule of this frequency next fires, counted from `$after`.
     *
     * The four slots are the console's own, down to the minute
     * (`reports-data.ts`): daily at 06:30 once the trading day has closed,
     * weekly on Monday at 08:00, monthly on the 1st at 09:00, quarterly on the
     * first day of the next quarter.
     *
     * Counted from "now" rather than from the last slot, and that is the
     * behaviour a person expects: a schedule switched off for a month resumes
     * at its next slot instead of firing thirty times to catch up on figures
     * nobody wanted a month ago.
     */
    public static function slotAfter(string $frequency, ?CarbonImmutable $after = null): CarbonImmutable
    {
        $after ??= CarbonImmutable::now();

        return match ($frequency) {
            'weekly' => $after->next('monday')->setTime(8, 0),
            'monthly' => $after->addMonthNoOverflow()->startOfMonth()->setTime(9, 0),
            'quarter' => $after->addQuarterNoOverflow()->firstOfQuarter()->setTime(9, 0),
            // 06:30 today if the day has not reached it yet, otherwise tomorrow.
            // A schedule created at 05:00 should fire this morning, not in
            // twenty-nine hours.
            default => $after->hour < 6 || ($after->hour === 6 && $after->minute < 30)
                ? $after->setTime(6, 30)
                : $after->addDay()->setTime(6, 30),
        };
    }

    /** Move the schedule on, whatever the outcome was. */
    public function markRun(string $status, ?string $error = null): void
    {
        $this->forceFill([
            'last_run_at' => now(),
            'last_status' => $status,
            'last_error' => $error === null ? null : mb_substr($error, 0, 255),
            // Advanced even on a failure. A schedule that retried on the next
            // tick would send a fortnight of hourly attempts at a chat that has
            // blocked the bot; `last_status` is how anybody sees it stopped.
            'next_run_at' => self::slotAfter($this->frequency),
        ])->save();
    }

    // ============ Scopes ============

    /**
     * @param  Builder<ReportSchedule>  $query
     * @return Builder<ReportSchedule>
     */
    public function scopeDue(Builder $query): Builder
    {
        return $query->where('is_active', true)->where('next_run_at', '<=', now());
    }
}
