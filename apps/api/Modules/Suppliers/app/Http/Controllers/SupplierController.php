<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Suppliers\Http\Requests\StoreSupplierRequest;
use Modules\Suppliers\Http\Requests\UpdateSupplierRequest;
use Modules\Suppliers\Http\Resources\SupplierResource;
use Modules\Suppliers\Models\Supplier;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for suppliers.
 *
 * Mounted under /api/v1/suppliers/suppliers and gated by Spatie permission
 * middleware on the route definition (Modules/Suppliers/routes/api.php).
 */
final class SupplierController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Supplier::class)
            ->allowedFilters([
                AllowedFilter::exact('code'),
                AllowedFilter::exact('is_active'),
                AllowedFilter::partial('name'),
                AllowedFilter::callback('in_debt', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->inDebt();
                    }
                }),
            ])
            ->allowedSorts(['code', 'name', 'rating', 'debt', 'created_at'])
            ->allowedIncludes(['purchaseOrders'])
            ->defaultSort('name')
            ->paginate($perPage)
            ->withQueryString();

        return SupplierResource::collection($records);
    }

    public function store(StoreSupplierRequest $request): SupplierResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = Supplier::create($request->validated())->refresh();

        return new SupplierResource($record->load('purchaseOrders'));
    }

    public function show(Supplier $supplier): SupplierResource
    {
        return new SupplierResource($supplier->load('purchaseOrders'));
    }

    public function update(UpdateSupplierRequest $request, Supplier $supplier): SupplierResource
    {
        $supplier->update($request->validated());

        return new SupplierResource($supplier->refresh()->load('purchaseOrders'));
    }

    public function destroy(Supplier $supplier): Response
    {
        $supplier->delete();

        return response()->noContent();
    }
}
