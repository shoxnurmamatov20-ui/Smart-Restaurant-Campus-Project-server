<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Finance\Http\Requests\StorePaymentRequest;
use Modules\Finance\Http\Requests\UpdatePaymentRequest;
use Modules\Finance\Http\Resources\PaymentResource;
use Modules\Finance\Models\Payment;
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

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Payment::class)
            ->allowedFilters([
                AllowedFilter::exact('method'),
                AllowedFilter::exact('status'),
                AllowedFilter::exact('shift', 'cash_shift_id'),
                AllowedFilter::exact('order', 'order_id'),
            ])
            ->allowedSorts(['paid_at', 'amount', 'created_at'])
            ->allowedIncludes(['cashShift'])
            ->defaultSort('-paid_at')
            ->paginate($perPage)
            ->withQueryString();

        return PaymentResource::collection($records);
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

    public function refund(Request $request, Payment $payment): PaymentResource
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
        ]);

        abort_unless($payment->refund($validated['reason']), 422, "Bu to'lov allaqachon qaytarilgan.");

        return new PaymentResource($payment->refresh());
    }
}
