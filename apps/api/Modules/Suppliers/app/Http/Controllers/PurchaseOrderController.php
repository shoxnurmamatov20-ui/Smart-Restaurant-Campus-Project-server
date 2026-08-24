<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Modules\Suppliers\Http\Requests\PayPurchaseOrderRequest;
use Modules\Suppliers\Http\Requests\ReceivePurchaseOrderRequest;
use Modules\Suppliers\Http\Requests\StorePurchaseOrderRequest;
use Modules\Suppliers\Http\Requests\TransitionPurchaseOrderRequest;
use Modules\Suppliers\Http\Requests\UpdatePurchaseOrderRequest;
use Modules\Suppliers\Http\Resources\PurchaseOrderItemResource;
use Modules\Suppliers\Http\Resources\PurchaseOrderResource;
use Modules\Suppliers\Models\PurchaseOrder;
use Modules\Suppliers\Models\Supplier;
use Modules\Suppliers\Services\EloquentReceiving;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for purchase orders.
 *
 * Mounted under /api/v1/suppliers/purchase-orders and gated by Spatie permission
 * middleware on the route definition (Modules/Suppliers/routes/api.php).
 *
 * The state machine lives on the model (`PurchaseOrder::TRANSITIONS`) and is
 * one direction only. Two doors write into it: `transition()` for the paperwork
 * steps, and `receive()` for the one step that moves stock and money. Keeping
 * those apart is the whole design — see the note on TRANSITIONS.
 */
