<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Finance\Http\Requests\StoreExpenseRequest;
use Modules\Finance\Http\Requests\UpdateExpenseRequest;
use Modules\Finance\Http\Resources\ExpenseResource;
use Modules\Finance\Models\Expense;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for expenses.
 *
 * Mounted under /api/v1/finance/expenses and gated by Spatie permission
 * middleware on the route definition (Modules/Finance/routes/api.php).
 */
final class ExpenseController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Expense::class)
            ->allowedFilters([
                AllowedFilter::exact('category'),
                AllowedFilter::exact('shift', 'cash_shift_id'),
                AllowedFilter::exact('paid_in_cash'),
            ])
            ->allowedSorts(['spent_at', 'amount', 'created_at'])
            ->defaultSort('-spent_at')
            ->paginate($perPage)
            ->withQueryString();

        return ExpenseResource::collection($records);
    }

    public function store(StoreExpenseRequest $request): ExpenseResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = Expense::create($request->validated())->refresh();

        return new ExpenseResource($record);
    }

    public function show(Expense $expense): ExpenseResource
    {
        return new ExpenseResource($expense);
    }

    public function update(UpdateExpenseRequest $request, Expense $expense): ExpenseResource
    {
        $expense->update($request->validated());

        return new ExpenseResource($expense->refresh());
    }

    public function destroy(Expense $expense): Response
    {
        $expense->delete();

        return response()->noContent();
    }
}
