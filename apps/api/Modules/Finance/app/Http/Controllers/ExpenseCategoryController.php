<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Modules\Finance\Http\Requests\StoreExpenseCategoryRequest;
use Modules\Finance\Http\Requests\UpdateExpenseCategoryRequest;
use Modules\Finance\Http\Resources\ExpenseCategoryResource;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\ExpenseCategory;

/**
 * The headings a restaurant files its money under.
 *
 * Mounted under /api/v1/finance/expense-categories.
 *
 * ---------------------------------------------------------------------------
 * The eight built-ins are shown whether or not they have rows
 *
 * `Expense::CATEGORIES` is a PHP constant the till writes against, so those
 * eight headings exist for every restaurant on the platform from the first
 * evening. A list that showed only what somebody had explicitly created would
 * show an empty ledger to a restaurant whose expenses are all filed under `rent`
 * and `purchase` — and invite it to create `rent` a second time.
 *
 * So the eight are synthesised into the list with `id: null`, the same
 * arrangement `PaymentMethodController` uses and for the same reason: a GET must
 * not write rows, and the first PATCH is what materialises one.
 *
 * ---------------------------------------------------------------------------
 * Counts, and what they are for
 *
 * `?with_counts=1` attaches how many entries sit under each heading and what
 * they come to. It is off by default because it is two aggregates over the
 * fastest-growing table in the module and only one screen needs them — but that
 * screen needs them badly: the delete guard is measured against the count, and
 * "delete" on a heading with three years of rent behind it has to become
 * "archive" rather than a confirmation dialog nobody reads.
 */
final class ExpenseCategoryController extends Controller
{
    /**
     * @return array<string, mixed>
     */
    public function index(Request $request): array
    {
        $direction = $request->string('direction')->toString();
        $withCounts = $request->boolean('with_counts');

        $rows = ExpenseCategory::query()
            ->when($direction !== '', fn ($query) => $query->ofDirection($direction))
            ->ordered()
            ->get();

        // Null rather than an empty array: a restaurant with no expenses at
        // all still asked for counts, and every heading has to come back
        // reading zero rather than reading nothing.
        $totals = $withCounts ? $this->totalsByCategory() : null;

        $configured = $rows->keyBy(fn (ExpenseCategory $row): string => $row->direction.':'.$row->code);

        $out = [];

        // Money out first — the eight built-ins in their declared order, then
        // anything the restaurant added, then income.
        if ($direction === '' || $direction === 'out') {
            foreach (Expense::CATEGORIES as $position => $code) {
                $row = $configured->get('out:'.$code);

                $out[] = $row instanceof ExpenseCategory
                    ? $this->present($row, $request, $totals)
                    : $this->builtIn($code, $position, $totals);
            }
        }

        foreach ($rows as $row) {
            $isBuiltIn = $row->direction === 'out' && in_array($row->code, Expense::CATEGORIES, true);

            if (! $isBuiltIn) {
                $out[] = $this->present($row, $request, $totals);
            }
        }

        return ['data' => $out];
    }

    public function store(StoreExpenseCategoryRequest $request): ExpenseCategoryResource
    {
        $record = ExpenseCategory::create($request->validated() + ['direction' => $request->input('direction', 'out')])
            ->refresh();

        return new ExpenseCategoryResource($record);
    }

    /**
     * Rename, reorder, archive or restore a heading.
     *
     * Bound by `{code}` rather than by an id, so a screen can edit one of the
     * eight built-ins that has no row yet — the first write materialises it. The
     * direction rides in the query string because a code is only unique within
     * one: a restaurant may have `other` on both sides of its ledger.
     */
    public function update(UpdateExpenseCategoryRequest $request, string $code): JsonResponse
    {
        $direction = $request->query('direction') === 'in' ? 'in' : 'out';
        $builtIn = $direction === 'out' && in_array($code, Expense::CATEGORIES, true);

        $record = ExpenseCategory::query()->where('code', $code)->ofDirection($direction)->first();

        if ($record === null) {
            if (! $builtIn) {
                throw ApiException::of('finance.unknown_expense_category', meta: ['category' => $code]);
            }

            $record = ExpenseCategory::create([
                'code' => $code,
                // `$builtIn` is true here, which means `$code` is one of the
                // eight — so the lookup cannot miss.
                'name' => ExpenseCategory::SYSTEM_NAMES[$code],
                'direction' => 'out',
                'is_system' => true,
                'position' => (int) array_search($code, Expense::CATEGORIES, true),
            ]);
        }

        $fields = $request->safe()->except('is_archived');

        if ($request->has('is_archived')) {
            if ($request->boolean('is_archived') && $record->is_system) {
                // The till writes these by name — `EloquentTillLedger::refund()`
                // books a `refund` at closing time, in the room, at midnight. A
                // restaurant that archived it would find that out then.
                throw ApiException::of('finance.category_is_system', meta: ['category' => $code]);
            }

            $fields['archived_at'] = $request->boolean('is_archived') ? now() : null;
        }

        $record->update($fields);

        // 200 even when this write materialised the row — the same reasoning as
        // `PaymentMethodController::update()`.
        return (new ExpenseCategoryResource($record->refresh()))
            ->response()
            ->setStatusCode(Response::HTTP_OK);
    }

