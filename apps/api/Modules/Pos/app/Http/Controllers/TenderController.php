<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Contracts\Finance\TillLedger;
use App\Contracts\Orders\BillRegistry;
use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Errors\ErrorResponse;
use App\Support\Events\EventBus;
use App\Support\Finance\TenderPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Modules\Pos\Events\PaymentRefunded;
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
        // Read-only here, for the quote: the settlement itself goes through
        // TenderService so the money and the kitchen ticket stay in one transaction.
        private readonly BillRegistry $bills,
        private readonly IdempotencyGuard $guard,
        private readonly ApprovalGate $approvals,
        private readonly EventBus $events,
    ) {}

    /**
     * What this settlement would come to, without taking any of it.
     *
     * The payment screen's arithmetic, answered by the server. A cashier has to
     * read a figure out loud before a guest hands anything over, and that figure
     * depends on the split: only cash is rounded, and only the remainder after the
     * other methods have been applied.
     *
     * The obvious shortcut is to let the tablet work it out — it has the total and
     * the terminal's rounding step, and it is one line of arithmetic. It is refused
     * because the two implementations then have to agree forever, and they already
     * failed to once: the screen rounded the bill total while the settlement rounded
     * the cash remainder. For a cash-only sale those are the same number, which is
     * why it looked right. Split a bill with a card amount that is not round and
     * they differ — the screen says the guest is square, the server records a part
     * payment, and the table leaves owing money nobody knows about.
     *
     * A read, so no idempotency key: it writes nothing and quoting twice is free.
     * It answers 200 with the refusal attached rather than an error status, because
     * a cashier mid-entry has typed something that is not valid YET — two cash lines,
     * a tip larger than the tender — and a screen full of red for a half-typed split
     * teaches them to ignore it.
     */
    public function quote(Request $request, int $bill): JsonResponse
    {
        $validated = $request->validate([
            'tenders' => ['required', 'array', 'min:1', 'max:6'],
            'tenders.*.method' => ['required', 'string', Rule::in($this->till->methods())],
            'tenders.*.amount' => ['required', 'integer', 'min:0'],
            'tenders.*.tip' => ['nullable', 'integer', 'min:0'],
        ]);

        $found = $this->bills->find($bill);

        if ($found === null) {
            return ErrorResponse::code('pos.bill_not_found');
        }

        // Zero-amount lines are dropped rather than refused: a cashier who has added
        // a second method and not yet typed into it is mid-thought, not in error.
        $tenders = array_values(array_filter(
            $validated['tenders'],
            static fn (array $line): bool => (int) $line['amount'] > 0,
        ));

        if ($tenders === []) {
            return response()->json(['data' => null, 'refused' => null]);
        }

        try {
            $plan = TenderPlan::of($found->total, $tenders, $this->terminal($request)->cashRoundingStep());
        } catch (RuntimeException $refusal) {
            return response()->json(['data' => null, 'refused' => $refusal->getMessage()]);
        }

        return response()->json(['data' => $plan->toArray(), 'refused' => null]);
    }

    public function settle(Request $request, int $bill): JsonResponse
    {
        $validated = $request->validate([
            'tenders' => ['required', 'array', 'min:1', 'max:6'],
            'tenders.*.method' => ['required', 'string', Rule::in($this->till->methods())],
            'tenders.*.amount' => ['required', 'integer', 'min:1'],
            'tenders.*.reference' => ['nullable', 'string', 'max:120'],
            /*
             * The tip, DECISIONS Q6 — part of what the guest handed over, never
             * part of what they owed.
             *
             * No upper bound beyond the tender itself, which the service checks: a
             * regular tipping 200% on a coffee is unusual and not this validator's
             * business. What it must not accept is a negative, which would be a
             * discount wearing a tip's name and would skip the approval ladder P9
             * puts in front of every real one.
             */
            'tenders.*.tip' => ['nullable', 'integer', 'min:0'],
        ]);

        $session = $this->session($request);
        $shiftId = $session->cash_shift_id ?? $this->till->openShiftFor((int) $session->user_id);

        if ($shiftId === null) {
            return ErrorResponse::code('pos.no_open_shift');
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
            return ErrorResponse::make(
                ErrorCatalogue::get('pos.tender_refused'),
                meta: ['detail' => $failure->getMessage()],
            );
        }

        return response()->json(['data' => $applied['result'], 'replayed' => $applied['replayed']]);
    }

    /**
     * Give money back.
     *
     * Always needs a manager: a refund is the one operation that moves cash out
     * of the drawer with nothing coming back in, which is exactly why it is the
     * one an attacker reaches for.
     *
     * Two halves have to move together. Finance reverses the payment; Orders
     * stops the bill being a sale. Neither module can see the other, so this is
     * the only place both can happen — and it does them in one transaction,
     * because the state between them is the worst one available: the money is
     * back in the guest's hand and every report still counts the meal as sold.
     */
    public function refund(Request $request, int $payment): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:255'],
            'approval_id' => ['sometimes', 'integer', 'min:1'],
        ]);

        $session = $this->session($request);
        $actor = $this->actor($request);
        $reason = (string) $validated['reason'];
        $approval = null;

        if ($this->approvals->requires($this->terminal($request), $actor, 'refund')) {
            if (! isset($validated['approval_id'])) {
                $raised = $this->approvals->request(
                    session: $session,
                    action: 'refund',
                    reason: $reason,
                    subjectType: 'payment',
                    subjectId: $payment,
                );

                // Same as the void path in BillController: a refusal without
                // the id tells the till to wait without telling it what for.
                return ErrorResponse::code('pos.approval_required', meta: [
                    'approval_id' => $raised->getKey(),
                ]);
            }

            try {
                /*
                 * No amount, and that is not the hole it looks like.
                 *
                 * Elsewhere a signature is bound to a figure because the figure
                 * is what the till proposes and could change between asking and
                 * doing. A refund proposes nothing: what comes back is whatever
                 * that payment row holds, the row is frozen, and pinning the
                 * approval to the payment id pins the money with it.
                 */
                $approval = $this->approvals->consume((int) $validated['approval_id'], 'refund', 'payment', $payment);
            } catch (RuntimeException $failure) {
                return ErrorResponse::make(
                    ErrorCatalogue::get('pos.approval_invalid'),
                    meta: ['detail' => $failure->getMessage()],
                );
            }
        }

        /*
         * The drawer the person is actually standing at.
         *
         * Not the one that took the money: yesterday's takings come out of
         * today's till, and it is today's Z-report that has to account for the
         * notes leaving. Finance refuses the case that has no honest answer —
         * a payment taken by another till that is still open — because the money
         * would then be missing from one drawer and unexplained in another.
         */
        $shiftId = $session->cash_shift_id ?? $this->till->openShiftFor((int) $session->user_id);
        $terminalId = (int) $this->terminal($request)->getKey();
        $byUserId = (int) $session->user_id;

        try {
            $applied = $this->guard->run(
                terminal: $this->terminal($request),
                localId: $this->localId($request),
                localSeq: $this->localSeq($request),
                action: 'payment.refund',
                payload: ['payment_id' => $payment, 'reason' => $reason],
                work: function () use ($payment, $reason, $shiftId, $terminalId, $byUserId, $approval): array {
                    return DB::transaction(function () use ($payment, $reason, $shiftId, $terminalId, $byUserId, $approval): array {
                        $done = $this->till->refundPayment($payment, $reason, $shiftId);

                        /*
                         * The bill moves only when nothing is captured against it
                         * any more, and Finance answers that rather than this
                         * controller counting tenders it cannot see: a table that
                         * paid with two cards and asks for one back has been
                         * partly refunded and still bought the meal.
                         *
                         * The `paid` check is the second guard on the same idea. A
                         * bill that was only ever part-paid never closed, so it is
                         * not a sale to reverse — refunding that deposit leaves it
                         * open and owing, which is exactly what it is. Orders
                         * refuses an unsettled bill anyway; asking first means the
                         * deposit case answers success instead of an error.
                         */
                        if ($done->orderFullyRefunded && $this->bills->find($done->orderId)?->status === 'paid') {
                            $this->bills->refund($done->orderId, $reason);
                        }

                        // Inside the transaction, so a failure on either half
                        // takes the announcement with it — and inside the
                        // idempotency guard, so a replayed offline queue does not
                        // announce one refund twice.
                        $this->events->publish(new PaymentRefunded(
                            paymentId: $done->paymentId,
                            billId: $done->orderId,
                            reason: $reason,
                            terminalId: $terminalId,
                            byUserId: $byUserId,
                            approval: $approval,
                            billFullyRefunded: $done->orderFullyRefunded,
                        ));

                        return $done->toArray();
                    });
                },
            );
        } catch (ApiException $named) {
            // A refusal that already has a name keeps it — see `settle()`.
            throw $named;
        } catch (RuntimeException $failure) {
            return ErrorResponse::make(
                ErrorCatalogue::get('pos.tender_refused'),
                meta: ['detail' => $failure->getMessage()],
            );
        }

        return response()->json([
            'message' => 'To\'lov qaytarildi.',
            'data' => $applied['result'],
            'replayed' => $applied['replayed'],
        ]);
    }
}
