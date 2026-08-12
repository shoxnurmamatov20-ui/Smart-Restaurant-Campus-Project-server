<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Orders\Http\Requests\StoreOrderItemRequest;
use Modules\Orders\Http\Requests\UpdateOrderItemRequest;
use Modules\Orders\Http\Resources\OrderItemResource;
use Modules\Orders\Models\OrderItem;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for order lines.
 *
 * Mounted under /api/v1/orders/items and gated by Spatie permission
 * middleware on the route definition (Modules/Orders/routes/api.php).
 */
final class OrderItemController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(OrderItem::class)
            ->allowedFilters([
                AllowedFilter::exact('order', 'order_id'),
                AllowedFilter::exact('station'),
                AllowedFilter::exact('status'),
                AllowedFilter::exact('sku'),
            ])
            ->allowedSorts(['created_at', 'station', 'quantity'])
            ->defaultSort('created_at')
            ->paginate($perPage)
            ->withQueryString();

        return OrderItemResource::collection($records);
    }

    public function store(StoreOrderItemRequest $request): OrderItemResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = OrderItem::create($request->validated())->refresh();

        return new OrderItemResource($record);
    }

    public function show(OrderItem $item): OrderItemResource
    {
        return new OrderItemResource($item);
    }

    public function update(UpdateOrderItemRequest $request, OrderItem $item): OrderItemResource
    {
        $item->update($request->validated());

        return new OrderItemResource($item->refresh());
    }

    public function destroy(OrderItem $item): Response
    {
        $item->delete();

        return response()->noContent();
    }
}
