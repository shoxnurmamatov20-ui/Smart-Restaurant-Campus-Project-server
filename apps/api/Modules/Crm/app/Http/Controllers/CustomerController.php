<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Modules\Crm\Http\Requests\StoreCustomerRequest;
use Modules\Crm\Http\Requests\UpdateCustomerRequest;
use Modules\Crm\Http\Resources\CustomerResource;
use Modules\Crm\Http\Resources\LoyaltyTransactionResource;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\LoyaltyTransaction;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for customers.
 *
 * Mounted under /api/v1/crm/customers and gated by Spatie permission
 * middleware on the route definition (Modules/Crm/routes/api.php).
 */
final class CustomerController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Customer::class)
            ->allowedFilters([
                AllowedFilter::exact('phone'),
                AllowedFilter::exact('tier'),
                AllowedFilter::exact('is_active'),
                AllowedFilter::partial('name'),
                AllowedFilter::callback('birthday_today', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->birthdayToday();
                    }
                }),
            ])
            ->allowedSorts(['name', 'points', 'total_spent', 'visits_count', 'created_at'])
            ->allowedIncludes(['loyaltyTransactions', 'feedbacks'])
            ->defaultSort('-total_spent')
            ->paginate($perPage)
            ->withQueryString();

        return CustomerResource::collection($records);
    }

    public function store(StoreCustomerRequest $request): CustomerResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = Customer::create($request->validated())->refresh();

        return new CustomerResource($record->load('loyaltyTransactions'));
    }

    public function show(Customer $customer): CustomerResource
    {
        return new CustomerResource($customer->load('loyaltyTransactions'));
    }

    public function update(UpdateCustomerRequest $request, Customer $customer): CustomerResource
    {
        $customer->update($request->validated());

        return new CustomerResource($customer->refresh()->load('loyaltyTransactions'));
    }

    public function destroy(Customer $customer): Response
    {
        $customer->delete();

        return response()->noContent();
    }

    /** Earn or redeem loyalty points. */
    public function adjustPoints(Request $request, Customer $customer): JsonResponse
    {
        $validated = $request->validate([
            'kind' => ['required', Rule::in(LoyaltyTransaction::KINDS)],
            'points' => ['required', 'integer', 'min:1'],
            'order_id' => ['nullable', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $transaction = $customer->adjustPoints(
            $validated['kind'],
            (int) $validated['points'],
            $validated['order_id'] ?? null,
            $validated['note'] ?? null,
        );

        abort_if($transaction === null, 422, 'Mijozda yetarli bonus yo\'q.');

        return response()->json([
            'transaction' => new LoyaltyTransactionResource($transaction),
            'customer' => new CustomerResource($customer->refresh()),
        ], 201);
    }
}
