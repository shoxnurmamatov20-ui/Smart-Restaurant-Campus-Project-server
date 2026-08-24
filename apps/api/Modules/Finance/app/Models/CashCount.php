<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasBusinessDate;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Modules\Finance\Database\Factories\CashCountFactory;
use Modules\Finance\Support\CashDenominations;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One drawer, counted note by note, by a named person, at a named moment.
 *
 * The `total` is written from the breakdown and never from the client. That is
 * the entire reason this row exists: a drawer typed as a total is a number
 * anybody can produce without opening it, and the same number is what every
 * Z-report is reconciled against.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property int $cash_shift_id
 * @property Carbon|null $business_date
 * @property string $kind One of self::KINDS
 * @property array<int, int> $breakdown Denomination in tiyin => how many notes
 * @property int $total Tiyin, derived from the breakdown at write time
 * @property int|null $counted_by_user_id
 * @property int|null $witnessed_by_user_id
 * @property string|null $note
 * @property Carbon $counted_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $branch
 * @property-read CashShift $cashShift
 * @property-read User|null $countedBy
 * @property-read int $note_count
 * @property-read Tenant|null $tenant
 * @property-read User|null $witnessedBy
 *
 * @method static \Modules\Finance\Database\Factories\CashCountFactory factory($count = null, $state = [])
 * @method static Builder<static>|CashCount forBusinessDate(string $date)
 * @method static Builder<static>|CashCount forCurrentBusinessDate()
 * @method static Builder<static>|CashCount newModelQuery()
 * @method static Builder<static>|CashCount newQuery()
 * @method static Builder<static>|CashCount ofKind(string $kind)
 * @method static Builder<static>|CashCount query()
 * @method static Builder<static>|CashCount whereBranchId($value)
 * @method static Builder<static>|CashCount whereBreakdown($value)
 * @method static Builder<static>|CashCount whereBusinessDate($value)
 * @method static Builder<static>|CashCount whereCashShiftId($value)
 * @method static Builder<static>|CashCount whereCountedAt($value)
 * @method static Builder<static>|CashCount whereCountedByUserId($value)
 * @method static Builder<static>|CashCount whereCreatedAt($value)
 * @method static Builder<static>|CashCount whereId($value)
 * @method static Builder<static>|CashCount whereKind($value)
 * @method static Builder<static>|CashCount whereNote($value)
 * @method static Builder<static>|CashCount whereTenantId($value)
 * @method static Builder<static>|CashCount whereTotal($value)
 * @method static Builder<static>|CashCount whereUpdatedAt($value)
 * @method static Builder<static>|CashCount whereWitnessedByUserId($value)
 *
 * @mixin \Eloquent
 */
final class CashCount extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;
    use HasBusinessDate;

    /** @use HasFactory<CashCountFactory> */
    use HasFactory;

    use LogsActivity;

    protected $table = 'finance.cash_counts';

    /**
     * Why the drawer was open.
     *
     * `open` and `close` bracket a shift. `handover` is a close that leaves the
     * notes where they are for the next person. `collection` is the takings
     * going to the safe mid-service — counted, because money that leaves
     * uncounted is money nobody can be held to afterwards. `top_up` is the
     * opposite movement — change brought from the safe when the drawer runs
     * out of small notes — and was being written without appearing here, so a
     * report that filtered by known kinds simply never saw it. `x` is a spot
     * check that decides nothing, which is the point of it.
     */
    public const KINDS = ['open', 'close', 'handover', 'collection', 'top_up', 'x'];

    /** The trading day for this row is taken from when the notes were counted. */
    protected static function businessDateSource(): string
    {
        return 'counted_at';
    }

    protected $fillable = [
        'business_date',
        'tenant_id',
        'branch_id',
        'cash_shift_id',
        'kind',
        'breakdown',
        'total',
        'counted_by_user_id',
        'witnessed_by_user_id',
        'note',
        'counted_at',
    ];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'counted_at' => 'datetime',
            'breakdown' => 'array',
            // Postgres hands bigint back as a string through PDO, and a string
            // in a money path is one implicit cast away from being a float.
            'total' => 'integer',
            'counted_by_user_id' => 'integer',
            'witnessed_by_user_id' => 'integer',
        ];
    }

    protected static function newFactory(): CashCountFactory
    {
        return CashCountFactory::new();
    }

    // ============ Relationships ============

    /** @return BelongsTo<CashShift, $this> */
    public function cashShift(): BelongsTo
    {
        return $this->belongsTo(CashShift::class);
    }

    /** @return BelongsTo<User, $this> */
    public function countedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'counted_by_user_id');
    }

    /** @return BelongsTo<User, $this> */
    public function witnessedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'witnessed_by_user_id');
    }

    // ============ Accessors ============

    /**
     * How many notes were handled.
     *
     * Printed on the Z beside the total because it is the one figure that says
     * whether a count was plausible: 900 000 so'm in four notes is a different
     * evening from 900 000 in three hundred, and a drawer that reports the
     * former after a busy Saturday was not counted.
     */
    public function getNoteCountAttribute(): int
    {
        return array_sum(array_map('intval', $this->breakdown ?? []));
    }

    // ============ Scopes ============

    public function scopeOfKind(Builder $query, string $kind): Builder
    {
        return $query->where('kind', $kind);
    }

    // ============ Domain behaviour ============

    /**
     * Record a count. The total comes from the notes, never from the caller.
     *
     * @param  array<array-key, int|string>  $breakdown  Denomination in tiyin => how many.
     */
    public static function record(
        CashShift $shift,
        string $kind,
        array $breakdown,
        ?int $countedByUserId = null,
        ?int $witnessedByUserId = null,
        ?string $note = null,
    ): self {
        $clean = CashDenominations::normalise($breakdown);

        return self::create([
            'branch_id' => $shift->branch_id,
            'cash_shift_id' => $shift->getKey(),
            'kind' => $kind,
            'breakdown' => $clean,
            'total' => CashDenominations::total($clean),
            'counted_by_user_id' => $countedByUserId,
            'witnessed_by_user_id' => $witnessedByUserId,
            'note' => $note,
            'counted_at' => now(),
        ]);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'cash_shift_id', 'kind', 'total', 'counted_by_user_id', 'witnessed_by_user_id'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('finance.cash_count');
    }
}
