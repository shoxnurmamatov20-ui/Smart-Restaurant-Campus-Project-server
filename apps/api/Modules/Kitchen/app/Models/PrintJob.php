<?php

declare(strict_types=1);

namespace Modules\Kitchen\Models;

use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Modules\Kitchen\Database\Factories\PrintJobFactory;

/**
 * One document owed to one printer.
 *
 * No soft deletes and no activity log, and both are deliberate. This is a spool,
 * not a ledger: the audit trail for what a guest was charged lives on the
 * payment and the audit trail for what a kitchen was asked to cook lives on the
 * ticket. What is here is a piece of paper that has or has not come out yet, and
 * a week of them is tens of thousands of rows nobody will ever read.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property int $printer_id
 * @property string $kind docket | receipt | drawer | test
 * @property string|null $reference
 * @property string|null $title
 * @property array<array-key, mixed> $document
 * @property int $copies
 * @property string $status queued | claimed | printed | failed
 * @property int $attempts
 * @property Carbon $available_at
 * @property Carbon|null $claimed_at
 * @property string|null $claimed_by
 * @property Carbon|null $printed_at
 * @property string|null $last_error
 * @property string|null $fingerprint
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Branch|null $branch
 * @property-read Printer $printer
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|PrintJob due()
 * @method static \Modules\Kitchen\Database\Factories\PrintJobFactory factory($count = null, $state = [])
 * @method static Builder<static>|PrintJob newModelQuery()
 * @method static Builder<static>|PrintJob newQuery()
 * @method static Builder<static>|PrintJob outstanding()
 * @method static Builder<static>|PrintJob query()
 * @method static Builder<static>|PrintJob whereAttempts($value)
 * @method static Builder<static>|PrintJob whereAvailableAt($value)
 * @method static Builder<static>|PrintJob whereBranchId($value)
 * @method static Builder<static>|PrintJob whereClaimedAt($value)
 * @method static Builder<static>|PrintJob whereClaimedBy($value)
 * @method static Builder<static>|PrintJob whereCopies($value)
 * @method static Builder<static>|PrintJob whereCreatedAt($value)
 * @method static Builder<static>|PrintJob whereDocument($value)
 * @method static Builder<static>|PrintJob whereFingerprint($value)
 * @method static Builder<static>|PrintJob whereId($value)
 * @method static Builder<static>|PrintJob whereKind($value)
 * @method static Builder<static>|PrintJob whereLastError($value)
 * @method static Builder<static>|PrintJob wherePrintedAt($value)
 * @method static Builder<static>|PrintJob wherePrinterId($value)
 * @method static Builder<static>|PrintJob whereReference($value)
 * @method static Builder<static>|PrintJob whereStatus($value)
 * @method static Builder<static>|PrintJob whereTenantId($value)
 * @method static Builder<static>|PrintJob whereTitle($value)
 * @method static Builder<static>|PrintJob whereUpdatedAt($value)
 *
 * @mixin \Eloquent
 */
