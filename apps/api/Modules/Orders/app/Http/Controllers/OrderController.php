<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Controllers;

use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Orders\BillRegistry;
use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Modules\Orders\Http\Requests\StoreOrderRequest;
use Modules\Orders\Http\Requests\UpdateOrderRequest;
use Modules\Orders\Http\Resources\OrderItemResource;
use Modules\Orders\Http\Resources\OrderResource;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for orders.
 *
 * Mounted under /api/v1/orders/orders and gated by Spatie permission
 * middleware on the route definition (Modules/Orders/routes/api.php).
 */
final class OrderController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        /*
         * The waiter is eager and not an `allowedIncludes` entry.
         *
         * The console's order table draws that column on every row, so making
         * it optional would mean either a client that always asks — in which
         * case it is not optional — or a column of ids nobody can read. One
         * extra query per page against `public.users` is the whole cost.
         */
        $records = QueryBuilder::for(Order::query()->with('waiter'))
            ->allowedFilters([
                AllowedFilter::exact('number'),
                AllowedFilter::exact('status'),
                AllowedFilter::exact('channel'),
                AllowedFilter::exact('table', 'restaurant_table_id'),
                AllowedFilter::exact('waiter', 'waiter_user_id'),
                /*
                 * One guest's own bills — the CRM card's order history.
                 *
                 * `customer_id` is a CRM id stored without a foreign key (see
                 * the Order docblock), so this is an exact match and nothing
                 * more. It is here because the console drew four invented
                 * visits under every real guest's name; a guest with no
                 * history has to come back empty, which is what this answers.
                 */
                AllowedFilter::exact('customer', 'customer_id'),
                /*
                 * The intake desk's two lanes.
                 *
                 * `intake_channel` is what the operator's screen tabs across —
                 * phone, telegram, site, and the three aggregators one at a time
                 * — and it is exact rather than a partial match on purpose:
                 * `uzum` must never also return `uzum-express` if a seventh
                 * contract ever names itself that way.
                 *
                 * `operator` answers the league table: how many calls this
                 * person took this shift.
                 */
                AllowedFilter::exact('intake_channel'),
                AllowedFilter::exact('operator', 'operator_user_id'),
                /*
                 * Everything that did NOT start at a table.
                 *
                 * The operator's queue is one list across all six lanes, and
                 * `intake_channel` is what separates it from the room: a
                 * dine-in bill has none. `status` cannot answer this — a
                 * table's first order is `placed` too, which is the reason the
                 * intake screen sat on fixtures.
                 *
                 * `filter[intake]=false` is the mirror and is worth having: it
                 * is "the room", which is what a floor report wants.
                 */
                AllowedFilter::callback('intake', function ($query, $value): void {
                    filter_var($value, FILTER_VALIDATE_BOOLEAN)
                        ? $query->whereNotNull('intake_channel')
                        : $query->whereNull('intake_channel');
                }),
                /*
                 * Pre-orders only — the kitchen's morning list.
                 *
                 * A boolean rather than a date range, because the question is
                 * "which of these were asked for a particular time" and the
                 * range that answers it is `sort=scheduled_for` on top.
                 */
                AllowedFilter::callback('scheduled', function ($query, $value): void {
                    filter_var($value, FILTER_VALIDATE_BOOLEAN)
                        ? $query->whereNotNull('scheduled_for')
                        : $query->whereNull('scheduled_for');
                }),
                AllowedFilter::callback('open', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->open();
                    }
                }),
                AllowedFilter::callback('today', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->today();
                    }
                }),
            ])
            ->allowedSorts(['number', 'total', 'placed_at', 'created_at', 'scheduled_for'])
            ->allowedIncludes(['items'])
            ->withCount(['items'])
            ->defaultSort('-created_at')
            ->paginate($perPage)
            ->withQueryString();

        return OrderResource::collection($records);
    }

    /**
     * Open a bill, and — when the caller sent a basket — fill it in one go.
     *
     * The intake desk is why the basket is here. An operator builds a cart
     * while the guest is still on the telephone and presses one button; the
     * alternative shape is a POST for the order plus a POST per line, and a
     * call that dropped between line two and line three would leave a
     * half-order on a pass with a guest expecting the whole thing.
     *
     * Both halves in one transaction for exactly that reason: every line lands
     * or the order does not exist.
     *
     * Prices come from the catalogue, per line, inside the transaction — never
     * from the request. That rule holds even here, where the caller holds
     * `orders.create` and is audited by name: a price a client can name is a
     * price a client can name as zero, and the difference between a discount
     * and a mistyped total is the approval ladder the first one goes through.
     */
    public function store(StoreOrderRequest $request, MenuCatalog $menu, BillRegistry $bills): OrderResource
    {
        $validated = $request->validated();
        /** @var array<int, array{menu_item_id: int, quantity: int, note?: string|null}> $lines */
        $lines = $validated['items'] ?? [];
        unset($validated['items']);

        /*
         * A bill number, when the caller did not bring one.
         *
         * `orders.number` is NOT NULL and unique per restaurant, and the intake
         * desk has no business inventing one — the counter is the restaurant's
         * and `BranchCounters` is what keeps two tills from issuing the same
         * one. Before this, a POST with no `number` reached the database and
         * came back a 500 with a constraint violation in it, which is a
         * platform that looks broken to somebody who simply took an order.
         */
        $validated['number'] ??= Order::nextNumber();

        $record = DB::transaction(function () use ($validated, $lines, $menu, $bills): Order {
            // refresh() so database defaults (status, timestamps) reach the
            // client; without it the response reports null for every column the
            // request did not send.
            $order = Order::create($validated)->refresh();

            foreach ($lines as $line) {
                $this->writeLine($order, $line, $menu);
            }

            if ($lines !== []) {
                $order->recalculateTotals();
                $this->fireIfAsked($order, $bills);
            }

            return $order;
        });

        return new OrderResource($record->refresh()->load(['items', 'waiter'])->loadCount(['items']));
    }

    /**
     * An order the caller opened as `placed` goes to the kitchen.
     *
     * The intake screen's button says *"Oshxonaga yuborish"* and it has to mean
     * it. Writing the row with `status = placed` and stopping there produced a
     * bill that reads "sent" with no docket on any pass — the exact failure
     * `EloquentBillRegistry::send()` documents about firing having once been two
     * calls: *"a tablet that lost signal between them left a bill reading 'sent'
     * with nothing on any pass, and the first anybody knew was a guest asking
     * where their food was."*
     *
     * Through the registry rather than `TicketWriter` directly, because that is
     * where the rule lives about what firing means — the ladder, the dockets and
     * the transaction around both. It is the same call the till makes.
     *
     * Only for an order with lines — `send()` refuses an empty bill, and a
     * refusal here would turn "I opened a tab" into a 422 — and inside the same
     * transaction as the write above, so the pair is the one `send()` already
     * argues for: both or neither. An order that could not be fired must not
     * exist, or an operator has read a total back to a guest for food no cook
     * will ever see.
     */
    private function fireIfAsked(Order $order, BillRegistry $bills): void
    {
        if ($order->status !== 'placed') {
            return;
        }

        $bills->send((int) $order->getKey());
    }

    /**
     * One line, priced and named from the catalogue.
     *
     * The same three refusals `addItem()` makes, and deliberately the same
     * order: a dish that does not exist, then a dish that is off. A basket that
     * silently dropped an unavailable dish would send a cook two thirds of an
     * order and hand the guest a smaller bill than the one they agreed to on
     * the telephone.
     *
     * @param  array{menu_item_id: int, quantity: int, note?: string|null}  $line
     */
    private function writeLine(Order $order, array $line, MenuCatalog $menu): void
    {
        $dish = $menu->find((int) $line['menu_item_id']);

        if ($dish === null) {
            throw ApiException::of('order.item_not_found', field: 'items');
        }

        if (! $dish->isOrderable) {
            throw ApiException::of('stop_list.item_unavailable', field: 'items');
        }

        $quantity = (int) $line['quantity'];

        $order->items()->create([
            'menu_item_id' => $dish->id,
            'sku' => $dish->sku,
            'title' => $dish->title,
            'station' => $dish->station,
            'quantity' => $quantity,
            'unit_price' => $dish->price,
            'total_price' => $dish->price * $quantity,
            'status' => 'pending',
            'note' => $line['note'] ?? null,
        ]);
    }

    public function show(Order $order): OrderResource
    {
        return new OrderResource($order->load(['items', 'waiter'])->loadCount(['items']));
    }

    public function update(UpdateOrderRequest $request, Order $order): OrderResource
    {
        $order->update($request->validated());

        return new OrderResource($order->refresh()->load(['items', 'waiter'])->loadCount(['items']));
    }

    public function destroy(Order $order): Response
    {
        $order->delete();

        return response()->noContent();
    }

    /**
     * Add a dish to the bill.
     *
     * The price, name, SKU and station are copied from the Menu at this moment
     * and stored on the line. Repricing the menu tomorrow must never change
     * what a guest was charged today.
     */
    public function addItem(Request $request, Order $order, MenuCatalog $menu): OrderItemResource
    {
        if (! $order->is_open) {
            throw ApiException::of('order.closed');
        }

        $validated = $request->validate([
            // Existence is checked through the Menu contract rather than a
            // database `exists` rule: Orders must not know the name of another
            // module's table, and the contract already answers per restaurant.
            'menu_item_id' => ['required', 'integer'],
            'quantity' => ['required', 'integer', 'min:1', 'max:99'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $dish = $menu->find((int) $validated['menu_item_id']);

        if ($dish === null) {
            throw ApiException::of('order.item_not_found', field: 'menu_item_id');
        }

        if (! $dish->isOrderable) {
            throw ApiException::of('stop_list.item_unavailable', field: 'menu_item_id');
        }

        $quantity = (int) $validated['quantity'];

        $item = $order->items()->create([
            'menu_item_id' => $dish->id,
            'sku' => $dish->sku,
            'title' => $dish->title,
            'station' => $dish->station,
            'quantity' => $quantity,
            'unit_price' => $dish->price,
            'total_price' => $dish->price * $quantity,
            'status' => 'pending',
            'note' => $validated['note'] ?? null,
        ]);

        $order->recalculateTotals();

        return new OrderItemResource($item);
    }

    /** Remove a line and re-derive the bill. */
    public function removeItem(Order $order, OrderItem $item): Response
    {
        if (! $order->is_open) {
            throw ApiException::of('order.closed');
        }

        abort_unless($item->order_id === $order->id, 404);

        $item->delete();
        $order->recalculateTotals();

        return response()->noContent();
    }

    public function changeStatus(Request $request, Order $order): OrderResource
    {
        $validated = $request->validate([
            'status' => ['required', Rule::in(Order::STATUSES)],
        ]);

        $from = $order->status;

        if (! $order->transitionTo($validated['status'])) {
            // `from` and `to` ride along so a client can say which move was
            // refused without a second round trip — the offline queue shows
            // exactly this pair on a conflict card.
            throw ApiException::of('order.invalid_transition', field: 'status', meta: [
                'from' => $from,
                'to' => $validated['status'],
            ]);
        }

        return new OrderResource($order->refresh()->load(['items', 'waiter']));
    }

    public function cancel(Request $request, Order $order): OrderResource
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
        ]);

        if (! $order->cancel($validated['reason'])) {
            throw ApiException::of('order.closed');
        }

        return new OrderResource($order->refresh());
    }
}
