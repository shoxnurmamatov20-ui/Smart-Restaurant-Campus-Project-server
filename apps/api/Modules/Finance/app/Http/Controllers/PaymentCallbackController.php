<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Contracts\Finance\PaymentGateways;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * The provider's side of an online payment.
 *
 * ---------------------------------------------------------------------------
 * Three ordinary rules of this API are suspended here, each for a stated reason
 *
 * **No `Idempotency-Key`.** Every other write on this platform requires one, and
 * a bank does not send our headers. The guarantee has to come from the data
 * instead: `OnlinePaymentLedger::settle()` takes the invoice row `FOR UPDATE`
 * and returns the existing payment when there is one, so Payme retrying
 * PerformTransaction six times produces exactly one tender. Recorded in
 * `IdempotencyCoverageTest::EXEMPT` rather than left to slip through.
 *
 * **No error envelope.** `App\Support\Errors\ErrorResponse` is what fourteen of
 * our surfaces read; a payment provider is not one of them. Payme wants JSON-RPC
 * 2.0 with its own numbered codes, Click wants a flat object with `error` and
 * `error_note`, and handing either of them `{"error":{"code":"finance.…"}}` means
 * the payment is never reconciled. So the driver decides the body and this
 * controller passes it out untouched — see `PaymentResult::$reply`.
 *
 * **No session.** There is no credential a bank could present and no user to
 * authenticate. What replaces it is per-protocol and lives in the driver:
 * Payme's HTTP Basic merchant key, Click's MD5 `sign_string`. A shared
 * middleware would have to know both, which is the coupling the driver exists to
 * prevent.
 *
 * ---------------------------------------------------------------------------
 * Which restaurant is this?
 *
 * `ResolveTenant` — the subdomain in production, `X-Tenant` in tests. Each venue
 * configures its own callback URL in its merchant cabinet, so the host names the
 * tenant the same way it names it for the QR menu. Without that the invoice
 * lookup would run with no `app.tenant_id` set and row-level security would
 * answer, correctly, with nothing.
 */
final class PaymentCallbackController extends Controller
{
    public function __construct(private readonly PaymentGateways $gateways) {}

    public function __invoke(Request $request, string $provider): JsonResponse
    {
        try {
            $driver = $this->gateways->driver($provider);
        } catch (RuntimeException) {
            /*
             * A callback for a provider this build has never heard of.
             *
             * 404 with a body of our own, because there is no protocol to answer
             * in: we do not know what shape this caller reads. It is also the one
             * answer that cannot be mistaken for a refusal the sender should
             * retry.
             */
            return response()->json(['error' => 'unknown_provider'], 404);
        }

        $result = $driver->handleCallback($request);

        /*
         * Logged at the outcome, and deliberately without the body.
         *
         * The body carries the merchant key on every Payme call — it is the
         * Authorization header, and a log line containing it is the whole
         * authentication of the rail sitting in a file that gets shipped to a
         * log aggregator. The token, the state and the amount are enough to
         * reconstruct any dispute, and none of them is a secret.
         */
        Log::info('finance.payment_callback', [
            'provider' => $provider,
            'state' => $result->state,
            'token' => $result->token,
            'amount' => $result->amount,
            'message' => $result->message,
        ]);

        return response()->json($result->reply, $result->status);
    }
}
