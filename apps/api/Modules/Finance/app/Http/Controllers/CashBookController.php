<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Http\Request;
use Modules\Finance\Http\Requests\StoreCashTransferRequest;
use Modules\Finance\Http\Resources\CashAccountResource;
use Modules\Finance\Models\CashAccount;
use Modules\Finance\Services\CashBook;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * Every movement of money in one window, in one list.
 *
 * Mounted under /api/v1/finance/cash-book.
 *
 * The rows live in three tables and neither of the two that had routes accepted
 * a date range, so a month's ledger could only be assembled by paging the whole
 * history into a browser and bucketing it there. See `CashBook` for the
 * arithmetic and for why a transfer is written as a linked pair.
 *
 * ---------------------------------------------------------------------------
 * The window is bounded, and the bound is 92 days
 *
 * A quarter, which is the longest window the ledger screen offers. The limit is
 * not politeness: this read touches the three fastest-growing tables in the
 * module, and an unbounded `from` on a five-year-old restaurant is a full scan
 * of all three behind a request nobody cancelled.
 */
final class CashBookController extends Controller
{
    private const MAX_DAYS = 92;

    public function __construct(
        private readonly CashBook $book,
        private readonly BusinessDay $businessDay,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function index(Request $request): array
    {
        $today = $this->businessDay->dateFor();

        $to = $this->dateOr($request->string('to')->toString(), $today);
        // A month back, because that is what the ledger screen opens on. Derived
        // from `$to` rather than from today, so `?to=` alone asks a coherent
        // question instead of an empty one.
        $from = $this->dateOr($request->string('from')->toString(), substr($to, 0, 8).'01');

        if ($from > $to) {
            throw ApiException::of('finance.window_backwards', meta: ['from' => $from, 'to' => $to]);
        }

        if ($this->daysBetween($from, $to) > self::MAX_DAYS) {
            throw ApiException::of('finance.window_too_wide', meta: ['max_days' => self::MAX_DAYS]);
        }

        $branch = $request->has('branch') ? $request->integer('branch') : null;

        return $this->book->between($from, $to, $branch);
    }

    /**
     * Where money sits when it is not in a till.
     *
     * On the same controller as the ledger rather than a resource of its own,
     * because the two are one screen: the account list is what the ledger's
     * filter chips are built from, and a second endpoint would be a second
     * round trip to draw one table.
     *
     * @return array<string, mixed>
     */
    public function accounts(Request $request): array
    {
        $records = QueryBuilder::for(CashAccount::class)
            ->allowedFilters([
                AllowedFilter::exact('kind'),
                AllowedFilter::exact('branch', 'branch_id'),
                AllowedFilter::scope('active'),
            ])
            ->defaultSort('code')
            ->allowedSorts(['code', 'kind'])
            ->get();

        return ['data' => CashAccountResource::collection($records)->toArray($request)];
    }

    /**
     * Move money from one place to another.
     *
     * Two rows, one transaction, pointing at each other. A one-legged transfer
     * was what the till could already do and what made a profitable night read
     * as a loss — see `CashBook::transfer()`.
     *
     * @return array<string, mixed>
     */
    public function transfer(StoreCashTransferRequest $request): array
    {
        [$out, $in] = $this->book->transfer(
            source: [
                'shift' => $request->input('from_shift_id'),
                'account' => $request->input('from_account_id'),
            ],
            destination: [
                'shift' => $request->input('to_shift_id'),
                'account' => $request->input('to_account_id'),
            ],
            amount: $request->integer('amount'),
            reason: $request->string('reason')->toString(),
            userId: $request->user()?->getAuthIdentifier(),
        );

        return [
            'data' => [
                'out' => ['id' => $out->id, 'amount' => $out->amount, 'counterpart_id' => $out->counterpart_id],
                'in' => ['id' => $in->id, 'amount' => $in->amount, 'counterpart_id' => $in->counterpart_id],
            ],
        ];
    }

    // ============ Internals ============

    private function dateOr(string $value, string $fallback): string
    {
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) === 1 ? $value : $fallback;
    }

    private function daysBetween(string $from, string $to): int
    {
        $start = strtotime($from);
        $end = strtotime($to);

        return $start === false || $end === false ? 0 : intdiv($end - $start, 86_400);
    }
}
