<?php

declare(strict_types=1);

namespace Modules\Finance\Services;

use App\Models\User;
use App\Support\Errors\ApiException;
use App\Support\Events\EventBus;
use Illuminate\Support\Facades\DB;
use Modules\Finance\Events\ShiftClosed;
use Modules\Finance\Events\ShiftVarianceFlagged;
use Modules\Finance\Models\CashCount;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Support\CashDenominations;
use Modules\Finance\Support\VariancePolicy;
use Modules\Finance\Support\VarianceVerdict;

/**
 * Closing a day, in the order it actually happens.
 *
 *   1. The drawer stops selling.       `lock()`
 *   2. Somebody counts it, by note.    the breakdown
 *   3. The gap is judged.              VariancePolicy
 *   4. It closes, and the Z is frozen. `close()`
 *
 * Each step exists because of the one before it. Counting a till that is still
 * taking money gives a figure that is stale before it is finished, and the person
 * holding the notes is the one asked to explain it. A total typed instead of
 * counted is a number anybody can produce without opening the drawer. A gap
 * accepted without a reason is a record no investigation can use, and one
 * authorised by the person who caused it is not an authorisation.
 *
 * ---------------------------------------------------------------------------
 * Where the manager's PIN is, and why it is not here
 *
 * Finance owns the *policy* — how large a gap may be before somebody else has to
 * sign for it — and the *record* of who signed. It does not own the PIN pad: PINs
 * live in the POS module and Finance may not read them, which is the module
 * boundary doing its job rather than an omission.
 *
 * So the till authenticates the manager and sends who it was, and Finance checks
 * that person independently: they must exist, belong to this restaurant, hold
 * `finance.manage` — which a cashier does not and a manager, owner and accountant
 * do — and not be the person closing the till. A POS that sent an arbitrary user
 * id gets nowhere, which is the point of checking it twice.
 */
final class ShiftCloser
{
    public function __construct(
        private readonly ShiftReporter $reporter,
        private readonly VariancePolicy $policy,
        private readonly EventBus $events,
    ) {}

    /**
     * Stop the drawer selling so it can be counted.
     */
    public function lock(CashShift $shift): CashShift
    {
        if ($shift->status === 'closed') {
            throw ApiException::of('finance.shift_already_closed', meta: ['shift_id' => $shift->getKey()]);
        }

        $shift->lock();

        return $shift->refresh();
    }

    /**
     * Put a locked drawer back to work. A manager's key — see the route.
     */
    public function unlock(CashShift $shift): CashShift
    {
        if ($shift->status === 'closed') {
            throw ApiException::of('finance.shift_already_closed', meta: ['shift_id' => $shift->getKey()]);
        }

        $shift->unlock();

        return $shift->refresh();
    }

    /**
     * What tonight's gap will demand, asked before the drawer is counted.
     *
     * The till shows this on the count screen, so a cashier learns that this
     * evening needs the manager while the manager is still on the floor — rather
     * than at midnight, with the notes counted and everybody gone home.
     */
    public function verdictFor(CashShift $shift, int $countedCash): VarianceVerdict
    {
        return $this->policy->verdictFor($countedCash - $shift->computeExpectedCash());
    }

