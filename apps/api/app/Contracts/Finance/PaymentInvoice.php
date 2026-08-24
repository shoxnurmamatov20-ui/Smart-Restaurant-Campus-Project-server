<?php

declare(strict_types=1);

namespace App\Contracts\Finance;

/**
 * A bill handed to a payment provider, as the rest of the platform sees it.
 *
 * The guest surfaces need three things and nothing else: which provider is
 * taking the money, the handle it can be asked about later, and the address to
 * send the browser to. Everything else — the merchant credentials, the JSON-RPC
 * envelope, whether the provider calls its transaction id `click_trans_id` or
 * `_id` — belongs to the driver and must not reach a screen.
 *
 * `payUrl` is deliberately a string rather than a structured redirect. Payme
 * takes a base64 blob in the path, Click takes a query string, and Uzum returns
 * a URL it minted itself; a type that tried to model all three would model none
 * of them.
 */
final readonly class PaymentInvoice
{
    /**
     * @param string $provider Short and stable: `payme`, `click`, `uzum`, `sandbox`.
     * @param string $token Our handle for this attempt, opaque and unguessable.
     *                      What a guest polls and what a return URL carries — never
     *                      the row id, because that is a number a stranger can
     *                      count up from.
     * @param string|null $invoiceId The provider's own transaction id, once it has
     *                               issued one. Null until the provider's first
     *                               callback: Payme and Click both mint theirs
     *                               when the guest actually starts paying, so an
     *                               invoice can exist without one.
     * @param int $amount Tiyin, never a float. 1 UZS = 100 tiyin.
     * @param string $state One of PaymentResult::STATES.
     */
    public function __construct(
        public string $provider,
        public string $token,
        public ?string $invoiceId,
        public string $payUrl,
        public int $amount,
        public string $state,
        public ?int $orderId = null,
        public ?string $orderNumber = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'provider' => $this->provider,
            'invoice_id' => $this->token,
            'provider_invoice_id' => $this->invoiceId,
            'pay_url' => $this->payUrl,
            'amount' => $this->amount,
            'currency' => 'UZS',
            'state' => $this->state,
            'order_id' => $this->orderId,
            'order_number' => $this->orderNumber,
        ];
    }
}
