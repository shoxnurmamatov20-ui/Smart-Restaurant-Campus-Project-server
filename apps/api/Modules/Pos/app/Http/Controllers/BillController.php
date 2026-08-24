<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillRegistry;
use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Errors\ErrorResponse;
use App\Support\Orders\OrderState;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Modules\Pos\Http\Controllers\Concerns\ResolvesTillContext;
use Modules\Pos\Http\Requests\AddLineRequest;
use Modules\Pos\Http\Requests\BillActionRequest;
use Modules\Pos\Http\Requests\DiscountRequest;
use Modules\Pos\Http\Requests\MoveBillRequest;
use Modules\Pos\Http\Requests\OpenBillRequest;
use Modules\Pos\Models\PosApproval;
use Modules\Pos\Services\ApprovalGate;
use Modules\Pos\Services\IdempotencyGuard;
use Modules\Pos\Sync\SyncDispatcher;
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
        private readonly SyncDispatcher $sync,
    ) {}

    public function open(OpenBillRequest $request): JsonResponse
    {
        return $this->dispatch($request, 'bill.open', $request->validated(), Response::HTTP_CREATED);
    }

    public function show(Request $request, int $bill): JsonResponse
    {
        $found = $this->bills->find($bill);

        if ($found === null) {
            return $this->notFound();
        }

        return response()->json([
            'data' => $found->toArray(),
            'payable' => $this->payable($request, $found->total),
        ]);
    }

    public function addLine(AddLineRequest $request, int $bill): JsonResponse
    {
        return $this->dispatch($request, 'bill.line.add', $request->validated() + ['bill_id' => $bill]);
    }

    public function voidLine(BillActionRequest $request, int $bill, int $line): JsonResponse
    {
        $found = $this->bills->find($bill);

        if ($found === null) {
            return $this->notFound();
        }

        // What this line is worth, which is what the gate measures and what the
        // manager is asked to agree to.
        $stake = collect($found->lines)->firstWhere('id', $line)?->totalPrice ?? 0;
        $reason = (string) $request->string('reason');

        /*
         * Has the kitchen got this yet?
         *
         * The bill's own rung answers it, not the line's status: firing leaves
         * every line `pending` and moves the BILL to `placed` — see
         * `EloquentBillRegistry::send()` — so a line's status only changes once
         * a cook picks it up. A bill still in `draft` has been rung up and not
         * sent, and striking a line off it costs nobody anything.
         */
        $alreadyFired = $found->status !== OrderState::Draft->value;

        $gate = $this->gate(
            $request,
            'void_line',
            $stake,
            $found->subtotal,
            'line',
            $line,
            $reason,
            alreadyFired: $alreadyFired,
        );

        if ($gate !== null) {
            return $gate;
        }

        return $this->dispatch($request, 'bill.line.void',
            ['bill_id' => $bill, 'line_id' => $line, 'reason' => $reason]);
    }

    public function discount(DiscountRequest $request, int $bill): JsonResponse
    {
        $found = $this->bills->find($bill);

        if ($found === null) {
            // The bill has to be read before anything else here, because a
            // percentage means nothing without the subtotal it is a percentage
            // of. Answering 404 rather than letting Orders refuse it is the
            // same answer `show` gives for the same question.
            return $this->notFound();
        }

        /*
         * The percent becomes money here, once, before anything downstream sees
         * it — the gate compares against a role's ceiling in percent, the
         * approval row records so'm because that is what a manager answers, and
         * the receipt prints so'm. One conversion, at the edge.
         */
        $amount = $request->filled('percent')
            ? $this->approvals->amountForPercent($found->subtotal, $request->integer('percent'))
            : $request->integer('amount');

        $reason = (string) $request->string('reason');

        $gate = $this->gate($request, 'discount', $amount, $found->subtotal, 'bill', $bill, $reason);

        if ($gate !== null) {
            return $gate;
        }

        // The resolved amount, not the percent the till happened to send: the
        // offline queue replays what was DONE, and a percentage of a subtotal
        // that has moved since is a different discount.
        return $this->dispatch($request, 'bill.discount',
            ['bill_id' => $bill, 'amount' => $amount, 'reason' => $reason]);
    }

    public function send(Request $request, int $bill): JsonResponse
    {
        return $this->dispatch($request, 'bill.send', ['bill_id' => $bill]);
    }

    /**
     * The split sheet's three buttons, one endpoint.
     *
     * By dish (`line_ids`), into equal shares (`ways`) or by a named figure
     * (`amount_tiyin`). The request refuses more than one of them; what reaches
     * the dispatcher is exactly what the till asked for, so a replayed offline
     * queue divides the bill the same way it was divided on the night.
     *
     * The arithmetic is deliberately not here and not on the tablet. `ways` and
     * a total do not determine the shares on their own — somebody has to decide
     * where the flooring's remainder lands — and a screen that worked it out
     * would be a second implementation of a rule a guest reads off a receipt.
     * See `App\Support\Orders\BillSplit`.
     */
    public function split(MoveBillRequest $request, int $bill): JsonResponse
    {
        if ($request->has('ways')) {
            return $this->dispatch($request, 'bill.split',
                ['bill_id' => $bill, 'ways' => $request->integer('ways')], Response::HTTP_CREATED);
        }

        if ($request->has('amount_tiyin')) {
            return $this->dispatch($request, 'bill.split',
                ['bill_id' => $bill, 'amount_tiyin' => $request->integer('amount_tiyin')], Response::HTTP_CREATED);
        }

        /** @var array<int, int> $lineIds */
        $lineIds = $request->input('line_ids', []);

        return $this->dispatch($request, 'bill.split',
            ['bill_id' => $bill, 'line_ids' => $lineIds], Response::HTTP_CREATED);
    }

    public function merge(MoveBillRequest $request, int $bill): JsonResponse
    {
        return $this->dispatch($request, 'bill.merge',
            ['bill_id' => $bill, 'target_bill_id' => $request->integer('target_bill_id')]);
    }

    public function transfer(MoveBillRequest $request, int $bill): JsonResponse
    {
        return $this->dispatch($request, 'bill.transfer', $request->validated() + ['bill_id' => $bill]);
    }

    /**
     * Void the bill. Nothing was sold, nothing is owed, nothing moved.
     *
     * Gated even though the route already asks for `pos.void`, and the two are
     * not the same question. The permission says a role may reach this at all;
     * the gate says whether this person may do it unsupervised, and a whole bill
     * is always above a percentage ladder — so anyone without `pos.approve` gets
     * a manager's signature or nothing. Today only managers hold `pos.void` and
     * the gate waves them through; the day a senior waiter is given it, the
     * signature requirement is already here rather than being remembered.
     */
    public function cancel(BillActionRequest $request, int $bill): JsonResponse
    {
        return $this->endWithoutMoney($request, $bill, 'void_order');
    }

    /**
     * The restaurant is paying for this one.
     *
     * A separate endpoint and a separate state, not a hundred percent discount:
     * the food was cooked and the stock is gone, so a comp is a marketing cost
     * where a void is nothing at all. `pos.sell` rather than `pos.void`, because
     * a waiter apologising for a forty-minute wait is who raises this — and the
     * gate always sends it to a manager, whatever the amount and whoever asked.
     */
    public function comp(BillActionRequest $request, int $bill): JsonResponse
    {
        return $this->endWithoutMoney($request, $bill, 'comp');
    }

    // ============ Internals ============

    /**
     * The two ways a bill ends with no money staying: read it, gate it, and let
     * the dispatcher do it.
     *
     * Shared because everything except the verb is identical — the same read,
     * the same gate, the same idempotency, the same shape of answer. What is
     * deliberately NOT shared is the announcement, and that lives in
     * `SyncDispatcher` so a replayed void announces itself exactly as a live one
     * does: a void and a comp leave as two different events, because a
     * subscriber costing food wants one and a subscriber counting lost sales
     * wants the other. See `Modules\Pos\Events\BillComped`. The third way a
     * bill ends — a refund — is not here at all: money moved, so it starts on
     * the payment side.
     */
    private function endWithoutMoney(BillActionRequest $request, int $bill, string $action): JsonResponse
    {
        $found = $this->bills->find($bill);

        if ($found === null) {
            return $this->notFound();
        }

        $reason = (string) $request->string('reason');

        // The whole bill is at stake, so it is measured against the whole bill:
        // no percentage of a subtotal survives this comparison, which is the
        // intended answer — ending a bill is never within a ladder.
        $refusal = $this->gate($request, $action, $found->total, $found->subtotal, 'bill', $bill, $reason);

        if ($refusal !== null) {
            return $refusal;
        }

        return $this->dispatch(
            $request,
            $action === 'comp' ? 'bill.comp' : 'bill.cancel',
            ['bill_id' => $bill, 'reason' => $reason],
            approval: $this->spentApproval($request),
        );
    }

    /**
     * Hand the verb to the one place that knows what it does.
     *
     * The point of the indirection: this same call is what
     * `SyncController::batch()` makes when a till drains its offline queue. Two
     * copies of "what does bill.line.void mean" would drift the first time
     * anything was added to either — a void that announces itself online and
     * silently does not when replayed is the shape that bug takes, and the
     * shifts where it matters are exactly the ones nobody was watching.
     *
     * @param array<string, mixed> $payload
     */
    private function dispatch(
        Request $request,
        string $action,
        array $payload,
        int $status = Response::HTTP_OK,
        ?PosApproval $approval = null,
    ): JsonResponse {
        $session = $this->session($request);
        $terminal = $this->terminal($request);

        return $this->idempotent(
            $request,
            $action,
            $payload,
            fn (): array => $this->sync->apply($action, $payload, $session, $terminal, $approval),
            $status,
        );
    }

    /**
     * The signature this request spent, if it spent one.
     *
     * Re-read rather than threaded back out of `gate()`, because the alternative
     * is either a mutable property on a controller or a tuple return on the one
     * method every write in this class calls. It costs a primary-key lookup on
     * the rare path where an approval was actually used, and it keeps `gate()`
     * answering exactly one question.
     */
    private function spentApproval(Request $request): ?PosApproval
    {
        $approvalId = $request->integer('approval_id');

        return $approvalId > 0 ? PosApproval::query()->find($approvalId) : null;
    }

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
        bool $alreadyFired = false,
    ): ?JsonResponse {
        if (! $this->approvals->requires(
            $this->terminal($request),
            $this->actor($request),
            $action,
            $amount,
            $subtotal,
            $alreadyFired,
        )) {
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

            // The id matters as much as the refusal. Without it the till knows
            // only that a manager must sign something — it cannot show which
            // request, cannot poll it, and cannot send the same id back when
            // the signature arrives. It went into the meta channel rather than
            // alongside the envelope because the envelope has one shape, and
            // `detail` two branches down already travels this way.
            return ErrorResponse::code('pos.approval_required', meta: [
                'approval_id' => $approval->getKey(),
            ]);
        }

        try {
            // The amount goes back in, so the signature is checked against what
            // it is now being spent on rather than only against what it named.
            $this->approvals->consume($approvalId, $action, $subjectType, $subjectId, $amount);
        } catch (RuntimeException $failure) {
            return ErrorResponse::make(
                ErrorCatalogue::get('pos.approval_invalid'),
                meta: ['detail' => $failure->getMessage()],
            );
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
            // Orders refuses with a RuntimeException for every business rule —
            // a closed bill, a missing dish, a discount larger than the total.
            // None of those are server faults, and a 500 would make the till
            // retry something that will never succeed.
            return ErrorResponse::make(
                ErrorCatalogue::get('pos.bill_refused'),
                meta: ['detail' => $failure->getMessage()],
            );
        }

        $result = $applied['result'];

        return response()->json(
            [
                'data' => $result,
                'replayed' => $applied['replayed'],
                /*
                 * What to ask the guest for, recomputed on every write.
                 *
                 * On every bill response rather than behind its own endpoint,
                 * because the figure changes with each line added and a payment
                 * screen opened from a stale one would quote the wrong number. It
                 * costs three integers on a response the till was already making.
                 *
                 * Absent when the result is not a bill — `cancel` answers a
                 * confirmation, not a total — and a client reading `payable.total`
                 * off that would show a cashier zero to collect.
                 */
                ...(isset($result['total'])
                    ? ['payable' => $this->payable($request, (int) $result['total'])]
                    : []),
            ],
            // A replay is not a creation: the bill already existed.
            $applied['replayed'] ? Response::HTTP_OK : $status,
        );
    }

    private function notFound(): JsonResponse
    {
        return ErrorResponse::code('pos.bill_not_found');
    }
}