    /**
     * Count the drawer and close the shift.
     *
     * @param array<array-key, int|string> $denominations Note value in tiyin => how many.
     *                                                    The total comes from here when it is given.
     * @param string $kind `close`, or `handover` when the notes stay in the till.
     *
     * @throws ApiException on anything a cashier has to be told rather than have
     *                      silently accepted
     */
    public function close(
        CashShift $shift,
        ?int $countedCash = null,
        array $denominations = [],
        ?string $reason = null,
        ?string $note = null,
        ?int $countedByUserId = null,
        ?int $witnessedByUserId = null,
        ?int $approvedByUserId = null,
        string $kind = 'close',
    ): CashShift {
        if ($shift->status === 'closed') {
            throw ApiException::of('finance.shift_already_closed', meta: ['shift_id' => $shift->getKey()]);
        }

        $counted = $this->countedTotal($countedCash, $denominations);

        return DB::transaction(function () use (
            $shift, $counted, $denominations, $reason, $note,
            $countedByUserId, $witnessedByUserId, $approvedByUserId, $kind,
        ): CashShift {
            /*
             * Take the row, then stop the till, then work out the gap — in that
             * order and inside one transaction.
             *
             * Without the row lock a payment committed between "what should be in
             * the drawer" and "write the difference" moves the first figure after
             * the cashier has been judged against it. It is a narrow window and a
             * till is a single-user device, so it would have gone unnoticed for a
             * long time and then arrived as one inexplicable shift.
             */
            $locked = CashShift::query()->lockForUpdate()->findOrFail($shift->getKey());
            $locked->lock();

            $expected = $locked->computeExpectedCash();
            $verdict = $this->policy->verdictFor($counted - $expected);

            $this->refuseUnlessExplained($verdict, $reason);
            $approver = $this->approverFor($verdict, $locked, $approvedByUserId, $countedByUserId);

            if ($denominations !== []) {
                CashCount::record(
                    shift: $locked,
                    kind: $kind,
                    breakdown: $denominations,
                    countedByUserId: $countedByUserId,
                    witnessedByUserId: $witnessedByUserId,
                    note: $reason,
                );
            }

            $locked->close(
                countedCash: $counted,
                note: $note,
                closedByUserId: $countedByUserId,
                approvedByUserId: $approver?->getKey() === null ? null : (int) $approver->getKey(),
                differenceReason: $reason,
            );

            $locked->refresh();

            /*
             * The Z, written down.
             *
             * After the close and not before: the report reads `expected_cash`,
             * `counted_cash` and `difference` off the row, and those are what
             * `close()` has just written. Frozen here because a Z is a document —
             * it gets two signatures and goes in a folder — and a document that
             * quietly reports different figures next week is not one.
             */
            $locked->forceFill(['z_report' => $this->reporter->report($locked)])->save();

            $this->announce($locked->refresh(), $verdict);

            return $locked;
        });
    }

    /**
     * Hand the till over without emptying it.
     *
     * The drawer is counted, this shift closes against that count, and the next
     * person starts with the same notes as their float. The notes never move,
     * which is the entire point — a handover that made the money leave and come
     * back would be two counts, two chances to be wrong, and a queue at the
     * counter while somebody walks to the safe.
     *
     * The link between the two shifts is stored, so "her float was his closing
     * count" is provable rather than a coincidence of two matching numbers.
     *
     * @param array<array-key, int|string> $denominations
     *
     * @return array{shift: CashShift, next: CashShift}
     */
    public function handOver(
        CashShift $shift,
        int $toUserId,
        ?int $countedCash = null,
        array $denominations = [],
        ?string $reason = null,
        ?string $note = null,
        ?int $countedByUserId = null,
        ?int $witnessedByUserId = null,
        ?int $approvedByUserId = null,
    ): array {
        if (CashShift::query()->unclosed()->where('opened_by_user_id', $toUserId)->exists()) {
            // Two drawers for one person means every sale after the second one
            // lands in whichever the session happens to be holding.
            throw ApiException::of('finance.handover_cashier_busy', field: 'to_user_id', meta: [
                'user_id' => $toUserId,
            ]);
        }

        return DB::transaction(function () use (
            $shift, $toUserId, $countedCash, $denominations, $reason, $note,
            $countedByUserId, $witnessedByUserId, $approvedByUserId,
        ): array {
            $closed = $this->close(
                shift: $shift,
                countedCash: $countedCash,
                denominations: $denominations,
                reason: $reason,
                note: $note,
                countedByUserId: $countedByUserId,
                witnessedByUserId: $witnessedByUserId,
                approvedByUserId: $approvedByUserId,
                kind: 'handover',
            );

            $next = CashShift::create([
                'number' => CashShift::nextNumber(),
                'opened_by_user_id' => $toUserId,
                'opened_at' => now(),
                // The float IS the closing count. Not a figure somebody re-enters:
                // the notes did not move, so a second number here could only ever
                // be a second opinion about the same drawer.
                'opening_cash' => (int) $closed->counted_cash,
                'expected_cash' => 0,
                'counted_cash' => 0,
                'difference' => 0,
                'status' => 'open',
            ]);

            if ($denominations !== []) {
                CashCount::record(
                    shift: $next,
                    kind: 'open',
                    breakdown: $denominations,
                    countedByUserId: $toUserId,
                    witnessedByUserId: $countedByUserId,
                    note: 'Smena topshirildi: '.$closed->number,
                );
            }

            $closed->forceFill(['handed_over_to_shift_id' => $next->getKey()])->save();

            return ['shift' => $closed->refresh(), 'next' => $next->refresh()];
        });
    }