final class PurchaseOrderController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(PurchaseOrder::class)
            ->allowedFilters([
                AllowedFilter::exact('number'),
                AllowedFilter::exact('status'),
                AllowedFilter::exact('supplier', 'supplier_id'),
                AllowedFilter::callback('open', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->open();
                    }
                }),
            ])
            ->allowedSorts(['number', 'expected_at', 'total', 'created_at'])
            ->allowedIncludes(['supplier', 'items'])
            ->defaultSort('-created_at')
            ->paginate($perPage)
            ->withQueryString();

        return PurchaseOrderResource::collection($records);
    }

    /**
     * Raise an order, lines and all.
     *
     * One transaction, because a header with no lines is a document a buyer
     * will send by accident: the console's "new order" tab and the shelf's
     * order button both post the whole basket at once, and half of it landing
     * is worse than none of it.
     */
    public function store(StorePurchaseOrderRequest $request): PurchaseOrderResource
    {
        $validated = $request->validated();
        /** @var array<int, array{ingredient_id?: int|null, name: string, unit?: string|null, quantity: int, unit_price: int}> $lines */
        $lines = $validated['items'] ?? [];
        unset($validated['items']);

        $record = DB::transaction(function () use ($validated, $lines): PurchaseOrder {
            // Taken last, next to the write it numbers: the counter's row stays
            // locked until this transaction commits, so a long one would hold
            // every other buyer up. See BranchCounters.
            $validated['number'] ??= PurchaseOrder::nextNumber();

            /** @var PurchaseOrder $order */
            $order = PurchaseOrder::create($validated);

            foreach ($lines as $line) {
                $order->items()->create([
                    'ingredient_id' => $line['ingredient_id'] ?? null,
                    'name' => $line['name'],
                    'unit' => $line['unit'] ?? null,
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'total_price' => $line['quantity'] * $line['unit_price'],
                ]);
            }

            // Never written by hand: the header total is the sum of the lines,
            // so an order cannot claim a figure its own contents disagree with.
            return $order->recalculateTotal();
        });

        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        return new PurchaseOrderResource($record->refresh()->load(['supplier', 'items']));
    }

    public function show(PurchaseOrder $purchaseOrder): PurchaseOrderResource
    {
        return new PurchaseOrderResource($purchaseOrder->load(['supplier', 'items']));
    }

    public function update(UpdatePurchaseOrderRequest $request, PurchaseOrder $purchaseOrder): PurchaseOrderResource
    {
        $this->refuseIfClosed($purchaseOrder);

        $purchaseOrder->update($request->validated());

        return new PurchaseOrderResource($purchaseOrder->refresh()->load(['supplier', 'items']));
    }

    public function destroy(PurchaseOrder $purchaseOrder): Response
    {
        $purchaseOrder->delete();

        return response()->noContent();
    }

    /** Add a line and re-derive the order total. */
    public function addItem(Request $request, PurchaseOrder $purchaseOrder): PurchaseOrderItemResource
    {
        $this->refuseIfClosed($purchaseOrder);

        $validated = $request->validate([
            'ingredient_id' => ['nullable', 'integer', 'exists:ingredients,id'],
            'name' => ['required', 'string', 'max:160'],
            'unit' => ['nullable', 'string', 'max:8'],
            'quantity' => ['required', 'integer', 'min:1'],
            'unit_price' => ['required', 'integer', 'min:0'],
        ]);

        $item = $purchaseOrder->items()->create([
            'ingredient_id' => $validated['ingredient_id'] ?? null,
            'name' => $validated['name'],
            'unit' => $validated['unit'] ?? null,
            'quantity' => (int) $validated['quantity'],
            'unit_price' => (int) $validated['unit_price'],
            'total_price' => (int) $validated['quantity'] * (int) $validated['unit_price'],
        ]);

        $purchaseOrder->recalculateTotal();

        return new PurchaseOrderItemResource($item);
    }

    /**
     * Move the order along: sent, confirmed, or called off.
     *
     * The ladder is checked rather than trusted. A console that offers only the
     * legal buttons still sends the illegal one when two buyers have the same
     * order open — one confirms, the other's screen still shows "send", and the
     * second tap must be refused with the reason rather than silently winding
     * the document backwards.
     */
    public function transition(TransitionPurchaseOrderRequest $request, PurchaseOrder $purchaseOrder): PurchaseOrderResource
    {
        $target = (string) $request->string('status');

        if ($purchaseOrder->status === 'received') {
            throw ApiException::of('purchase_order.already_received', field: 'status');
        }

        if (! $purchaseOrder->mayBecome($target)) {
            throw ApiException::of('purchase_order.invalid_transition', field: 'status', meta: [
                'from' => $purchaseOrder->status,
                'to' => $target,
            ]);
        }

        // An order with nothing on it is a document, not a request. Refused at
        // the one step where it stops being ours and reaches the supplier;
        // a draft is allowed to be empty because that is what a draft is for.
        if ($target === 'sent' && $purchaseOrder->items()->count() === 0) {
            throw ApiException::of('purchase_order.no_lines', field: 'items');
        }

        $changes = ['status' => $target];

        if ($request->filled('reason')) {
            $changes['note'] = (string) $request->string('reason');
        }

        $purchaseOrder->update($changes);

        return new PurchaseOrderResource($purchaseOrder->refresh()->load(['supplier', 'items']));
    }

    /**
     * Receive the delivery.
     *
     * This is the only place a purchase turns into stock: each line with a
     * known ingredient produces a receipt movement, and the supplier's debt
     * grows by the order total if they are not paid on delivery. Receiving
     * twice is refused — otherwise one clumsy tap doubles the whole store.
     */
    public function receive(
        ReceivePurchaseOrderRequest $request,
        PurchaseOrder $purchaseOrder,
        EloquentReceiving $receiving,
    ): PurchaseOrderResource {
        if ($purchaseOrder->status === 'received') {
            throw ApiException::of('purchase_order.already_received');
        }

        if ($purchaseOrder->status === 'cancelled') {
            throw ApiException::of('purchase_order.invalid_transition', meta: [
                'from' => 'cancelled',
                'to' => 'received',
            ]);
        }

        /*
         * The three writes live in EloquentReceiving, not here.
         *
         * A storekeeper's phone confirms the same delivery at the service
         * entrance and drains it through `POST /api/v1/staff/actions`, which
         * reaches the same code through `App\Contracts\Suppliers\Receiving`.
         * The refusals stay in the controller because a screen wants a 422 it
         * can print and a queue wants a boolean that leaves its other entries
         * alone — but "what receiving DOES" is one implementation.
         */
        /*
         * Counts kept only for lines that belong to THIS order.
         *
         * The ids come off a form, and a stale tab — or a copied request —
         * could name a line from yesterday's van. Filtering here rather than in
         * the request is deliberate: the request has no order in hand, and the
         * only place both facts exist at once is this method.
         */
        $ours = $purchaseOrder->items->pluck('id')->all();
        $counted = array_intersect_key($request->counts(), array_flip($ours));

        DB::transaction(fn () => $receiving->post($purchaseOrder, $counted));

        return new PurchaseOrderResource($purchaseOrder->refresh()->load(['supplier', 'items']));
    }

    /**
     * Money paid against a supplier's invoice.
     *
     * The button on the ledger's payables tab, and until now it flashed a
     * message and changed nothing — `purchase_orders` had no `paid_at`, no
     * `paid_amount` and no payment status, because its ladder is delivery rather
     * than money.
     *
     * ---------------------------------------------------------------------
     * Why this is not `POST /finance/expenses` with `category: purchase`
     *
     * Because that records the money leaving and touches neither the invoice nor
     * the debt: the row would still read unpaid, and a second press would book
     * the payment twice. The two writes that matter are here — the invoice's own
     * record, and `suppliers.debt`, which `EloquentReceiving::post()` has been
     * growing since it was written with nothing anywhere able to shrink it.
     *
     * An accountant books the cash side as an expense as well; that is a
     * separate act about a drawer, and Finance owns it. Doing it from here would
     * mean this module writing another module's money table, which is the edge
     * `ModuleBoundaryTest` exists to keep from being drawn.
     *
     * ---------------------------------------------------------------------
     * Locked, because paying twice is the failure mode
     *
     * The same ten seconds `receive()` guards against: a buyer at a desk and an
     * accountant on the ledger screen pressing the same row. `lockForUpdate`
     * plus a re-read of `paid_amount` inside the transaction is what makes
     * "already settled" a refusal instead of a double decrement of the debt.
     */
    public function pay(PayPurchaseOrderRequest $request, PurchaseOrder $purchaseOrder): PurchaseOrderResource
    {
        if ($purchaseOrder->status === 'cancelled') {
            throw ApiException::of('purchase_order.locked', meta: ['status' => 'cancelled']);
        }

        DB::transaction(function () use ($request, $purchaseOrder): void {
            /** @var PurchaseOrder $locked */
            $locked = PurchaseOrder::query()->lockForUpdate()->findOrFail($purchaseOrder->getKey());

            $outstanding = $locked->outstandingAmount();

            if ($outstanding <= 0) {
                throw ApiException::of('purchase_order.already_paid');
            }

            // Absent means all of it — see the request class. A figure larger
            // than what is owed is refused rather than clamped: a buyer who
            // typed one digit too many has to see that, not have it silently
            // become the right number.
            $amount = $request->integer('amount', $outstanding);

            if ($amount > $outstanding) {
                throw ApiException::of('purchase_order.overpaid', meta: [
                    'outstanding' => $outstanding,
                    'sent' => $amount,
                ]);
            }

            $paid = $locked->paid_amount + $amount;

            $locked->forceFill([
                'paid_amount' => $paid,
                // Only when it is actually settled. A part payment leaves this
                // null, which is what keeps the row on the payables list.
                'paid_at' => $paid >= $locked->total
                    ? ($request->date('paid_at') ?? now())
                    : null,
            ])->save();

            $supplier = Supplier::query()->lockForUpdate()->find($locked->supplier_id);

            if ($supplier !== null) {
                /*
                 * Never below zero.
                 *
                 * `debt` only grew for suppliers who invoice
                 * (`payment_terms_days > 0`), so an order paid at the door never
                 * added to it — and subtracting from it anyway would push a
                 * supplier's balance negative and make the payables total on the
                 * supplier list read as money they owe us.
                 */
                $supplier->forceFill([
                    'debt' => max(0, $supplier->debt - $amount),
                ])->save();
            }
        });

        return new PurchaseOrderResource($purchaseOrder->refresh()->load(['supplier', 'items']));
    }

    /**
     * A received or cancelled order is a record of something that happened.
     *
     * @throws ApiException
     */
    private function refuseIfClosed(PurchaseOrder $purchaseOrder): void
    {
        if ($purchaseOrder->status === 'received') {
            throw ApiException::of('purchase_order.already_received');
        }

        if ($purchaseOrder->status === 'cancelled') {
            throw ApiException::of('purchase_order.locked', meta: ['status' => $purchaseOrder->status]);
        }
    }
}
