<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Suppliers\Http\Requests\StorePurchaseOrderItemRequest;
use Modules\Suppliers\Http\Requests\UpdatePurchaseOrderItemRequest;
use Modules\Suppliers\Http\Resources\PurchaseOrderItemResource;
use Modules\Suppliers\Models\PurchaseOrderItem;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for purchase order lines.
 *
 * Mounted under /api/v1/suppliers/purchase-order-items and gated by Spatie permission
 * middleware on the route definition (Modules/Suppliers/routes/api.php).
 */
final class PurchaseOrderItemController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(PurchaseOrderItem::class)
            ->allowedFilters([
                AllowedFilter::exact('purchase_order', 'purchase_order_id'),
                AllowedFilter::exact('ingredient', 'ingredient_id'),
            ])
            ->allowedSorts(['created_at', 'quantity'])
            ->defaultSort('created_at')
            ->paginate($perPage)
            ->withQueryString();

        return PurchaseOrderItemResource::collection($records);
    }

    public function store(StorePurchaseOrderItemRequest $request): PurchaseOrderItemResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = PurchaseOrderItem::create($request->validated())->refresh();

        return new PurchaseOrderItemResource($record);
    }

    public function show(PurchaseOrderItem $item): PurchaseOrderItemResource
    {
        return new PurchaseOrderItemResource($item);
    }

    public function update(UpdatePurchaseOrderItemRequest $request, PurchaseOrderItem $item): PurchaseOrderItemResource
    {
        $item->update($request->validated());

        return new PurchaseOrderItemResource($item->refresh());
    }

    public function destroy(PurchaseOrderItem $item): Response
    {
        $item->delete();

        return response()->noContent();
    }
}
