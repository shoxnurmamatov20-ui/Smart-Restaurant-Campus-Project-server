<?php

declare(strict_types=1);

namespace Modules\Finance\Payments;

use App\Contracts\Finance\PaymentGateway;
use App\Contracts\Finance\PaymentInvoice;
use App\Contracts\Finance\PaymentResult;
use Illuminate\Http\Request;
use Modules\Finance\Services\OnlinePaymentLedger;
use RuntimeException;

/**
 * A provider that says yes, for a machine with no bank on it.
 *
 * Everything around an online payment — the invoice row, the redirect, the
 * callback, the tender, the closed bill, the guest polling a status — is
 * provider-independent and is most of the work. None of it can be developed or
 * tested against a real acquirer, so this stands in for one.
 *
 * ---------------------------------------------------------------------------
 * It refuses to run in production, and that guard is the important line here
 *
 * This class marks bills paid without any money arriving. On a live server that
 * is a restaurant giving food away while its dashboard reports takings — the
 * exact failure `DemoFiscalDriver` guards against, one layer further down the
 * money. A `PAYMENTS_SANDBOX_ENABLED=1` left in a production environment file
 * would do it silently, for as long as nobody reconciled a bank statement.
 *
 * So the constructor throws outright when the application is in production, and
 * the payment method it books is `card` rather than a real rail's name — a
 * seeded demo database must not contain rows that look like Payme took money.
 */
final class SandboxGateway implements PaymentGateway
{
    public function __construct(
        private readonly OnlinePaymentLedger $ledger,
        private readonly bool $enabled = false,
        private readonly bool $production = false,
    ) {
        if ($this->enabled && $this->production) {
            throw new RuntimeException(
                'SandboxGateway production muhitida ishlamaydi: u pul kelmasdan hisobni to\'langan deb belgilaydi. '
                .'PAYMENTS_SANDBOX_ENABLED ni o\'chiring.'
            );
        }
    }

    public function name(): string
    {
        return 'sandbox';
    }

    public function available(): bool
    {
        return $this->enabled && ! $this->production;
    }

    /**
     * Paid on the spot.
     *
     * No redirect worth the name: the URL points back at the caller's own return
     * address so the browser lands somewhere sensible, and the invoice is already
     * settled by the time it gets there. Deferring it to a fake callback would
     * test the callback route rather than the flow, and the callback route has
     * its own tests with the real protocols in them.
     */
    public function createInvoice(
        string $token,
        int $amountTiyin,
        string $orderNumber,
        ?int $orderId = null,
        ?string $returnUrl = null,
    ): PaymentInvoice {
        if (! $this->available()) {
            throw new RuntimeException('Sandbox to\'lov provayderi o\'chirilgan.');
        }

        $invoice = $this->ledger->byToken($token);

        if ($invoice === null) {
            throw new RuntimeException("To'lov hujjati topilmadi: {$token}");
        }

        $paid = $this->ledger->settle($invoice, 'SANDBOX-'.mb_substr($token, 0, 12));

        return $this->ledger
            ->attach($paid, $returnUrl ?? ('/customer/track?invoice='.$token))
            ->handle();
    }

    /**
     * There is no provider to call back, so anything arriving here is a test
     * pretending to be one. Answered with the shape our own status endpoint
     * uses, because that is the only reader it will ever have.
     */
    public function handleCallback(Request $request): PaymentResult
    {
        $token = (string) $request->input('invoice_id', '');
        $invoice = $token === '' ? null : $this->ledger->byToken($token);

        if ($invoice === null) {
            return new PaymentResult(
                provider: $this->name(),
                state: PaymentResult::FAILED,
                reply: ['ok' => false, 'error' => 'unknown_invoice'],
                status: 404,
            );
        }

        $settled = $this->ledger->settle($invoice);

        return new PaymentResult(
            provider: $this->name(),
            state: PaymentResult::PAID,
            amount: $settled->amount,
            reference: $settled->provider_invoice_id,
            token: $settled->token,
            reply: ['ok' => true, 'state' => $settled->state],
        );
    }

    public function refund(string $providerInvoiceId, int $amountTiyin, string $reason): PaymentResult
    {
        return new PaymentResult(
            provider: $this->name(),
            state: PaymentResult::CANCELLED,
            amount: $amountTiyin,
            reference: $providerInvoiceId,
            reply: ['ok' => true],
            message: $reason,
        );
    }
}
