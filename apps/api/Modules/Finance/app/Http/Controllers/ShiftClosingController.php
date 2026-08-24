<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Errors\ErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Finance\Http\Requests\CloseShiftRequest;
use Modules\Finance\Http\Requests\CountDrawerRequest;
use Modules\Finance\Http\Requests\DrawerMovementRequest;
use Modules\Finance\Http\Requests\HandOverShiftRequest;
use Modules\Finance\Http\Resources\CashCountResource;
use Modules\Finance\Http\Resources\CashShiftResource;
use Modules\Finance\Models\CashCount;
use Modules\Finance\Models\CashMovement;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Services\EloquentTillLedger;
use Modules\Finance\Services\ShiftCloser;
use Modules\Finance\Services\ShiftReporter;
use Modules\Finance\Services\TipSheet;
use Modules\Finance\Support\CashDenominations;
use RuntimeException;

/**
 * Closing the day.
 *
 * One controller for one evening's worth of actions, in the order they happen:
 * read where the shift stands, stop it selling, count what is in the drawer,
 * take the takings to the safe, hand the till to the next person or shut it.
 *
 * The X-report and the Z-report are the same document read at two moments and
 * they share one endpoint for that reason. Splitting them into `x-report` and
 * `z-report` would invite the two to grow apart, which is exactly the failure
 * this module has already had once — a cashier counting against a figure the
 * terminal showed her all evening and being held to a different one.
 */
final class ShiftClosingController extends Controller
{
    public function __construct(
        private readonly ShiftCloser $closer,
        private readonly ShiftReporter $reporter,
        private readonly EloquentTillLedger $till,
    ) {}

    /**
     * The X-report while the shift is open, the signed Z once it is closed.
     *
     * `verdict` is the part a client acts on: it says, before the drawer has been
     * counted, whether tonight's gap would need a reason or a manager. A cashier
     * who learns at eight o'clock that this evening needs the manager can fetch
     * them while they are still on the floor.
     */
    public function report(Request $request, CashShift $shift): JsonResponse
    {
        $document = $this->reporter->document($shift);

        // A client may ask "and if I counted this much?" before committing to it.
        // Nothing is written and nothing is decided; the same policy answers.
        if ($request->filled('counted_cash') && $shift->status !== 'closed') {
            $document['variance'] = $this->closer
                ->verdictFor($shift, $request->integer('counted_cash'))
                ->toArray();
        }

        return response()->json(['data' => $document]);
    }

    /**
     * Whose tips this shift owes — GET /api/v1/finance/shifts/{shift}/tips.
     *
     * Its own read rather than a block on the report: the report is printed
     * and signed at the close, while this is read at the pass, several times
     * an evening, by whoever is handing card tips out of the till.
     */
    public function tips(CashShift $shift, TipSheet $sheet): JsonResponse
    {
        $sheetData = $sheet->forShift($shift);

        return response()->json([
            'data' => $sheetData['rows'],
            'meta' => ['shift' => $shift->number, 'totals' => $sheetData['totals']],
        ]);
    }

    /** Stop the drawer selling so it can be counted. */
    public function lock(CashShift $shift): CashShiftResource
    {
        return new CashShiftResource($this->closer->lock($shift));
    }

    /**
     * Put a locked drawer back to work.
     *
     * A manager's key, not the cashier's — see the route. A cashier who could
     * unlock could take a payment in the middle of their own count, which is the
     * one thing the lock exists to prevent.
     */
    public function unlock(CashShift $shift): CashShiftResource
    {
        return new CashShiftResource($this->closer->unlock($shift));
    }

    /**
     * Count the drawer without deciding anything.
     *
     * A manager's spot check mid-service. It writes down what was in the till and
     * changes nothing about the shift, which is what makes it safe to do at eight
     * o'clock with a queue at the counter.
     */
    public function count(CountDrawerRequest $request, CashShift $shift): CashCountResource
    {
        $count = CashCount::record(
            shift: $shift,
            kind: 'x',
            breakdown: $request->denominations(),
            countedByUserId: $request->user()?->id,
            witnessedByUserId: $request->integer('witnessed_by_user_id') ?: null,
            note: $request->string('note')->value() ?: null,
        );

        return new CashCountResource($count->load(['countedBy', 'witnessedBy']));
    }

    /** Count the drawer, judge the difference, close the shift, freeze the Z. */
    public function close(CloseShiftRequest $request, CashShift $shift): JsonResponse
    {
        $closed = $this->closer->close(
            shift: $shift,
            countedCash: $request->filled('counted_cash') ? $request->integer('counted_cash') : null,
            denominations: $request->denominations(),
            reason: $request->string('reason')->value() ?: null,
            note: $request->string('note')->value() ?: null,
            countedByUserId: $request->user()?->id,
            witnessedByUserId: $request->integer('witnessed_by_user_id') ?: null,
            approvedByUserId: $request->integer('approved_by_user_id') ?: null,
        );

        return response()->json(['data' => $this->reporter->document($closed)]);
    }