    /**
     * Remove a heading nobody has used.
     *
     * A heading with entries behind it is archived instead, and the refusal is
     * the feature rather than a safety rail: deleting it would leave those rows
     * pointing at a code nothing can name, and a P&L reading "1 240 000 so'm,
     * unknown" is worse than one reading "Reklama (arxiv)".
     */
    public function destroy(ExpenseCategory $expenseCategory): Response
    {
        if ($expenseCategory->is_system) {
            throw ApiException::of('finance.category_is_system', meta: ['category' => $expenseCategory->code]);
        }

        $used = Expense::query()->ofCategory($expenseCategory->code)->exists();

        if ($used) {
            throw ApiException::of('finance.category_in_use', meta: ['category' => $expenseCategory->code]);
        }

        $expenseCategory->delete();

        return response()->noContent();
    }

    // ============ Internals ============

    /**
     * How much has been filed under each heading, this trading year.
     *
     * Windowed rather than all-time, and the window is the year the venue is
     * trading in: an all-time sum on a five-year-old restaurant is a number
     * nobody can check against anything, and the panel beside it is about what
     * the restaurant is spending now.
     *
     * @return array<string, array{count: int, total: int}>
     */
    private function totalsByCategory(): array
    {
        $from = substr(app(BusinessDay::class)->dateFor(), 0, 4).'-01-01';

        /** @var array<int, object{category: string, entries: int, total: int}> $rows */
        $rows = Expense::query()
            // Ranged on the stamped trading day, never `whereYear()` — that
            // wraps the column in a function and PostgreSQL drops the index.
            ->where('business_date', '>=', $from)
            ->toBase()
            ->select('category')
            ->selectRaw('count(*) as entries, coalesce(sum(amount), 0) as total')
            ->groupBy('category')
            ->get()
            ->all();

        $totals = [];

        foreach ($rows as $row) {
            $totals[$row->category] = ['count' => (int) $row->entries, 'total' => (int) $row->total];
        }

        return $totals;
    }

    /**
     * @param array<string, array{count: int, total: int}>|null $totals
     *
     * @return array<string, mixed>
     */
    private function present(ExpenseCategory $row, Request $request, ?array $totals): array
    {
        $payload = (new ExpenseCategoryResource($row))->toArray($request);

        if ($totals !== null) {
            $payload['entries_count'] = $totals[$row->code]['count'] ?? 0;
            $payload['entries_total'] = $totals[$row->code]['total'] ?? 0;
        }

        return $payload;
    }

    /**
     * One of the eight, for a restaurant that has never edited it.
     *
     * @param array<string, array{count: int, total: int}>|null $totals
     *
     * @return array<string, mixed>
     */
    private function builtIn(string $code, int $position, ?array $totals): array
    {
        $row = [
            'id' => null,
            'code' => $code,
            // `$code` is one of the eight by construction — the caller loops
            // `Expense::CATEGORIES` — so the lookup cannot miss.
            'name' => ExpenseCategory::SYSTEM_NAMES[$code],
            'title' => ExpenseCategory::SYSTEM_NAMES[$code]['uz'],
            'direction' => 'out',
            'is_system' => true,
            'position' => $position,
            'archived_at' => null,
            'created_at' => null,
            'updated_at' => null,
        ];

        if ($totals !== null) {
            $row['entries_count'] = $totals[$code]['count'] ?? 0;
            $row['entries_total'] = $totals[$code]['total'] ?? 0;
        }

        return $row;
    }
}
