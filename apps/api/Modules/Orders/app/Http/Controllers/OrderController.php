<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Controllers;

use App\Contracts\Menu\MenuCatalog;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
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

        $records = QueryBuilder::for(Order::class)
            ->allowedFilters([
                AllowedFilter::exact('number'),
                AllowedFilter::exact('status'),
                AllowedFilter::exact('channel'),
                AllowedFilter::exact('table', 'restaurant_table_id'),
                AllowedFilter::exact('waiter', 'waiter_user_id'),
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
            ->allowedSorts(['number', 'total', 'placed_at', 'created_at'])
            ->allowedIncludes(['items'])
            ->withCount(['items'])
            ->defaultSort('-created_at')
            ->paginate($perPage)
            ->withQueryString();

        return OrderResource::collection($records);
    }

    public function store(StoreOrderRequest $request): OrderResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = Order::create($request->validated())->refresh();

        return new OrderResource($record->load('items')->loadCount(['items']));
    }

    public function show(Order $order): OrderResource
    {
        return new OrderResource($order->load('items')->loadCount(['items']));
    }

    public function update(UpdateOrderRequest $request, Order $order): OrderResource
    {
        $order->update($request->validated());

        return new OrderResource($order->refresh()->load('items')->loadCount(['items']));
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
            abort(422, "Yopilgan buyurtmaga taom qo'shib bo'lmaydi.");
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
            abort(422, 'Bunday taom menyuda yo\'q.');
        }

        if (! $dish->isOrderable) {
            abort(422, 'Bu taom hozir sotuvda yo\'q (stop-list).');
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
            abort(422, "Yopilgan buyurtmadan taom o'chirib bo'lmaydi.");
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

        if (! $order->transitionTo($validated['status'])) {
            abort(422, "Bu holatga o'tish mumkin emas.");
        }

        return new OrderResource($order->refresh()->load('items'));
    }

    public function cancel(Request $request, Order $order): OrderResource
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
        ]);

        if (! $order->cancel($validated['reason'])) {
            abort(422, 'Yopilgan buyurtmani bekor qilib bo\'lmaydi.');
        }

        return new OrderResource($order->refresh());
    }
}
