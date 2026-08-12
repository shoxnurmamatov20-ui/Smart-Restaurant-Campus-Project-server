<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Contracts\Orders\BillRegistry;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Modules\Pos\Http\Controllers\Concerns\ResolvesTillContext;
use Modules\Pos\Http\Requests\AddLineRequest;
use Modules\Pos\Http\Requests\BillActionRequest;
use Modules\Pos\Http\Requests\MoveBillRequest;
use Modules\Pos\Http\Requests\OpenBillRequest;
use Modules\Pos\Services\ApprovalGate;
use Modules\Pos\Services\IdempotencyGuard;
use RuntimeException;

/**
 * The selling screen, server side.
 *
 * Every method here is the same shape: derive who and where from the session,
 * wrap the work in the idempotency guard, and hand the job to Orders through
 * the BillRegistry contract. Nothing in this controller knows how a bill is
 * stored, and nothing in Orders knows a till exists.
 *
 * The two rules that are easy to lose and expensive to lose:
 *  - the waiter on a bill comes from the session, not the body;
 *  - every write carries the device's own X-Pos-Local-Id, so a replay after an
 *    outage settles the same bill instead of opening a second one.
 */
final class BillController extends Controller
{
    use ResolvesTillContext;

    public function __construct(
        private readonly BillRegistry $bills,
        private readonly IdempotencyGuard $guard,
        private readonly ApprovalGate $approvals,
    ) {}

    public function open(OpenBillRequest $request): JsonResponse
    {
        $session = $this->session($request);

        return $this->idempotent($request, 'bill.open', $request->validated(), function () use ($request, $session): array {
            return $this->bills->open(
                channel: (string) $request->string('channel'),
                tableId: $request->filled('table_id') ? $request->integer('table_id') : null,
                tableLabel: $request->filled('table_label') ? (string) $request->string('table_label') : null,
                // From the session. Always.
                waiterUserId: (int) $session->user_id,
                customerId: $request->filled('customer_id') ? $request->integer('customer_id') : null,
                guests: $request->integer('guests', 1),
            )->toArray();
        }, Response::HTTP_CREATED);
    }

    public function show(Request $request, int $bill): JsonResponse
    {
        $found = $this->bills->find($bill);

        if ($found === null) {
            return $this->notFound();
        }

        return response()->json(['data' => $found->toArray()]);
    }

    public function addLine(AddLineRequest $request, int $bill): JsonResponse
    {
        return $this->idempotent($request, 'bill.line.add', $request->validated() + ['bill_id' => $bill],
            fn (): array => $this->bills->addLine(
                billId: $bill,
                menuItemId: $request->integer('menu_item_id'),
                quantity: $request->integer('quantity', 1),
                note: $request->filled('note') ? (string) $request->string('note') : null,
            )->toArray(),
        );
    }

    public function voidLine(BillActionRequest $request, int $bill, int $line): JsonResponse
    {
        $found = $this->bills->find($bill);
        $stake = collect($found?->lines ?? [])->firstWhere('id', $line)?->totalPrice ?? 0;

        $gate = $this->gate($request, 'void_line', $stake, $found?->subtotal ?? 0, 'line', $line,
            (string) $request->string('reason'));

        if ($gate !== null) {
            return $gate;
        }

        return $this->idempotent($request, 'bill.line.void', ['bill_id' => $bill, 'line_id' => $line],
            fn (): array => $this->bills->voidLine($bill, $line, (string) $request->string('reason'))->toArray(),
        );
    }

    public function discount(BillActionRequest $request, int $bill): JsonResponse
    {
        $found = $this->bills->find($bill);

        $gate = $this->gate($request, 'discount', $request->integer('amount'), $found?->subtotal ?? 0,
            'bill', $bill, (string) $request->string('reason'));

        if ($gate !== null) {
            return $gate;
        }

        return $this->idempotent($request, 'bill.discount', $request->validated() + ['bill_id' => $bill],
            fn (): array => $this->bills->applyDiscount(
                $bill,
                $request->integer('amount'),
                (string) $request->string('reason'),
            )->toArray(),
        );
    }

    public function serviceCharge(Request $request, int $bill): JsonResponse
    {
        $validated = $request->validate(['amount' => ['required', 'integer', 'min:0']]);

        return $this->idempotent($request, 'bill.service_charge', $validated + ['bill_id' => $bill],
            fn (): array => $this->bills->applyServiceCharge($bill, (int) $validated['amount'])->toArray(),
        );
    }

    public function send(Request $request, int $bill): JsonResponse
    {
        return $this->idempotent($request, 'bill.send', ['bill_id' => $bill],
            fn (): array => $this->bills->send($bill)->toArray(),
        );
    }