final class PrintJob extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<PrintJobFactory> */
    use HasFactory;

    public const KINDS = ['docket', 'receipt', 'drawer', 'test'];

    public const STATUSES = ['queued', 'claimed', 'printed', 'failed'];

    protected $table = 'kitchen.print_jobs';

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'printer_id',
        'kind',
        'reference',
        'title',
        'document',
        'copies',
        'status',
        'attempts',
        'available_at',
        'fingerprint',
    ];

    protected function casts(): array
    {
        return [
            'document' => 'array',
            'copies' => 'integer',
            'attempts' => 'integer',
            'available_at' => 'datetime',
            'claimed_at' => 'datetime',
            'printed_at' => 'datetime',
        ];
    }

    protected static function newFactory(): PrintJobFactory
    {
        return PrintJobFactory::new();
    }

    // ============ Relationships ============

    /** @return BelongsTo<Printer, $this> */
    public function printer(): BelongsTo
    {
        return $this->belongsTo(Printer::class);
    }

    // ============ Outcomes ============

    /**
     * It came out of the printer.
     *
     * `forceFill` rather than `update`, here and in the two below. Outcome
     * columns are deliberately absent from `$fillable` — nothing should be able
     * to mark a job printed by posting a field — and `update()` answers *true*
     * while silently dropping everything mass assignment refuses. The queue said
     * a job was acknowledged and the row never moved.
     */
    public function succeeded(): bool
    {
        return $this->forceFill([
            'status' => 'printed',
            'printed_at' => now(),
            'last_error' => null,
        ])->save();
    }

    /**
     * It did not, and this is where a spool earns its keep.
     *
     * The job goes back to `queued` with a later due time rather than being
     * thrown away, so an agent that comes back in ten minutes prints a docket
     * that is ten minutes late instead of a table that never got fed. Only when
     * the attempts run out does it become `failed` — and even then the row
     * stays, because "what did not print tonight" is the first question after
     * a bad service.
     */
    public function failed(string $error): bool
    {
        $attempts = $this->attempts + 1;
        $exhausted = $attempts >= self::maxAttempts();

        return $this->forceFill([
            'status' => $exhausted ? 'failed' : 'queued',
            'attempts' => $attempts,
            'available_at' => $exhausted ? $this->available_at : now()->addSeconds(self::backoffFor($attempts)),
            'claimed_at' => null,
            'claimed_by' => null,
            'last_error' => mb_substr($error, 0, 255),
        ])->save();
    }

    /** Put a given-up job back at the front of the queue — a human said try again. */
    public function requeue(): bool
    {
        return $this->forceFill([
            'status' => 'queued',
            'attempts' => 0,
            'available_at' => now(),
            'claimed_at' => null,
            'claimed_by' => null,
            'last_error' => null,
        ])->save();
    }

    // ============ Scopes ============

    /**
     * Everything a printer still owes: waiting, or in somebody's hands.
     *
     * @param Builder<PrintJob> $query
     *
     * @return Builder<PrintJob>
     */
    public function scopeOutstanding(Builder $query): Builder
    {
        return $query->whereIn('status', ['queued', 'claimed']);
    }

    /**
     * What an agent may take right now.
     *
     * Two cases, and the second is the one that matters: a job whose agent
     * claimed it and then died. Without the claim expiry that job sits in
     * `claimed` forever and the docket never prints, which is the same outcome
     * as having no spool at all — just slower to notice.
     *
     * @param Builder<PrintJob> $query
     *
     * @return Builder<PrintJob>
     */
    public function scopeDue(Builder $query): Builder
    {
        $now = now();
        $stale = $now->copy()->subSeconds(self::claimSeconds());

        return $query->where(function (Builder $q) use ($now, $stale): void {
            $q->where(function (Builder $fresh) use ($now): void {
                $fresh->where('status', 'queued')->where('available_at', '<=', $now);
            })->orWhere(function (Builder $abandoned) use ($stale): void {
                $abandoned->where('status', 'claimed')->where('claimed_at', '<=', $stale);
            });
        });
    }

    // ============ Settings ============

    public static function maxAttempts(): int
    {
        return max(1, (int) config('kitchen.printing.max_attempts', 8));
    }

    public static function claimSeconds(): int
    {
        return max(5, (int) config('kitchen.printing.claim_seconds', 60));
    }

    /**
     * Seconds to wait before the next attempt.
     *
     * Backs off fast at first and then stops growing: a printer out of paper is
     * fixed in under a minute and the docket should follow immediately, but a
     * printer that has been off for an hour must not be hammered once a second
     * by every agent on the estate.
     */
    public static function backoffFor(int $attempt): int
    {
        /** @var array<int, int> $ladder */
        $ladder = config('kitchen.printing.backoff', [5, 10, 30, 60, 120, 300]);
        $ladder = array_values($ladder);

        if ($ladder === []) {
            return 30;
        }

        return (int) ($ladder[min($attempt, count($ladder)) - 1] ?? end($ladder));
    }
}