    /**
     * Close this shift and float the next person with the same notes.
     *
     * Two documents come back because two things happened: a Z that gets signed,
     * and a till that is open again under somebody else's name.
     */
    public function handOver(HandOverShiftRequest $request, CashShift $shift): JsonResponse
    {
        $result = $this->closer->handOver(
            shift: $shift,
            toUserId: $request->integer('to_user_id'),
            countedCash: $request->filled('counted_cash') ? $request->integer('counted_cash') : null,
            denominations: $request->denominations(),
            reason: $request->string('reason')->value() ?: null,
            note: $request->string('note')->value() ?: null,
            countedByUserId: $request->user()?->id,
            witnessedByUserId: $request->integer('witnessed_by_user_id') ?: null,
            approvedByUserId: $request->integer('approved_by_user_id') ?: null,
        );

        return response()->json([
            'data' => [
                'z_report' => $this->reporter->document($result['shift']),
                'next_shift' => (new CashShiftResource($result['next']))->resolve($request),
            ],
        ]);
    }

    /**
     * The takings go to the safe, counted on the way out.
     *
     * Counted, because money that leaves a drawer uncounted is money nobody can
     * be held to afterwards — and because the alternative, a manager typing a
     * round number, is indistinguishable from a manager taking a different one.
     *
     * It is not a shortfall and must never read as one: the expected-cash
     * arithmetic already subtracts cash paid out, so recording it here is what
     * keeps the cashier's own count agreeing at midnight.
     */
    public function collection(DrawerMovementRequest $request, CashShift $shift): JsonResponse
    {
        return $this->movement($request, $shift, direction: 'out');
    }

    /**
     * Notes brought TO the till: change from the safe, a miscount corrected.
     *
     * Never revenue — nothing was sold — and never the opening float, which
     * `opening_cash` already counts. It is in the box at counting time, so the
     * expected figure has to know about it, and until it did every one of these
     * came back as a drawer mysteriously over.
     */
    public function cashIn(DrawerMovementRequest $request, CashShift $shift): JsonResponse
    {
        return $this->movement($request, $shift, direction: 'in');
    }

    // ============ Internals ============

    /**
     * One drawer movement, optionally counted by note.
     *
     * The two directions share everything except which ledger call records them,
     * and writing them apart would be two chances to forget the count.
     */
    private function movement(DrawerMovementRequest $request, CashShift $shift, string $direction): JsonResponse
    {
        $notes = $request->denominations();
        $amount = $notes === []
            ? $request->integer('amount')
            : CashDenominations::total($notes);

        if ($amount <= 0) {
            return ErrorResponse::code('finance.count_missing', field: 'amount');
        }

        try {
            return DB::transaction(function () use ($request, $shift, $direction, $notes, $amount): JsonResponse {
                $reason = (string) $request->string('reason');

                $count = $notes === [] ? null : CashCount::record(
                    shift: $shift,
                    kind: $direction === 'out' ? 'collection' : 'top_up',
                    breakdown: $notes,
                    countedByUserId: $request->user()?->id,
                    witnessedByUserId: $request->integer('witnessed_by_user_id') ?: null,
                    note: $reason,
                );

                $recordId = $direction === 'out'
                    ? $this->till->recordCashOut((int) $shift->getKey(), $amount, $reason)
                    : $this->till->recordCashIn((int) $shift->getKey(), $amount, $reason);

                // The movement remembers which count it was reconciled against.
                // Without the link an auditor sees "−2 000 000 collection" and a
                // note-by-note count of the same sum as two unrelated rows.
                if ($count !== null) {
                    CashMovement::query()->whereKey($recordId)->update(['cash_count_id' => $count->getKey()]);
                }

                return response()->json([
                    'data' => [
                        'direction' => $direction,
                        'amount' => $amount,
                        'reason' => $reason,
                        'record_id' => $recordId,
                        'count' => $count === null
                            ? null
                            : (new CashCountResource($count))->resolve($request),
                        // So the screen can show the new expected figure without a
                        // second round trip — which is the moment a cashier checks
                        // that the money they just moved did what they expected.
                        'expected_cash' => $shift->refresh()->computeExpectedCash(),
                    ],
                ], 201);
            });
        } catch (RuntimeException $refusal) {
            return ErrorResponse::make(
                ErrorCatalogue::get('finance.shift_refused'),
                meta: ['detail' => $refusal->getMessage()],
            );
        }
    }
}
