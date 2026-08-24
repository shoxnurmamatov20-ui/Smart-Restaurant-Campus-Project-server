<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use App\Support\Finance\AcquirerFees;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Modules\Finance\Http\Requests\StorePaymentMethodRequest;
use Modules\Finance\Http\Requests\UpdatePaymentMethodRequest;
use Modules\Finance\Http\Resources\PaymentMethodResource;
use Modules\Finance\Models\Payment;
use Modules\Finance\Models\PaymentMethod;

/**
 * How this restaurant takes money, as it decided to offer it.
 *
 * Mounted under /api/v1/finance/payment-methods.
 *
 * ---------------------------------------------------------------------------
 * The list is never empty
 *
 * A restaurant that has never opened this screen has no rows, and a settings
 * panel showing nothing would invite it to add `cash` — a second row for a
 * tender the till already takes, with a name and a fee of its own, and then two
 * answers to "what does a card cost us".
 *
 * So `index` answers the platform's own defaults for the tenders that have no
 * row yet, marked `id: null`. They are not written on read: a GET that creates
 * rows makes every reader a writer, and the first thing that breaks is a
 * read-only replica. The first PATCH is what materialises one — see `update`.
 */
final class PaymentMethodController extends Controller
{
    /**
     * @return array<string, mixed>
     */
    public function index(Request $request): array
    {
        $configured = PaymentMethod::query()->ordered()->get()->keyBy('method');

        $rows = [];

        // In `Payment::METHODS` order, so the till's tender sheet has a stable
        // shape before anybody has reordered anything.
        foreach (Payment::METHODS as $index => $method) {
            $row = $configured->get($method);

            $rows[] = $row instanceof PaymentMethod
                ? (new PaymentMethodResource($row))->toArray($request)
                : $this->platformDefault($method, $index);
        }

        // Anything configured that is somehow not in the constant — a tender
        // removed from the code while a row survived it. Shown rather than
        // hidden: a restaurant taking money through it has to be told.
        foreach ($configured as $method => $row) {
            if (! in_array($method, Payment::METHODS, true)) {
                $rows[] = (new PaymentMethodResource($row))->toArray($request);
            }
        }

        return ['data' => $rows];
    }

    public function store(StorePaymentMethodRequest $request): PaymentMethodResource
    {
        $record = PaymentMethod::create($request->validated())->refresh();

        return new PaymentMethodResource($record);
    }

    /**
     * Change how a tender is offered.
     *
     * The route binds `{method}` by the tender NAME rather than by an id, and
     * that is what lets the platform defaults in `index` be editable: a screen
     * PATCHes `cash` whether or not a row exists, and the first write
     * materialises one. Binding by id would have meant the screen POSTing for
     * some rows and PATCHing for others, deciding which by whether a field it
     * was handed was null.
     */
    public function update(UpdatePaymentMethodRequest $request, string $method): JsonResponse
    {
        if (! in_array($method, Payment::METHODS, true)) {
            throw ApiException::of('finance.unknown_payment_method', meta: ['method' => $method]);
        }

        $record = PaymentMethod::query()->where('method', $method)->first();

        if ($record === null) {
            $record = PaymentMethod::create([
                'method' => $method,
                'name' => ['uz' => $method, 'ru' => $method, 'en' => $method],
                'kind' => $this->kindOf($method),
                'position' => (int) array_search($method, Payment::METHODS, true),
            ]);
        }

        $record->update($request->validated());

        /*
         * 200, even on the request that materialised the row.
         *
         * A resource returns 201 when its model `wasRecentlyCreated`, which is
         * right for a POST and wrong here: the caller asked to change a setting
         * that the platform was already answering with a default. Whether a row
         * had to be written for that is an implementation detail, and a client
         * branching on 201 would be branching on it.
         */
        return (new PaymentMethodResource($record->refresh()))
            ->response()
            ->setStatusCode(Response::HTTP_OK);
    }

    /**
     * Stop offering a tender.
     *
     * A delete rather than a switch, and it is the switch that is the ordinary
     * act — `is_enabled` is what a manager uses. This removes the restaurant's
     * CONFIGURATION for a tender, so the row falls back to the platform default
     * and reappears in the list unnamed. Payments already taken through it are
     * untouched: nothing in `finance.payments` points at this table, which is
     * the property that makes a delete here safe at all.
     */
    public function destroy(PaymentMethod $paymentMethod): Response
    {
        $paymentMethod->delete();

        return response()->noContent();
    }

    /**
     * A tender the restaurant has not configured, as the platform offers it.
     *
     * `id: null` is the flag a client branches on, and the name is the bare
     * method code — this controller has no business inventing "Naqd pul" in
     * three languages when the console's own catalogue already has the word.
     *
     * @return array<string, mixed>
     */
    private function platformDefault(string $method, int $position): array
    {
        return [
            'id' => null,
            'method' => $method,
            'name' => ['uz' => $method, 'ru' => $method, 'en' => $method],
            'title' => $method,
            'kind' => $this->kindOf($method),
            'is_fiscal' => $method !== 'credit' && $method !== 'corporate',
            'fee_bps' => null,
            'effective_fee_bps' => AcquirerFees::bps($method),
            'gateway' => in_array($method, ['payme', 'click', 'uzum'], true) ? $method : null,
            'is_enabled' => true,
            'position' => $position,
            'created_at' => null,
            'updated_at' => null,
        ];
    }

    /**
     * Which of the four shapes a built-in tender has.
     *
     * A map rather than a guess from the name: `corporate` settles by bank
     * transfer and looks online, `credit` is the restaurant lending its own
     * money and looks like neither. Both were the ones a naive rule got wrong.
     */
    private function kindOf(string $method): string
    {
        return match ($method) {
            'cash' => 'cash',
            'payme', 'click', 'uzum' => 'online',
            'credit', 'corporate' => 'credit',
            default => 'card',
        };
    }
}