    // ============ Internals ============

    /**
     * What the drawer holds, from the notes when there are notes.
     *
     * When both arrive they have to agree. A client that sends a breakdown and a
     * total which do not add up has either a rounding bug or a person typing over
     * the count, and both are worth a refusal: silently preferring one of them
     * would make the Z depend on which branch of an if-statement ran.
     *
     * @param array<array-key, int|string> $denominations
     */
    private function countedTotal(?int $countedCash, array $denominations): int
    {
        if ($denominations !== []) {
            $fromNotes = CashDenominations::total($denominations);

            if ($countedCash !== null && $countedCash !== $fromNotes) {
                throw ApiException::of('finance.count_mismatch', field: 'counted_cash', meta: [
                    'counted_cash' => $countedCash,
                    'from_denominations' => $fromNotes,
                ]);
            }

            return $fromNotes;
        }

        if ($countedCash === null) {
            throw ApiException::of('finance.count_missing', field: 'counted_cash');
        }

        if ($countedCash < 0) {
            throw ApiException::of('finance.count_negative', field: 'counted_cash', meta: [
                'counted_cash' => $countedCash,
            ]);
        }

        return $countedCash;
    }

    /**
     * A gap with no name is a gap nobody can act on.
     */
    private function refuseUnlessExplained(VarianceVerdict $verdict, ?string $reason): void
    {
        if ($verdict->needsReason && trim((string) $reason) === '') {
            throw ApiException::of('finance.variance_needs_reason', field: 'reason', meta: $verdict->toArray());
        }
    }

    /**
     * The manager who signs for the gap, checked here rather than taken on trust.
     *
     * Four conditions, and the last two are the ones that matter. `finance.manage`
     * is held by the owner, the brand and branch managers and the accountant, and
     * pointedly not by a cashier — so the permission already draws the line the
     * plan asks for without a new one being invented. And an approver who is the
     * person closing the till is not a second pair of eyes; it is the same pair,
     * and allowing it would make the whole rung decorative.
     */
    private function approverFor(
        VarianceVerdict $verdict,
        CashShift $shift,
        ?int $approvedByUserId,
        ?int $countedByUserId,
    ): ?User {
        if (! $verdict->needsApproval) {
            return null;
        }

        if ($approvedByUserId === null) {
            throw ApiException::of('finance.variance_needs_approval', field: 'approved_by_user_id', meta: $verdict->toArray());
        }

        /** @var User|null $approver */
        $approver = User::query()->whereKey($approvedByUserId)->first();

        if ($approver === null || $approver->tenant_id !== $shift->tenant_id) {
            throw ApiException::of('finance.variance_approver_unknown', field: 'approved_by_user_id');
        }

        if ($countedByUserId !== null && (int) $approver->getKey() === $countedByUserId) {
            throw ApiException::of('finance.variance_self_approved', field: 'approved_by_user_id');
        }

        if (! $approver->can('finance.manage')) {
            throw ApiException::of('finance.variance_approver_not_permitted', field: 'approved_by_user_id');
        }

        return $approver;
    }

    /**
     * Tell the rest of the platform, once the row is final.
     *
     * Published rather than notified: Finance does not know whether this owner
     * reads Telegram, email or a dashboard, and must not have to.
     */
    private function announce(CashShift $shift, VarianceVerdict $verdict): void
    {
        $this->events->publish(new ShiftClosed($shift));

        if ($verdict->notifiesOwner) {
            $this->events->publish(new ShiftVarianceFlagged($shift, $verdict));
        }
    }
}
