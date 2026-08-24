<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Contracts\Finance\PaymentGateway;
use App\Contracts\Finance\PaymentGateways;
use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillRegistry;
use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Modules\Finance\Http\Requests\StorePaymentInvoiceRequest;
use Modules\Finance\Http\Resources\PaymentInvoiceResource;
use Modules\Finance\Services\OnlinePaymentLedger;
use RuntimeException;

/**
 * The guest side of an online payment: open one, watch it, and see the rails.
 *
 * No login anywhere in this class. A stranger on the restaurant's own website,
 * a guest who scanned a table's QR, somebody in the customer app before they
 * have signed in — none of them holds a permission, and none of them needs one.
 * What scopes these endpoints is the same thing that scopes the public menu: the
 * tenant, plus a throttle, plus the fact that nothing here can be reached
 * without already knowing a bill number.
 *
 * @see PaymentCallbackController for the
 *      provider's side of the same conversation.
 */
final class PublicPaymentController extends Controller
{
    public function __construct(
        private readonly PaymentGateways $gateways,
        private readonly OnlinePaymentLedger $ledger,
        private readonly BillRegistry $bills,
    ) {}

    /**
     * The rails a guest may be offered, in the order they are drawn.
     *
     * Only the configured ones. A checkout that lists a provider whose keys are
     * missing fails after the guest has committed to paying, which is the worst
     * possible moment to discover a configuration problem — so the filtering
     * happens here rather than in a screen that might forget.
     *
     * Cash is not in this list and never will be: it is not a rail, it is the
     * absence of one, and the client draws it from its own copy.
     */
    public function providers(): JsonResponse
    {
        return response()->json([
            'data' => array_map(
                static fn (PaymentGateway $gateway): array => [
                    'id' => $gateway->name(),
                    'available' => true,
                ],
                $this->gateways->enabled(),
            ),
        ]);
    }

    /**
     * Open an attempt to pay a bill, and say where to send the browser.
     *
     * The order of operations is deliberate and is the part worth reading. The
     * invoice row is written BEFORE the provider is spoken to, because the token
     * in it is what a return URL and a status poll carry — a row minted after the
     * provider answered would leave a guest whose browser died mid-redirect with
     * no handle to come back with, and a payment they cannot check on.
     */
    public function invoice(StorePaymentInvoiceRequest $request): PaymentInvoiceResource
    {
        $validated = $request->validated();
        $provider = (string) $validated['provider'];

        if (! $this->gateways->isEnabled($provider)) {
            throw ApiException::of('finance.payment_provider_unavailable', field: 'provider', meta: [
                'provider' => $provider,
            ]);
        }

        $bill = $this->billFor((int) $validated['order_id'], (string) $validated['order_number']);

        if (! $bill->isOpen()) {
            // Already settled, cancelled or comped. Refused rather than charged
            // again: a second successful payment on a closed bill is money the
            // restaurant has to give back, and a guest who has to ask for it.
            throw ApiException::of('finance.payment_order_settled', field: 'order_id', meta: [
                'status' => $bill->status,
            ]);
        }

        $invoice = $this->ledger->open(
            provider: $provider,
            // From the bill, never from the payload — API.md §19. See the request
            // class for what a client-supplied amount would buy a guest.
            amountTiyin: $bill->total,
            orderId: $bill->id,
            orderNumber: $bill->number,
            returnUrl: $validated['return_url'] ?? null,
        );

        try {
            $this->gateways->driver($provider)->createInvoice(
                token: $invoice->token,
                amountTiyin: $bill->total,
                orderNumber: $bill->number,
                orderId: $bill->id,
                returnUrl: $validated['return_url'] ?? null,
            );
        } catch (RuntimeException $refusal) {
            /*
             * The attempt is marked failed rather than deleted.
             *
             * A row that vanishes when a bank says no leaves nothing to look at
             * when the same guest reports that "the Payme button does nothing",
             * and this is the exact failure that needs looking at — a rotated
             * key, a merchant account suspended, a checkout URL pointing at a
             * sandbox. `last_error` is where it is written down.
             */
            $this->ledger->fail($invoice, $refusal->getMessage());

            throw ApiException::detailed(
                'finance.payment_provider_refused',
                uz: $refusal->getMessage(),
                ru: $refusal->getMessage(),
                en: $refusal->getMessage(),
                field: 'provider',
            );
        }

        return new PaymentInvoiceResource($invoice->refresh());
    }

    /**
     * Where a payment stands — the endpoint a guest's phone polls after it comes
     * back from the bank.
     *
     * Bound by token, never by id. See the migration for what an enumerable id
     * would let a stranger read on an endpoint with no login on it.
     */
    public function show(string $invoice): PaymentInvoiceResource
    {
        $row = $this->ledger->byToken($invoice);

        if ($row === null) {
            throw ApiException::of('finance.payment_invoice_unknown', field: 'invoice');
        }

        return new PaymentInvoiceResource($row);
    }

    /**
     * The bill this payment is for, if the caller can name both halves of it.
     *
     * The id and the number have to agree. Either on its own is guessable — the
     * id is a counter, the number is a short sequence per restaurant — and the
     * response carries the total, so a mismatch answers exactly as a missing bill
     * does. Telling the two apart would turn this into an oracle for which bill
     * numbers exist.
     */
    private function billFor(int $orderId, string $orderNumber): Bill
    {
        $bill = $this->bills->find($orderId);

        if (! $bill instanceof Bill || ! hash_equals($bill->number, $orderNumber)) {
            throw ApiException::of('finance.payment_order_unknown', field: 'order_number');
        }

        return $bill;
    }
}
