<?php

declare(strict_types=1);

namespace Modules\Finance\Payments;

use App\Contracts\Finance\PaymentGateway;
use App\Contracts\Finance\PaymentInvoice;
use App\Contracts\Finance\PaymentResult;
use Illuminate\Http\Request;
use Modules\Finance\Models\PaymentInvoice as InvoiceRow;
use Modules\Finance\Services\OnlinePaymentLedger;
use RuntimeException;
use Throwable;

/**
 * Uzum Bank checkout — written against a contract nobody here has read.
 *
 * ---------------------------------------------------------------------------
 * Say the uncertainty out loud, because the alternative is worse
 *
 * Payme's and Click's protocols are published, tested against, and the two
 * drivers beside this one implement exactly what those documents say. Uzum's
 * merchant integration is handed out per contract and this build has not seen
 * it. The field names below are the shape the platform assumed; they are
 * plausible and they are not verified.
 *
 * That is worth having anyway, and worth being loud about, for one reason: an
 * unverified driver that is OFF by default (`UZUM_ENABLED=false`) costs nothing
 * and gets the invoice, the callback route, the idempotent settle and the
 * status endpoint written once for all three rails. An unverified driver that
 * pretended to be finished would be discovered by a guest, mid-payment.
 *
 * **What is certainly right:** the state machine, which is
 * {@see OnlinePaymentLedger} and is shared with the two drivers that are
 * verified. **What has to be re-checked when the document arrives:** the field
 * names in `handleCallback()`, the signature construction in
 * `signatureHolds()`, the unit of `amount`, and whether the checkout is a GET
 * redirect or an API call that returns a URL. Four things, all in this file.
 *
 * Until then it behaves like the sandbox in one respect only — it refuses to
 * take a payment it cannot verify — and unlike it in the respect that matters:
 * it never marks anything paid on its own.
 */
final class UzumGateway implements PaymentGateway
{
    public function __construct(
        private readonly OnlinePaymentLedger $ledger,
        private readonly ?string $merchantId,
        private readonly ?string $serviceId,
        private readonly ?string $secretKey,
        private readonly string $checkoutUrl,
        private readonly bool $enabled,
    ) {}

    public function name(): string
    {
        return 'uzum';
    }

    public function available(): bool
    {
        return $this->enabled
            && $this->merchantId !== null && $this->merchantId !== ''
            && $this->serviceId !== null && $this->serviceId !== ''
            && $this->secretKey !== null && $this->secretKey !== '';
    }

    /**
     * A query-string redirect, the same shape Click uses.
     *
     * ASSUMED. If Uzum's checkout turns out to be an API call that mints a URL,
     * this method grows an HTTP request and nothing else in the platform changes
     * — which is the reason the invoice row is written before the driver is
     * spoken to.
     */
    public function createInvoice(
        string $token,
        int $amountTiyin,
        string $orderNumber,
        ?int $orderId = null,
        ?string $returnUrl = null,
    ): PaymentInvoice {
        if (! $this->available()) {
            throw new RuntimeException('Uzum provayderi sozlanmagan.');
        }

        $invoice = $this->ledger->byToken($token);

        if ($invoice === null) {
            throw new RuntimeException("To'lov hujjati topilmadi: {$token}");
        }

        $query = [
            'merchantId' => $this->merchantId,
            'serviceId' => $this->serviceId,
            // Tiyin. ASSUMED — Payme uses tiyin, Click uses so'm, and there is no
            // way to guess which convention Uzum picked.
            'amount' => $amountTiyin,
            'transactionId' => $token,
        ];

        if ($returnUrl !== null && $returnUrl !== '') {
            $query['redirectUrl'] = $returnUrl;
        }

        return $this->ledger
            ->attach($invoice, rtrim($this->checkoutUrl, '/').'?'.http_build_query($query))
            ->handle();
    }

    public function handleCallback(Request $request): PaymentResult
    {
        if (! $this->signatureHolds($request)) {
            return $this->reply(false, 'SIGN_CHECK_FAILED', null, PaymentResult::FAILED, 401);
        }

        $token = (string) $request->input('transactionId', '');
        $invoice = $token === '' ? null : $this->ledger->byToken($token);

        if ($invoice === null || $invoice->provider !== $this->name()) {
            return $this->reply(false, 'ORDER_NOT_FOUND', null, PaymentResult::FAILED, 404);
        }

        try {
            $status = mb_strtolower((string) $request->input('status', ''));

            return match ($status) {
                'paid', 'success', 'confirmed' => $this->settle($request, $invoice),
                'cancelled', 'canceled', 'reversed' => $this->reply(
                    true,
                    'CANCELLED',
                    $this->ledger->cancel($invoice, 'Uzum status='.$status),
                    PaymentResult::CANCELLED,
                ),
                default => $this->reply(true, 'PENDING', $invoice, PaymentResult::PENDING),
            };
        } catch (Throwable $failure) {
            return $this->reply(false, mb_substr($failure->getMessage(), 0, 120), $invoice, PaymentResult::FAILED, 500);
        }
    }

    /**
     * Uzum reversals are not in this build.
     *
     * Refusing is the honest answer while the contract is unread: reporting a
     * refund that did not happen leaves a guest waiting for money nobody sent,
     * and a staff member believing the case is closed.
     */
    public function refund(string $providerInvoiceId, int $amountTiyin, string $reason): PaymentResult
    {
        throw new RuntimeException(
            'Uzum qaytarishi hali ulanmagan — merchant integratsiya hujjati kerak.'
        );
    }

    // ============ Internals ============

    private function settle(Request $request, InvoiceRow $invoice): PaymentResult
    {
        $declared = (int) $request->input('amount', $invoice->amount);

        if ($declared !== $invoice->amount) {
            // The one check that must not be skipped whatever the field names
            // turn out to be: a callback naming a smaller amount than the bill is
            // the whole of the attack surface on this endpoint.
            return $this->reply(false, 'INCORRECT_AMOUNT', $invoice, PaymentResult::FAILED, 422);
        }

        $settled = $this->ledger->settle($invoice, (string) $request->input('paymentId', $invoice->token));

        return $this->reply(true, 'PAID', $settled, PaymentResult::PAID);
    }

    /**
     * ASSUMED: SHA-256 over `transactionId + amount + status + secret`.
     *
     * Constant-time comparison regardless, because whatever the construction
     * turns out to be, this is the only thing standing between a stranger's POST
     * and a bill marked paid.
     */
    private function signatureHolds(Request $request): bool
    {
        if ($this->secretKey === null || $this->secretKey === '') {
            return false;
        }

        $expected = hash('sha256', implode('', [
            (string) $request->input('transactionId', ''),
            (string) $request->input('amount', ''),
            (string) $request->input('status', ''),
            $this->secretKey,
        ]));

        return hash_equals($expected, mb_strtolower((string) $request->input('signature', '')));
    }

    private function reply(
        bool $ok,
        string $note,
        ?InvoiceRow $invoice,
        string $state,
        int $status = 200,
    ): PaymentResult {
        return new PaymentResult(
            provider: $this->name(),
            state: $state,
            amount: $invoice === null ? 0 : $invoice->amount,
            reference: $invoice?->provider_invoice_id,
            token: $invoice?->token,
            reply: ['success' => $ok, 'status' => $note],
            status: $status,
            message: $note,
        );
    }
}
