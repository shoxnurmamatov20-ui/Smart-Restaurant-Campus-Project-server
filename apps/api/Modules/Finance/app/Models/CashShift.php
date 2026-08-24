<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Counters\BranchCounters;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Finance\Database\Factories\CashShiftFactory;
use Modules\Finance\Services\ShiftCloser;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A cashier's session at the till, from opening float to Z-report.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $number
 * @property int|null $opened_by_user_id
 * @property int|null $closed_by_user_id Who counted — not always who opened
 * @property int|null $approved_by_user_id The manager who signed for a difference
 * @property Carbon $opened_at
 * @property Carbon|null $closed_at
 * @property Carbon|null $locked_at When counting began and the drawer stopped selling
 * @property int $opening_cash Amount in tiyin (1 UZS = 100 tiyin)
 * @property int $expected_cash Opening float + cash payments − payouts
 * @property int $counted_cash What the cashier actually counted
 * @property int $difference counted − expected; negative means short
 * @property string|null $difference_reason Why the drawer did not agree
 * @property int|null $handed_over_to_shift_id The shift that took the drawer over
 * @property array<string, mixed>|null $z_report The Z as it was printed — never recomputed
 * @property string $status open|counting|closed
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property int|null $branch_id
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read User|null $approvedBy
 * @property-read Branch|null $branch
 * @property-read Collection<int, CashCount> $cashCounts
 * @property-read int|null $cash_counts_count
 * @property-read Collection<int, CashMovement> $cashMovements
 * @property-read int|null $cash_movements_count
 * @property-read User|null $closedBy
 * @property-read Collection<int, Expense> $expenses
 * @property-read int|null $expenses_count
 * @property-read CashShift|null $handedOverTo
 * @property-read bool $is_locked
 * @property-read bool $is_open
 * @property-read User|null $openedBy
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
 * @method static Builder<static>|CashShift unclosed()
 * @method static Builder<static>|CashShift whereApprovedByUserId($value)
 * @method static Builder<static>|CashShift whereBranchId($value)
 * @method static Builder<static>|CashShift whereClosedAt($value)
 * @method static Builder<static>|CashShift whereClosedByUserId($value)
 * @method static Builder<static>|CashShift whereDifferenceReason($value)
 * @method static Builder<static>|CashShift whereHandedOverToShiftId($value)
 * @method static Builder<static>|CashShift whereLockedAt($value)
 * @method static Builder<static>|CashShift whereZReport($value)
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

    /**
     * Three states, and the middle one is the whole of the shift lock.
     *
     * `counting` is a drawer that has stopped selling and has not yet been
     * closed. Counting a till that is still taking money produces a difference
     * that grows while you count it, and the person counting is the one who gets
     * asked about it — so the count begins by shutting the door.
     *
     * It costs nothing to enforce: every guard in this module already reads
     * `status !== 'open'`, so a counting shift refuses a payment and a payout for
     * free. What it does NOT do for free is the "do you already have a shift"
     * check, which read `open()` and would happily hand a cashier a second
     * drawer while the first one was being counted. That is what `unclosed()`
     * below is for.
     */
    public const STATUSES = ['open', 'counting', 'closed'];

    protected $fillable = [
        'tenant_id',
        'number',
        'opened_by_user_id',
        'closed_by_user_id',
        'approved_by_user_id',
        'opened_at',
        'closed_at',
        'locked_at',
        'opening_cash',
        'expected_cash',
        'counted_cash',
        'difference',
        'difference_reason',
        'handed_over_to_shift_id',
        'z_report',
        'status',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'opened_at' => 'datetime',
            'closed_at' => 'datetime',
            'locked_at' => 'datetime',
            'opening_cash' => 'integer',
            'expected_cash' => 'integer',
            'counted_cash' => 'integer',
            'difference' => 'integer',
            // The Z as it was printed. Stored rather than recomputed — see
            // ShiftReporter, and the migration that added the column.
            'z_report' => 'array',
        ];
    }

    protected static function newFactory(): CashShiftFactory
    {
        return CashShiftFactory::new();
    }

    // ============ Relationships ============

    /** @return HasMany<Payment, $this> */
    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    /** @return HasMany<Expense, $this> */
    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class);
    }

    /**
     * Every time this drawer was counted, note by note.
     *
     * @return HasMany<CashCount, $this>
     */
    public function cashCounts(): HasMany
    {
        return $this->hasMany(CashCount::class);
    }

    /**
     * Notes put into the drawer that nobody bought anything with.
     *
     * @return HasMany<CashMovement, $this>
     */
    public function cashMovements(): HasMany
    {
        return $this->hasMany(CashMovement::class);
    }

    /** @return BelongsTo<User, $this> */
    public function openedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opened_by_user_id');
    }

    /** @return BelongsTo<User, $this> */
    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by_user_id');
    }

    /** @return BelongsTo<User, $this> */
    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    /**
     * The shift that took this drawer over, notes and all.
     *
     * @return BelongsTo<self, $this>
     */
    public function handedOverTo(): BelongsTo
    {
        return $this->belongsTo(self::class, 'handed_over_to_shift_id');
    }

    // ============ Accessors ============

    protected function isOpen(): Attribute
    {
        return Attribute::get(fn (): bool => $this->status === 'open');
    }

    /** Counting has begun: the drawer takes no more money until it closes. */
    protected function isLocked(): Attribute
    {
        return Attribute::get(fn (): bool => $this->status === 'counting');
    }

    /** Everything taken this session, by any method. */
    protected function totalTakings(): Attribute
    {
        return Attribute::get(fn (): int => (int) $this->payments()
            ->where('status', 'captured')->sum('amount'));
    }

    // ============ Domain behaviour ============

    /**
     * What should be in the drawer right now.
     *
     * **One formula, one place.** It used to be written twice — here and in
     * EloquentTillLedger::totalsFor(), under a comment in the second one claiming
     * there was only one — and the two agreed only because they were both simple.
     * The moment tips and cash rounding entered the calculation they diverged, and
     * the failure mode is the worst kind this module has: the X-report a cashier
     * reads mid-shift and the Z-report that closes it would name different
     * figures, and the difference would be blamed on the person counting.
     *
     * Four terms, and each one is in or out for a reason:
     *
     *   `opening_cash`  the float counted in at the start.
     *   cash payments   what guests handed over in notes.
     *   `rounding`      DECISIONS Q7. Only cash is rounded, so the whole signed
     *                   total is a drawer movement — a bill rounded up put extra
     *                   notes in, one rounded down took them out.
     *   cash tips       DECISIONS Q6. A tip left in notes is in the drawer. One
     *                   left on a card is in the bank, which is why this is the
     *                   cash share and not the whole of `tips` — counting all of
     *                   them would report a surplus every single night.
     *   brought in      Notes somebody PUT IN that nobody bought anything with:
     *                   change fetched from the safe, a miscount corrected. This
     *                   term was missing, and every one of those came back at
     *                   closing as a drawer mysteriously over — which reads as a
     *                   cashier who cannot count, or worse, as one holding back
     *                   the difference for later.
     *
     * Card, Click, Payme and corporate takings are absent on purpose: none of them
     * passes through the box. Acquirer fees are absent too — the guest paid in
     * full and the bank deducts later, from an account, not from this drawer.
     *
     * A refund is absent from the list and belongs there anyway: reversing a cash
     * payment drops it out of `cash_in` above, because that sum counts captured
     * rows only. Nothing else is needed and adding an explicit payout for it would
     * subtract the money twice — see EloquentTillLedger::refund(), where the same
     * fact is what makes a cross-shift refund a separate case rather than the same
     * one.
     */
    public function computeExpectedCash(): int
    {
        $terms = $this->expectedCashTerms();

        return $terms['opening']
            + $terms['cash_in']
            + $terms['rounding']
            + $terms['cash_tips']
            + $terms['brought_in']
            - $terms['cash_out'];
    }

    /**
     * The same terms, named, for a report that has to show its working.
     *
     * `computeExpectedCash()` adds these up and nothing else does, so the Z-report
     * cannot print one set of components beside a total derived from another. That
     * sounds like a small thing and is not: "expected 900 000" with no working is
     * a figure a cashier can only accept or dispute, and the whole reason the
     * sections exist is so a gap has somewhere to be looked up.
     *
     * @return array{opening: int, cash_in: int, rounding: int, cash_tips: int, brought_in: int, cash_out: int}
     */
    public function expectedCashTerms(): array
    {
        $cash = $this->payments()->where('status', 'captured');

        return [
            'opening' => (int) $this->opening_cash,
            'cash_in' => (int) (clone $cash)->where('method', 'cash')->sum('amount'),
            'rounding' => (int) (clone $cash)->sum('rounding'),
            'cash_tips' => (int) (clone $cash)->where('method', 'cash')->sum('tip'),
            'brought_in' => (int) $this->cashMovements()->where('direction', 'in')->sum('amount'),
            'cash_out' => (int) $this->expenses()->where('paid_in_cash', true)->sum('amount'),
        ];
    }

    /**
     * The next Z number for this restaurant.
     *
     * Through the shared counter, not `max(id) + 1`, and the difference is not
     * theoretical: two tills closing at the same moment both read the same
     * maximum and both build the same string, and the second one dies on the
     * unique index — at the worst possible moment, with a counted drawer in front
     * of somebody. {@see BranchCounters} does it in one atomic round trip.
     *
     * It was written twice, here and in the controller, and the two disagreed
     * about both the source and the format: one counted rows, one took the
     * largest id, one padded to four digits and the other to five. Which Z number
     * a shift got depended on which door it came in through.
     */
    public static function nextNumber(): string
    {
        return sprintf('Z-%05d', app(BranchCounters::class)->next('zreport.number'));
    }

    /**
     * Stop selling so the drawer can be counted.
     *
     * The reason this exists as a state rather than a convention: a till counted
     * while it is still taking money has a difference that grows while you count
     * it, and the person holding the notes is the one who has to explain it. From
     * here every existing guard in the module refuses — they all read
     * `status !== 'open'` — so no payment, payout or refund lands in a drawer
     * somebody is halfway through counting.
     */
    public function lock(): bool
    {
        if ($this->status !== 'open') {
            return false;
        }

        return $this->update(['status' => 'counting', 'locked_at' => now()]);
    }

    /**
     * Put a locked drawer back to work.
     *
     * A cashier who locks the till by accident with a queue at the counter has to
     * have a way back, or the answer to a mis-tap is "close the shift and open a
     * new one" — which is a Z-report nobody wanted and a float counted twice. It
     * is a manager's key, not the cashier's: see the route.
     */
    public function unlock(): bool
    {
        if ($this->status !== 'counting') {
            return false;
        }

        return $this->update(['status' => 'open', 'locked_at' => null]);
    }

    /**
     * Close the till and compute the Z-report.
     *
     * The expected cash is derived, never sent by the client: the whole point of
     * the count is to compare the drawer against what the system says should be
     * in it.
     *
     * Everything past `$note` is the record of *how* it was closed, and it is
     * stored rather than reconstructed because every one of these is a question
     * somebody asks the next morning. Who counted — not always who opened, once a
     * shift can be handed over. Who authorised the gap. What the gap was blamed
     * on. A difference with no reason beside it is the record an investigation
     * cannot use, and the reason lives in its own column rather than inside the
     * free-text note so that "every unexplained till this month" is a query
     * rather than a reading exercise.
     *
     * The policy that decides *whether* those are required is not here — it is in
     * {@see ShiftCloser}, because it needs to refuse
     * before anything is written, and a model method that returned false for six
     * different reasons would tell the cashier none of them.
     */
    public function close(
        int $countedCash,
        ?string $note = null,
        ?int $closedByUserId = null,
        ?int $approvedByUserId = null,
        ?string $differenceReason = null,
    ): bool {
        if ($this->status === 'closed') {
            return false;
        }

        $expected = $this->computeExpectedCash();

        return $this->update([
            'status' => 'closed',
            'closed_at' => now(),
            'expected_cash' => $expected,
            'counted_cash' => $countedCash,
            'difference' => $countedCash - $expected,
            'difference_reason' => $differenceReason,
            'closed_by_user_id' => $closedByUserId ?? $this->closed_by_user_id,
            'approved_by_user_id' => $approvedByUserId,
            'note' => $note ?? $this->note,
        ]);
    }

    // ============ Scopes ============

    /** Open for business: selling, taking payments, paying out. */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('status', 'open');
    }

    /**
     * Not finished with — open OR being counted.
     *
     * The distinction that matters for "does this cashier already have a till".
     * That check read `open()`, so the moment `counting` existed a cashier could
     * be handed a second drawer while the first one was still being counted, and
     * every sale after it would land in whichever of the two the session happened
     * to be holding. `open()` is right for "may I take money"; this one is right
     * for "am I already standing at a till".
     */
    public function scopeUnclosed(Builder $query): Builder
    {
        return $query->whereIn('status', ['open', 'counting']);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly([
                'tenant_id', 'number', 'opened_at', 'closed_at', 'locked_at',
                'expected_cash', 'counted_cash', 'difference', 'difference_reason',
                'closed_by_user_id', 'approved_by_user_id', 'status',
            ])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('finance.cash_shift');
    }
}
