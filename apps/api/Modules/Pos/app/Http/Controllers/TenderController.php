<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Contracts\Finance\TillLedger;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Modules\Pos\Http\Controllers\Concerns\ResolvesTillContext;
use Modules\Pos\Services\ApprovalGate;
use Modules\Pos\Services\IdempotencyGuard;
use Modules\Pos\Services\TenderService;
use RuntimeException;

/**
 * Taking the money.
 *
 * The single most important line in this file is the idempotency wrapper: a
 * cashier who taps Pay twice because the screen did not react must charge the
 * guest once, and a till replaying its offline queue must settle the same bill
 * rather than a second copy of it.
 */
final class TenderController extends Controller
{
    use ResolvesTillContext;

    public function __construct(
        private readonly TenderService $tenders,
        private readonly TillLedger $till,
        private readonly IdempotencyGuard $guard,
        private readonly ApprovalGate $approvals,
    ) {}

    public function settle(Request $request, int $bill): JsonResponse
    {
        $validated = $request->validate([
            'tenders' => ['required', 'array', 'min:1', 'max:6'],
            'tenders.*.method' => ['required', 'string', Rule::in($this->till->methods())],
            'tenders.*.amount' => ['required', 'integer', 'min:1'],
            'tenders.*.reference' => ['nullable', 'string', 'max:64'],
        ]);

        $session = $this->session($request);
        $shiftId = $session->cash_shift_id ?? $this->till->openShiftFor((int) $session->user_id);

        if ($shiftId === null) {
            return response()->json([
                'message' => 'Ochiq smena yo\'q. Avval smenani oching.',
                'code' => 'POS_NO_OPEN_SHIFT',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $applied = $this->guard->run(
                terminal: $this->terminal($request),
                localId: $this->localId($request),
                localSeq: $this->localSeq($request),
                action: 'bill.tender',
                payload: $validated + ['bill_id' => $bill],
                work: fn (): array => $this->tenders->settle(
                    terminal: $this->terminal($request),
                    billId: $bill,
                    shiftId: (int) $shiftId,
                    tenders: $validated['tenders'],
                ),
            );
        } catch (RuntimeException $failure) {
            return response()->json([
                'message' => $failure->getMessage(),
                'code' => 'POS_TENDER_REFUSED',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json(['data' => $applied['result'], 'replayed' => $applied['replayed']]);
    }

    /**
     * Give money back.
     *
     * Always needs a manager: a refund is the one operation that moves cash out
     * of the drawer with nothing coming back in, which is exactly why it is the
     * one an attacker reaches for.
     */
    public function refund(Request $request, int $payment): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:255'],
            'approval_id' => ['sometimes', 'integer', 'min:1'],
        ]);

        $session = $this->session($request);
        $actor = $this->actor($request);

        if ($this->approvals->requires($this->terminal($request), $actor, 'refund')) {
            if (! isset($validated['approval_id'])) {
                $approval = $this->approvals->request(
                    session: $session,
                    action: 'refund',
                    reason: (string) $validated['reason'],
                    subjectType: 'payment',
                    subjectId: $payment,
                );

                return response()->json([
                    'message' => 'Menejer tasdig\'i kerak.',
                    'code' => 'POS_APPROVAL_REQUIRED',
                    'approval_id' => $approval->id,
                ], Response::HTTP_FORBIDDEN);
            }

            try {
                $this->approvals->consume((int) $validated['approval_id'], 'refund', 'payment', $payment);
            } catch (RuntimeException $failure) {
                return response()->json([
                    'message' => $failure->getMessage(),
                    'code' => 'POS_APPROVAL_INVALID',
                ], Response::HTTP_FORBIDDEN);
            }
        }

        try {
            $this->till->refund($payment, (string) $validated['reason']);
        } catch (RuntimeException $failure) {
            return response()->json([
                'message' => $failure->getMessage(),
                'code' => 'POS_TENDER_REFUSED',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json(['message' => 'To\'lov qaytarildi.']);
    }
}
