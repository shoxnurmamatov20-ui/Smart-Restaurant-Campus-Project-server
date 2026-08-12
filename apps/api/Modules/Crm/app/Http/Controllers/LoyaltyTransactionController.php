<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Crm\Http\Requests\StoreLoyaltyTransactionRequest;
use Modules\Crm\Http\Requests\UpdateLoyaltyTransactionRequest;
use Modules\Crm\Http\Resources\LoyaltyTransactionResource;
use Modules\Crm\Models\LoyaltyTransaction;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for loyalty transactions.
 *
 * Mounted under /api/v1/crm/loyalty and gated by Spatie permission
 * middleware on the route definition (Modules/Crm/routes/api.php).
 */
final class LoyaltyTransactionController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(LoyaltyTransaction::class)
            ->allowedFilters([
                AllowedFilter::exact('customer', 'customer_id'),
                AllowedFilter::exact('kind'),
            ])
            ->allowedSorts(['created_at', 'points'])
            ->allowedIncludes(['customer'])
            ->defaultSort('-created_at')
            ->paginate($perPage)
            ->withQueryString();

        return LoyaltyTransactionResource::collection($records);
    }

    public function store(StoreLoyaltyTransactionRequest $request): LoyaltyTransactionResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = LoyaltyTransaction::create($request->validated())->refresh();

        return new LoyaltyTransactionResource($record->load('customer'));
    }

    public function show(LoyaltyTransaction $transaction): LoyaltyTransactionResource
    {
        return new LoyaltyTransactionResource($transaction->load('customer'));
    }

    public function update(UpdateLoyaltyTransactionRequest $request, LoyaltyTransaction $transaction): LoyaltyTransactionResource
    {
        $transaction->update($request->validated());

        return new LoyaltyTransactionResource($transaction->refresh()->load('customer'));
    }

    public function destroy(LoyaltyTransaction $transaction): Response
    {
        $transaction->delete();

        return response()->noContent();
    }
}
