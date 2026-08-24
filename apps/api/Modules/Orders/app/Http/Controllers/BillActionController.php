<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Controllers;

use App\Contracts\Orders\BillRegistry;
use App\Contracts\Pos\Approvals;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Errors\ErrorResponse;
use App\Support\Orders\BillTotals;
use App\Support\Tenancy\BranchContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Orders\Http\Resources\OrderResource;
use Modules\Orders\Models\Order;
use RuntimeException;

/**
 * Discounting and moving a bill from the back office.
 *
 * The console's order drawer draws four buttons and two of them had nowhere to
 * go. The screen's own comment named the obstacle exactly: *"discount and
 * transfer are till operations — `POST /pos/bills/{id}/discount` and
 * `/transfer` — and every route under `/pos/bills` sits behind `pos.session`
 * (`RequireTerminalSession`), which refuses a console token by design: they are
 * actions taken AT a terminal by a person who signed in with a PIN. Reaching
 * them from the back office needs an Orders-side endpoint, not a proxy."*
 *
 * This is that endpoint. It is not a way around the till's guard — it is the
 * same operation asked by a different person, and the differences are recorded:
 *
 *   **`orders.manage`, not `pos.sell`.** Held by branch managers and order
 *   operators, and by no waiter or cashier. A waiter discounts at the till,
 *   where their PIN and their terminal are on the row.
 *
 *   **The approval rule still applies.** `App\Contracts\Pos\Approvals` answers
 *   whether this person may do it unsupervised, and an operator — who holds
 *   `orders.manage` and not `pos.approve` — gets a request raised in the
 *   manager's queue and a 403 carrying its id, exactly as a cashier does. The
 *   back office is not a hole in P9; it is another door with the same lock.
 *
 *   **No terminal, and the row says so.** `pos.approvals.terminal_id` is null on
 *   a request raised from here, which is the honest record: nobody was at a
 *   till. See the migration that made it nullable.
 *
 * Everything goes through `BillRegistry`, so the totals, the events and the
 * ladder behave exactly as they do when the same thing happens at a terminal.
 * A second implementation of "apply a discount" is how a receipt and a Z report
 * start disagreeing.
 */
final class BillActionController extends Controller
{
    public function __construct(
        private readonly BillRegistry $bills,
        private readonly Approvals $approvals,
    ) {}

    /**
     * Take money off a bill, with a reason and — where the rule says so — a
     * signature.
     */
    public function discount(Request $request, Order $order): JsonResponse
    {
        $validated = $request->validate([
            /*
             * A figure or a share, and at least one of them. Both are accepted
             * because both are how the question gets asked: an operator waiving
             * a delivery fee types so'm, and a manager apologising for a wait
             * picks a percentage.
             */
            'amount' => ['required_without:percent', 'integer', 'min:1'],
            'percent' => ['required_without:amount', 'integer', 'min:1', 'max:100'],
            'reason' => ['required', 'string', 'min:3', 'max:255'],
            'approval_id' => ['sometimes', 'integer', 'min:1'],
        ]);

        /*
         * The percent becomes money here, once, before anything downstream sees
         * it — the same conversion the till makes and through the same rule, so
         * a 10% discount is the same figure whoever applied it.
         */
        $amount = isset($validated['percent'])
            ? BillTotals::discountForPercent((int) $order->subtotal, (int) $validated['percent'])
            : (int) $validated['amount'];

        $reason = (string) $validated['reason'];

        $refusal = $this->signature(
            $request,
            action: 'discount',
            reason: $reason,
            subjectId: (int) $order->getKey(),
            amount: $amount,
            subtotal: (int) $order->subtotal,
            approvalId: isset($validated['approval_id']) ? (int) $validated['approval_id'] : null,
        );

        if ($refusal !== null) {
            return $refusal;
        }

        return $this->answer(
            fn (): mixed => $this->bills->applyDiscount((int) $order->getKey(), $amount, $reason),
            $order,
        );
    }

    /**
     * Move a bill to another table, another waiter, or both.
     *
     * No approval: a transfer takes nothing off the bill and gives nothing away.
     * What it changes is who is responsible for it, which is a management act
     * rather than a financial one — and `orders.manage` is exactly the
     * permission that says so.
     */
    public function transfer(Request $request, Order $order): JsonResponse
    {
        $validated = $request->validate([
            // At least one of the three, or the request means nothing: a
            // transfer that moves a bill nowhere is a write with no content, and
            // answering it 200 would tell a console something happened.
            'table_id' => ['required_without_all:table_label,waiter_user_id', 'nullable', 'integer', 'min:1'],
            'table_label' => ['nullable', 'string', 'max:32'],
            'waiter_user_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        return $this->answer(
            fn (): mixed => $this->bills->transfer(
                billId: (int) $order->getKey(),
                tableId: isset($validated['table_id']) ? (int) $validated['table_id'] : null,
                tableLabel: $validated['table_label'] ?? null,
                waiterUserId: isset($validated['waiter_user_id']) ? (int) $validated['waiter_user_id'] : null,
            ),
            $order,
        );
    }

    // ============ Internals ============

    /**
     * Does this person need a manager, and did they bring one?
     *
     * Returns null to carry on. Otherwise it either spends the signature that
     * was handed in, or raises a request and answers 403 with the id to poll —
     * the same two-step the till performs, through the same ledger.
     */
    private function signature(
        Request $request,
        string $action,
        string $reason,
        int $subjectId,
        int $amount,
        int $subtotal,
        ?int $approvalId,
    ): ?JsonResponse {
        /** @var User $actor */
        $actor = $request->user();

        if ($approvalId !== null) {
            try {
                // The amount goes back in, so the signature is checked against
                // what it is being spent on rather than only against what it
                // named.
                $this->approvals->spend($approvalId, $action, 'bill', $subjectId, $amount);
            } catch (RuntimeException $failure) {
                return ErrorResponse::code('order.approval_required', meta: [
                    'detail' => $failure->getMessage(),
                ]);
            }

            return null;
        }

        if (! $this->approvals->requiredFor((int) $actor->getKey(), $action, $amount, $subtotal)) {
            return null;
        }

        $raised = $this->approvals->ask(
            requestedByUserId: (int) $actor->getKey(),
            action: $action,
            reason: $reason,
            subjectType: 'bill',
            subjectId: $subjectId,
            amountTiyin: $amount,
            // The venue the console is looking at, so the request lands in the
            // right manager's queue. Null is a request nobody filtered for.
            branchId: app(BranchContext::class)->id(),
        );

        // The id matters as much as the refusal: without it the console knows
        // only that somebody must sign something — it cannot show which request,
        // cannot poll it, and cannot send the same id back when the answer
        // arrives.
        return ErrorResponse::code('order.approval_required', meta: [
            'approval_id' => $raised->id,
        ]);
    }

    /**
     * Do the work, and turn Orders' own refusals into the one envelope.
     *
     * `BillRegistry` refuses every business rule with a `RuntimeException` — a
     * closed bill, a discount larger than the food, a bill that has already been
     * split. None of those is a server fault, and a 500 would make the console
     * retry something that will never succeed.
     *
     * @param callable(): mixed $work
     */
    private function answer(callable $work, Order $order): JsonResponse
    {
        try {
            $work();
        } catch (RuntimeException $failure) {
            return ErrorResponse::code('order.refused', meta: ['detail' => $failure->getMessage()]);
        }

        return response()->json([
            'data' => (new OrderResource($order->refresh()->load(['items', 'waiter'])->loadCount(['items'])))
                ->resolve(request()),
        ]);
    }
}
