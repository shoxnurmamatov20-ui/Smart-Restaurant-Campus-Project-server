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

        $query = QueryBuilder::for(Expense::class)
            ->allowedFilters([
                AllowedFilter::exact('category'),
                AllowedFilter::exact('shift', 'cash_shift_id'),
                AllowedFilter::exact('paid_in_cash'),
                /*
                 * `?filter[unpaid]=1` — what the restaurant has filed and not
                 * yet settled. Through the model's own scope, so "unpaid" means
                 * the same thing here as it does to the books screen's chip.
                 */
                AllowedFilter::callback('unpaid', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->unpaid();
                    }
                }),
                AllowedFilter::callback('from', function ($query, $value): void {
                    // On the trading day, never `whereDate()` — see
                    // PaymentController::index() for both halves of the reason.
                    $query->where('business_date', '>=', $value);
                }),
                AllowedFilter::callback('to', function ($query, $value): void {
                    $query->where('business_date', '<=', $value);
                }),
            ]);

        // Before the sort: see PaymentController::index() — a clone taken after
        // `paginate()` carries the ordering into an aggregate.
        $totals = $this->windowTotals($query);

        $records = $query
            ->allowedSorts(['spent_at', 'amount', 'created_at'])
            ->defaultSort('-spent_at')
            ->paginate($perPage)
            ->withQueryString();

        return ExpenseResource::collection($records)->additional(['meta' => $totals]);
    }

    /**
     * What the filtered window came to, and how much of it is still owed.
     *
     * Over the query the page came from rather than over the page: the books
     * screen draws fifty rows and states the month's spend above them, and a
     * total summed from fifty rows of a busier month is a smaller number that
     * looks exactly as authoritative.
     *
     * @param QueryBuilder<Expense> $query
     *
     * @return array{total_tiyin: int, unpaid_tiyin: int, unpaid_count: int}
     */
    private function windowTotals(QueryBuilder $query): array
    {
        $row = $query->clone()
            ->toBase()
            ->selectRaw('coalesce(sum(amount), 0)::bigint as total')
            ->selectRaw('coalesce(sum(case when paid_at is null then amount else 0 end), 0)::bigint as unpaid')
            ->selectRaw('count(case when paid_at is null then 1 end)::bigint as unpaid_count')
            ->first();

        return [
            'total_tiyin' => (int) ($row->total ?? 0),
            'unpaid_tiyin' => (int) ($row->unpaid ?? 0),
            'unpaid_count' => (int) ($row->unpaid_count ?? 0),
        ];
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