    public function split(MoveBillRequest $request, int $bill): JsonResponse
    {
        /** @var array<int, int> $lineIds */
        $lineIds = $request->input('line_ids', []);

        return $this->idempotent($request, 'bill.split', ['bill_id' => $bill, 'line_ids' => $lineIds],
            fn (): array => $this->bills->split($bill, $lineIds)->toArray(),
            Response::HTTP_CREATED,
        );
    }

    public function merge(MoveBillRequest $request, int $bill): JsonResponse
    {
        $target = $request->integer('target_bill_id');

        return $this->idempotent($request, 'bill.merge', ['bill_id' => $bill, 'target_bill_id' => $target],
            fn (): array => $this->bills->merge($bill, $target)->toArray(),
        );
    }

    public function transfer(MoveBillRequest $request, int $bill): JsonResponse
    {
        return $this->idempotent($request, 'bill.transfer', $request->validated() + ['bill_id' => $bill],
            fn (): array => $this->bills->transfer(
                billId: $bill,
                tableId: $request->filled('table_id') ? $request->integer('table_id') : null,
                tableLabel: $request->filled('table_label') ? (string) $request->string('table_label') : null,
                waiterUserId: $request->filled('waiter_user_id') ? $request->integer('waiter_user_id') : null,
            )->toArray(),
        );
    }

    public function cancel(BillActionRequest $request, int $bill): JsonResponse
    {
        return $this->idempotent($request, 'bill.cancel', ['bill_id' => $bill],
            fn (): array => $this->bills->cancel($bill, (string) $request->string('reason'))->toArray(),
        );
    }

    // ============ Internals ============

    /**
     * Ask the approval gate whether this person may do this unsupervised.
     *
     * Returns null to carry on. Otherwise it either opens a request and answers
     * 403 with the id the till should poll — the cashier calls the manager over
     * — or it spends the authorisation that was handed in and returns null.
     *
     * A refused authorisation is a 403 and not a 422 on purpose: nothing about
     * the request is malformed, the person simply is not allowed.
     */
    private function gate(
        Request $request,
        string $action,
        int $amount,
        int $subtotal,
        string $subjectType,
        int $subjectId,
        string $reason,
    ): ?JsonResponse {
        if (! $this->approvals->requires($this->terminal($request), $this->actor($request), $action, $amount, $subtotal)) {
            return null;
        }

        $approvalId = $request->integer('approval_id');

        if ($approvalId <= 0) {
            $approval = $this->approvals->request(
                session: $this->session($request),
                action: $action,
                reason: $reason,
                subjectType: $subjectType,
                subjectId: $subjectId,
                amount: $amount,
            );

            return response()->json([
                'message' => 'Menejer tasdig\'i kerak.',
                'code' => 'POS_APPROVAL_REQUIRED',
                'approval_id' => $approval->id,
                'expires_at' => $approval->expires_at?->toIso8601String(),
            ], Response::HTTP_FORBIDDEN);
        }

        try {
            $this->approvals->consume($approvalId, $action, $subjectType, $subjectId);
        } catch (RuntimeException $failure) {
            return response()->json([
                'message' => $failure->getMessage(),
                'code' => 'POS_APPROVAL_INVALID',
            ], Response::HTTP_FORBIDDEN);
        }

        return null;
    }

    /**
     * @param array<string, mixed> $payload
     * @param callable(): array<string, mixed> $work
     */
    private function idempotent(
        Request $request,
        string $action,
        array $payload,
        callable $work,
        int $status = Response::HTTP_OK,
    ): JsonResponse {
        try {
            $applied = $this->guard->run(
                terminal: $this->terminal($request),
                localId: $this->localId($request),
                localSeq: $this->localSeq($request),
                action: $action,
                payload: $payload,
                work: static fn (): array => $work(),
            );
        } catch (RuntimeException $failure) {
            // Orders refuses with a RuntimeException for every business rule —
            // a closed bill, a missing dish, a discount larger than the total.
            // None of those are server faults, and a 500 would make the till
            // retry something that will never succeed.
            return response()->json([
                'message' => $failure->getMessage(),
                'code' => 'POS_BILL_REFUSED',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json(
            ['data' => $applied['result'], 'replayed' => $applied['replayed']],
            // A replay is not a creation: the bill already existed.
            $applied['replayed'] ? Response::HTTP_OK : $status,
        );
    }

    private function notFound(): JsonResponse
    {
        return response()->json([
            'message' => 'Hisob topilmadi.',
            'code' => 'POS_BILL_NOT_FOUND',
        ], Response::HTTP_NOT_FOUND);
    }
}
