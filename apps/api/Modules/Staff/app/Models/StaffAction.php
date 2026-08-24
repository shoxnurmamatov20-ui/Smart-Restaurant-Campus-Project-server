<?php

declare(strict_types=1);

namespace Modules\Staff\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasBusinessDate;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One thing a phone did, and what became of it.
 *
 * Append-only, so no soft deletes: a journal that can be deleted from is not a
 * journal. Every entry drained out of the staff app's offline queue lands here,
 * whether or not it also landed somewhere that means something — see the
 * migration for why refusing the homeless kinds would be the wrong answer.
 *
 * There is no factory. Rows are written by `StaffActionController` and by
 * nothing else, and a factory would be a second way to produce them that does
 * not run `IdempotentActions` — which is the whole value of the table.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property Carbon|null $business_date
 * @property int|null $branch_id
 * @property int $user_id
 * @property int|null $staff_member_id
 * @property string $local_id
 * @property string $kind
 * @property array<string, mixed> $payload
 * @property string $status applied | rejected
 * @property string|null $reason
 * @property string|null $applied_to
 * @property Carbon $happened_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read User|null $user
 * @property-read StaffMember|null $member
 *
 * @method static Builder<static>|StaffAction applied()
 * @method static Builder<static>|StaffAction newModelQuery()
 * @method static Builder<static>|StaffAction newQuery()
 * @method static Builder<static>|StaffAction ofKind(string $kind)
 * @method static Builder<static>|StaffAction query()
 *
 * @mixin \Eloquent
 */
final class StaffAction extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;
    use HasBusinessDate;
    use LogsActivity;

    protected $table = 'staff.actions';

    /**
     * What a phone can queue.
     *
     * Eight of these land somewhere outside this journal — attendance, the
     * shelf, the room, a supplier's debt, a rider's drop — and two are the
     * journal itself; see `JOURNAL_ONLY_KINDS` for why those two have nowhere
     * else to be. Which contract carries which is written down in
     * `StaffActionController`, not here, because it is a fact about which
     * modules exist rather than about what a waiter can do.
     */
    public const KINDS = [
        'clock_in',
        'clock_out',
        'table_claim',
        'call_resolve',
        'count_submit',
        'receive_confirm',
        'waste_log',
        'delivery_status',
        'cash_handover',
        'checklist_tick',
    ];

    /**
     * The two verbs whose whole product is the journal row.
     *
     * Every other kind goes somewhere that means something — the shelf, the
     * room, the supplier's debt — and the row here is the receipt. These two
     * have nowhere else to be, and that is the design rather than a gap:
     *
     * - `cash_handover` is a courier *declaring* the notes in their pocket. The
     *   money moves when a cashier counts it into a drawer against their own
     *   open till shift (`POST /pos/drawer/movements`, `pos.drawer`). Handing a
     *   rider that permission so a button could post would let the one person
     *   who is never in the building declare cash into a till nobody counted —
     *   which is exactly the reconciliation the declaration exists to enable.
     *   So the rider's word and the cashier's count are two records, and the
     *   gap between them is the finding.
     *
     * - `checklist_tick` is somebody saying they checked the fridges. There is
     *   no fridge table and there should not be one; what matters is who said
     *   it and when, which is what an append-only journal is.
     *
     * Kept as a named list rather than as a comment because
     * `StaffActionController` and `ChecklistController` both have to agree
     * about which kinds they own.
     */
    public const JOURNAL_ONLY_KINDS = [
        'cash_handover',
        'checklist_tick',
    ];

    /**
     * The run-throughs a phone can tick off.
     *
     * `closing` is the manager's five steps before they walk to the till,
     * `endshift` is the courier's four conditions, and `opening` is the morning
     * list the console's rota screen draws. One word per list because a tick is
     * stored as `{list}` plus `{step}` and a free-text list name would make two
     * spellings of the same run-through look like two different ones a month
     * later.
     */
    public const CHECKLISTS = ['opening', 'closing', 'endshift'];

    public const APPLIED = 'applied';

    public const REJECTED = 'rejected';

    /** The trading day comes from when the person acted, not when we heard. */
    protected static function businessDateSource(): string
    {
        return 'happened_at';
    }

    protected $fillable = [
        'tenant_id',
        'business_date',
        'branch_id',
        'user_id',
        'staff_member_id',
        'local_id',
        'kind',
        'payload',
        'status',
        'reason',
        'applied_to',
        'happened_at',
    ];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'happened_at' => 'datetime',
            'payload' => 'array',
        ];
    }

    // ============ Relationships ============

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(StaffMember::class, 'staff_member_id');
    }

    // ============ Scopes ============

    public function scopeApplied(Builder $query): Builder
    {
        return $query->where('status', self::APPLIED);
    }

    public function scopeOfKind(Builder $query, string $kind): Builder
    {
        return $query->where('kind', $kind);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'user_id', 'kind', 'status', 'reason', 'applied_to'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('staff.action');
    }
}
