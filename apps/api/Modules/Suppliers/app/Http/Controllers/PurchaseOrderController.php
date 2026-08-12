<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Modules\Inventory\Models\Ingredient;
use Modules\Suppliers\Http\Requests\StorePurchaseOrderRequest;
use Modules\Suppliers\Http\Requests\UpdatePurchaseOrderRequest;
use Modules\Suppliers\Http\Resources\PurchaseOrderItemResource;
use Modules\Suppliers\Http\Resources\PurchaseOrderResource;
use Modules\Suppliers\Models\PurchaseOrder;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for purchase orders.
 *
 * Mounted under /api/v1/suppliers/purchase-orders and gated by Spatie permission
 * middleware on the route definition (Modules/Suppliers/routes/api.php).
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

    public function store(StorePurchaseOrderRequest $request): PurchaseOrderResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = PurchaseOrder::create($request->validated())->refresh();

        return new PurchaseOrderResource($record->load('supplier'));
    }

    public function show(PurchaseOrder $purchaseOrder): PurchaseOrderResource
    {
        return new PurchaseOrderResource($purchaseOrder->load('supplier'));
    }

    public function update(UpdatePurchaseOrderRequest $request, PurchaseOrder $purchaseOrder): PurchaseOrderResource
    {
        $purchaseOrder->update($request->validated());

        return new PurchaseOrderResource($purchaseOrder->refresh()->load('supplier'));
    }

    public function destroy(PurchaseOrder $purchaseOrder): Response
    {
        $purchaseOrder->delete();

        return response()->noContent();
    }

    /** Add a line and re-derive the order total. */
    public function addItem(Request $request, PurchaseOrder $purchaseOrder): PurchaseOrderItemResource
    {
        abort_if($purchaseOrder->status === 'received', 422, 'Qabul qilingan arizani o\'zgartirib bo\'lmaydi.');

        $validated = $request->validate([
            'ingredient_id' => ['nullable', 'integer', 'exists:ingredients,id'],
            'name' => ['required', 'string', 'max:160'],
            'quantity' => ['required', 'integer', 'min:1'],
            'unit_price' => ['required', 'integer', 'min:0'],
        ]);

        $item = $purchaseOrder->items()->create([
            'ingredient_id' => $validated['ingredient_id'] ?? null,
            'name' => $validated['name'],
            'quantity' => (int) $validated['quantity'],
            'unit_price' => (int) $validated['unit_price'],
            'total_price' => (int) $validated['quantity'] * (int) $validated['unit_price'],
        ]);

        $purchaseOrder->recalculateTotal();

        return new PurchaseOrderItemResource($item);
    }

    /**
     * Receive the delivery.
     *
     * This is the only place a purchase turns into stock: each line with a
     * known ingredient produces a receipt movement, and the supplier's debt
     * grows by the order total if they are not paid on delivery. Receiving
     * twice is refused — otherwise one clumsy tap doubles the whole store.
     */
    public function receive(PurchaseOrder $purchaseOrder): PurchaseOrderResource
    {
        abort_if($purchaseOrder->status === 'received', 422, 'Bu ariza allaqachon qabul qilingan.');
        abort_if($purchaseOrder->status === 'cancelled', 422, 'Bekor qilingan arizani qabul qilib bo\'lmaydi.');

        DB::transaction(function () use ($purchaseOrder): void {
            foreach ($purchaseOrder->items as $line) {
                if ($line->ingredient_id === null) {
                    continue;
                }

                $ingredient = Ingredient::query()->find($line->ingredient_id);
                $ingredient?->move('receipt', $line->quantity, null, $purchaseOrder->number);
            }

            $purchaseOrder->update(['status' => 'received', 'received_at' => now()]);

            $supplier = $purchaseOrder->supplier;
            if ($supplier !== null && $supplier->payment_terms_days > 0) {
                $supplier->forceFill(['debt' => $supplier->debt + $purchaseOrder->total])->save();
            }
        });

        return new PurchaseOrderResource($purchaseOrder->refresh()->load(['supplier', 'items']));
    }
}
