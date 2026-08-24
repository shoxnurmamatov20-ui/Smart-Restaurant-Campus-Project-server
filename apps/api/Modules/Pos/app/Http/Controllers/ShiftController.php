<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Contracts\Finance\CashCount;
use App\Contracts\Finance\TillLedger;
use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Errors\ErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Modules\Pos\Http\Controllers\Concerns\ResolvesTillContext;
use Modules\Pos\Services\ApprovalGate;
use Modules\Pos\Services\DrawerService;
use RuntimeException;

/**
 * Opening the drawer at the start of a service and counting it at the end.
 *
 * The X-report and the Z-report are the same figures; the difference is that
 * one of them closes the shift. Both derive the expected cash on the server —
 * the client only ever contributes the number a human counted, which is the
 * entire point of counting.
 */
final class ShiftController extends Controller
{
    use ResolvesTillContext;

    public function __construct(
        private readonly TillLedger $till,
        private readonly DrawerService $drawer,
        private readonly ApprovalGate $approvals,
    ) {}

    public function open(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'opening_cash' => ['sometimes', 'integer', 'min:0'],
        ]);

        $session = $this->session($request);
        $openingCash = (int) ($validated['opening_cash'] ?? 0);

        try {
            $shiftId = $this->till->openShift((int) $session->user_id, $openingCash);
        } catch (ApiException $named) {
            /*
             * A refusal that already has a name keeps it.
             *
             * `ApiException` carries a catalogue code, a status, three
             * translations and its own meta — Finance answers
             * `finance.variance_needs_approval` with the figures attached, and
             * that code is the actionable part: it tells a cashier to fetch a
             * manager rather than to count again. Rewrapping it below into one
             * generic code threw all of that away and left a single sentence
             * covering conditions that need opposite responses. Plain
             * RuntimeExceptions — a closed bill, a shift already shut — have no
             * name of their own and still get one here.
             */
            throw $named;
        } catch (RuntimeException $failure) {
            return $this->refused($failure);
        }

        // The session carries the shift so every later sale lands in the right
        // drawer without the client having to say which one.
        $session->forceFill(['cash_shift_id' => $shiftId])->save();

        if ($openingCash > 0) {
            $this->drawer->record($session, $shiftId, 'opening_float', $openingCash, 'Smena boshlanishi');
        }

        return response()->json([
            'data' => $this->till->shiftTotals($shiftId)->toArray()
                + ['drawer' => $this->drawer->summaryFor($shiftId)],
        ], Response::HTTP_CREATED);
    }

    /** X-report: where the shift stands, without ending it. */
    public function current(Request $request): JsonResponse
    {
        $shiftId = $this->shiftId($request);

        if ($shiftId === null) {
            return $this->noOpenShift();
        }

        return response()->json([
            'data' => $this->till->shiftTotals($shiftId)->toArray()
                + ['drawer' => $this->drawer->summaryFor($shiftId)],
        ]);
    }

    /** Z-report: count the drawer, close the shift, end the session. */
    public function close(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'counted_cash' => ['required', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:255'],
            /*
             * Why the reason has a field of its own rather than riding in `note`.
             *
             * It lands in its own column, so "which drawers closed short this
             * month without anybody saying why" is one query. Inside a free-text
             * note it is one query plus a person reading two hundred sentences.
             * `note` stays the fallback, because a cashier who typed the reason
             * into the only box the old screen offered should not be refused.
             */
            'variance_reason' => ['nullable', 'string', 'max:255'],
            'approval_id' => ['sometimes', 'integer', 'min:1'],
        ]);

        $session = $this->session($request);
        $shiftId = $this->shiftId($request);

        if ($shiftId === null) {
            return $this->noOpenShift();
        }

        $approvedBy = null;

        if (isset($validated['approval_id'])) {
            try {
                /*
                 * A gap large enough to need a manager is authorised the same way
                 * a discount is: a row in `pos.approvals` with an expiry, bound to
                 * this shift, spent once. The tempting shortcut is to let the till
                 * post an `approved_by_user_id` — but that is a claim, not a
                 * signature, and a cashier knows their manager's id.
                 *
                 * No amount is bound: the difference is not known until the drawer
                 * is counted, and the shift id already pins the authorisation to
                 * one drawer on one day. Finance checks the approver a second time
                 * — that they exist, are permitted, and are not the person who
                 * counted — so the two layers together say both "somebody agreed"
                 * and "that somebody was allowed to".
                 */
                $approvedBy = (int) $this->approvals
                    ->consume((int) $validated['approval_id'], 'shift_variance', 'shift', (int) $shiftId)
                    ->approved_by_user_id;
            } catch (RuntimeException $failure) {
                return ErrorResponse::make(
                    ErrorCatalogue::get('pos.approval_invalid'),
                    meta: ['detail' => $failure->getMessage()],
                );
            }
        }

        try {
            /*
             * A bare total, for now, and the `ofTotal` in the name says so.
             *
             * The till's own close screen counts by denomination — that is what
             * `open-till.tsx` already does for the float — but this endpoint still
             * accepts a single figure, so this is the honest lesser form. When the
             * POS sends `breakdown`, swap to `CashCount::ofNotes()` and the Z-report
             * gains the one thing it cannot have today: whether the number it is
             * reconciling against was counted note by note or typed in round.
             */
            $totals = $this->till->closeShift(
                $shiftId,
                CashCount::ofTotal((int) $validated['counted_cash']),
                $validated['note'] ?? null,
                varianceReason: $validated['variance_reason'] ?? $validated['note'] ?? null,
                approvedByUserId: $approvedBy,
                // The person who COUNTED, not the one who opened the shift. After
                // a handover they are different people, and both halves of the
                // ladder lean on knowing which: a short drawer must name whoever
                // was holding it, and Finance cannot catch a manager approving
                // their own count without knowing whose count it was.
                closedByUserId: (int) $session->user_id,
            );
        } catch (ApiException $named) {
            /*
             * A refusal that already has a name keeps it.
             *
             * `ApiException` carries a catalogue code, a status, three
             * translations and its own meta — Finance answers
             * `finance.variance_needs_approval` with the figures attached, and
             * that code is the actionable part: it tells a cashier to fetch a
             * manager rather than to count again. Rewrapping it below into one
             * generic code threw all of that away and left a single sentence
             * covering conditions that need opposite responses. Plain
             * RuntimeExceptions — a closed bill, a shift already shut — have no
             * name of their own and still get one here.
             */
            throw $named;
        } catch (RuntimeException $failure) {
            return $this->refused($failure);
        }

        $drawer = $this->drawer->summaryFor($shiftId);

        // Counting the money ends the person's turn at the till as well as the
        // shift — leaving a session open over a counted drawer is how the next
        // sale lands in a closed one.
        $session->close('shift_close');

        return response()->json(['data' => $totals->toArray() + ['drawer' => $drawer]]);
    }

    private function shiftId(Request $request): ?int
    {
        $session = $this->session($request);

        return $session->cash_shift_id
            ?? $this->till->openShiftFor((int) $session->user_id);
    }

    private function noOpenShift(): JsonResponse
    {
        return ErrorResponse::code('pos.no_open_shift');
    }

    private function refused(RuntimeException $failure): JsonResponse
    {
        return ErrorResponse::make(
            ErrorCatalogue::get('pos.shift_refused'),
            meta: ['detail' => $failure->getMessage()],
        );
    }
}
