<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Finance\Http\Requests\StorePaymentRequest;
use Modules\Finance\Http\Requests\UpdatePaymentRequest;
use Modules\Finance\Http\Resources\PaymentResource;
use Modules\Finance\Models\Payment;
use Modules\Finance\Services\EloquentTillLedger;
use RuntimeException;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for payments.
 *
 * Mounted under /api/v1/finance/payments and gated by Spatie permission
 * middleware on the route definition (Modules/Finance/routes/api.php).
 */
final class PaymentController extends Controller
{
    private const MAX_PER_PAGE = 100;

    /**
     * The payments a reader asked for, and what the whole window came to.
     *
     * ---------------------------------------------------------------------
     * Why the window is `business_date` and not `paid_at`
     *
     * A restaurant's day runs 06:00 → 06:00 (DECISIONS Q3), so a bill settled
     * at 01:30 belongs to the evening that is still finishing. `business_date`
     * was stamped on the row at capture from the venue's own boundary; a range
     * on `paid_at` would move that payment into the next calendar day — and
     * into the next MONTH twelve times a year, which is the one place a
     * finance screen must agree with the Z-report a cashier signed.
     *
     * A plain `between`, never `whereDate()`: wrapping the column in a
     * function loses the index and `ModuleBoundaryTest` refuses it by name.
     *
     * ---------------------------------------------------------------------
     * Why the totals ride in the meta
     *
     * The console's finance screen wants one figure — what was refunded this
     * month — and a page of rows cannot answer it: a month of takings is
     * thousands of payments and summing the first twenty-five is a wrong
     * number that looks right. The totals are computed over the SAME filtered
     * query the page came from, so they can never describe a different window
     * from the rows beside them.
     */
    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $query = QueryBuilder::for(Payment::class)
            ->allowedFilters([
                AllowedFilter::exact('method'),
                AllowedFilter::exact('status'),
                AllowedFilter::exact('shift', 'cash_shift_id'),
                AllowedFilter::exact('order', 'order_id'),
                AllowedFilter::callback('from', function ($query, $value): void {
                    $query->where('business_date', '>=', $value);
                }),
                AllowedFilter::callback('to', function ($query, $value): void {
                    $query->where('business_date', '<=', $value);
                }),
                /*
                 * Reversed money, which is not a status.
                 *
                 * `status` stays `captured` on a refunded payment — the money
                 * WAS taken, and a row that rewrote its own history would take
                 * the takings it belongs to with it. What changes is
                 * `refunded_at`, so that is what this asks about.
                 */
                AllowedFilter::callback('refunded', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->whereNotNull('refunded_at');
                    }
                }),
            ]);

        /*
         * Totalled BEFORE the sort and the page are applied.
         *
         * Spatie mutates one subject: `paginate()` is what applies
         * `defaultSort`, and a clone taken after it inherits `order by paid_at`
         * — which PostgreSQL rejects on an aggregate with no GROUP BY. The
         * ordering is presentation and has no business in a sum.
         */
        $totals = $this->windowTotals($query);

        $records = $query
            ->allowedSorts(['paid_at', 'amount', 'created_at'])
            ->allowedIncludes(['cashShift'])
            ->defaultSort('-paid_at')
            ->paginate($perPage)
            ->withQueryString();

        return PaymentResource::collection($records)->additional(['meta' => $totals]);
    }

    /**
     * What the filtered window came to, in three integers.
     *
     * `refunded_tiyin` is the amount of the payments that were reversed rather
     * than a separate refund ledger: a refund on this platform flips its own
     * payment (see `EloquentTillLedger::refundPayment()`), so the money handed
     * back IS the amount of the row that carries `refunded_at`.
     *
     * @param QueryBuilder<Payment> $query
     *
     * @return array{captured_tiyin: int, refunded_tiyin: int, refunded_count: int}
     */
    private function windowTotals(QueryBuilder $query): array
    {
        /*
         * A clone of the query the page came from, before sorting and paging.
         * Spatie applies filters when `allowedFilters()` is called and sorts
         * only at `paginate()`, so this carries exactly the narrowing and none
         * of the presentation.
         */
        $row = $query->clone()
            ->toBase()
            ->selectRaw('coalesce(sum(amount), 0)::bigint as captured')
            ->selectRaw('coalesce(sum(case when refunded_at is not null then amount else 0 end), 0)::bigint as refunded')
            ->selectRaw('count(case when refunded_at is not null then 1 end)::bigint as refunded_count')
            ->first();

        return [
            'captured_tiyin' => (int) ($row->captured ?? 0),
            'refunded_tiyin' => (int) ($row->refunded ?? 0),
            'refunded_count' => (int) ($row->refunded_count ?? 0),
        ];
    }

    public function store(StorePaymentRequest $request): PaymentResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = Payment::create($request->validated())->refresh();

        return new PaymentResource($record->load('cashShift'));
    }

    public function show(Payment $payment): PaymentResource
    {
        return new PaymentResource($payment->load('cashShift'));
    }

    public function update(UpdatePaymentRequest $request, Payment $payment): PaymentResource
    {
        $payment->update($request->validated());

        return new PaymentResource($payment->refresh()->load('cashShift'));
    }

    public function destroy(Payment $payment): Response
    {
        $payment->delete();

        return response()->noContent();
    }

    /**
     * Reverse a payment from the console.
     *
     * Through the ledger and not through the model, and that is the whole of this
     * change. `$payment->refund()` flips a row: it does not take the notes out of
     * any drawer, does not care whether the shift that took the money is still
     * open, and does not know that a cash refund on a closed shift has to be paid
     * out of whichever till is open now. An accountant refunding yesterday's cash
     * bill from a desk in the office produced exactly that — money handed back
     * that no Z-report had ever heard of.
     *
     * `refunding_shift_id` says which drawer the notes come from. With a single
     * till open it can be left out; with several the ledger refuses rather than
     * guessing, because a wrong guess is a shift that closes short with no record
     * of why.
     */
    public function refund(Request $request, Payment $payment, EloquentTillLedger $till): PaymentResource
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
            'refunding_shift_id' => ['nullable', 'integer', 'min:1'],
        ]);

        try {
            $till->refundPayment(
                (int) $payment->getKey(),
                (string) $validated['reason'],
                isset($validated['refunding_shift_id']) ? (int) $validated['refunding_shift_id'] : null,
            );
        } catch (RuntimeException $refusal) {
            // The sentence is the useful part: "refund it at the till that took
            // it", "you need an open till to hand cash back". A bare 422 would
            // send somebody looking for a bug.
            throw ApiException::detailed(
                'finance.shift_refused',
                uz: $refusal->getMessage(),
                ru: $refusal->getMessage(),
                en: $refusal->getMessage(),
                field: 'payment_id',
            );
        }

        return new PaymentResource($payment->refresh());
    }
}
