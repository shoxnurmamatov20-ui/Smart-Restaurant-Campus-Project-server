<?php

declare(strict_types=1);

namespace App\Contracts\Finance;

use Illuminate\Http\Request;
use RuntimeException;

/**
 * One online payment provider, as the rest of the platform is allowed to see it.
 *
 * Three verbs, and they are the three moments money is actually at risk: hand
 * the guest a place to pay, believe (or refuse to believe) what the provider
 * says afterwards, and put it back.
 *
 * ---------------------------------------------------------------------------
 * Why this is a core contract rather than a Finance class
 *
 * The guest never reaches Finance. A stranger on the restaurant's own site
 * places an order (Orders), scans a QR at a table (Tables) or opens the
 * customer app, and every one of those has to be able to say "and here is where
 * you pay" without importing another module. `App\Contracts\Finance\TillLedger`
 * is here for the same reason and it is the same boundary: Finance owns the
 * money, everyone else asks.
 *
 * ---------------------------------------------------------------------------
 * A provider with no keys is OFF, not broken
 *
 * `available()` exists so that a restaurant which has signed with Click and not
 * with Payme sees one button rather than two, the second of which fails at the
 * worst possible moment — after the guest has committed to paying. A missing
 * `PAYME_KEY` in production is an ordinary state of the world (most venues will
 * never sign with every provider), so it is reported as a capability and never
 * as an exception. The one place it becomes an error is a guest explicitly
 * asking for a provider that is off, which is a client bug worth a 422.
 */
interface PaymentGateway
{
    /** Short, stable, stored on the payment row: `payme`, `click`, `uzum`. */
    public function name(): string;

    /**
     * Are this installation's credentials present and usable.
     *
     * Never a network call. This is asked while rendering a checkout screen, and
     * a screen that waits on a bank before it can draw a button is a screen that
     * hangs whenever the bank is slow.
     */
    public function available(): bool;

    /**
     * Open an attempt to pay this bill and return where to send the guest.
     *
     * `$token` is minted by Finance, not by the provider: it is what a return URL
     * and a status poll carry, and it must exist before any provider has been
     * spoken to — otherwise a guest whose browser dies mid-redirect has no handle
     * to come back with.
     *
     * @param  int  $amountTiyin  What is owed, in tiyin. Never a float, never a
     *                            so'm figure — providers disagree about which unit
     *                            they take, and each driver converts on its own way
     *                            out.
     * @param  string|null  $returnUrl  Where the provider sends the browser once the
     *                                  guest is finished. Optional because two of the
     *                                  three providers treat it as advisory.
     *
     * @throws RuntimeException when the provider is unavailable or refuses to
     *                          open the invoice. The caller turns this into the
     *                          `finance.payment_provider_refused` envelope.
     */
    public function createInvoice(
        string $token,
        int $amountTiyin,
        string $orderNumber,
        ?int $orderId = null,
        ?string $returnUrl = null,
    ): PaymentInvoice;

    /**
     * Read one callback from this provider and say what it meant.
     *
     * Authentication happens HERE and nowhere else, because it is per-protocol:
     * Payme presents HTTP Basic with the merchant key, Click presents an MD5
     * `sign_string` over eight ordered fields. A shared middleware would have to
     * know both, which is exactly the knowledge this interface exists to contain.
     *
     * Never throws for a refusal. An unsigned or malformed callback is a
     * {@see PaymentResult} in the `failed` state carrying the refusal the provider
     * expects to read — a 500 would make Payme retry a forgery every minute for a
     * day.
     */
    public function handleCallback(Request $request): PaymentResult;

    /**
     * Send the money back.
     *
     * @param  int  $amountTiyin  The amount to return, which is not always the whole
     *                            invoice: a table that paid online for four and sent
     *                            one dish back is a partial reversal.
     *
     * @throws RuntimeException when the provider refuses, or does not support
     *                          reversal through its API at all — several in this
     *                          market do it by hand in a merchant cabinet, and
     *                          pretending otherwise would report a refund that
     *                          never happened.
     */
    public function refund(string $providerInvoiceId, int $amountTiyin, string $reason): PaymentResult;
}
