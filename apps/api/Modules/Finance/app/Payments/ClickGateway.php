<?php

declare(strict_types=1);

namespace Modules\Finance\Payments;

use App\Contracts\Finance\PaymentGateway;
use App\Contracts\Finance\PaymentInvoice;
use App\Contracts\Finance\PaymentResult;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Modules\Finance\Models\PaymentInvoice as InvoiceRow;
use Modules\Finance\Services\OnlinePaymentLedger;
use RuntimeException;
use Throwable;

/**
 * Click — two callbacks, one MD5 signature, and a unit that is not tiyin.
 *
 * Click posts twice for one payment. `Prepare` (action 0) asks whether the bill
 * exists and is payable; `Complete` (action 1) says the money moved. Both are
 * form-encoded, both carry a `sign_string`, and both expect a flat JSON object
 * back with a numeric `error` field — 0 for success, a negative number for
 * everything else.
 *
 * ---------------------------------------------------------------------------
 * The signature, and why the field order is written out
 *
 *   Prepare:  md5(click_trans_id + service_id + SECRET + merchant_trans_id
 *                 + amount + action + sign_time)
 *   Complete: md5(click_trans_id + service_id + SECRET + merchant_trans_id
 *                 + merchant_prepare_id + amount + action + sign_time)
 *
 * Concatenation with no separator, in exactly that order. `merchant_prepare_id`
 * appears in the second and not the first, which is the single most common
 * integration bug: a signature built with one field list verifies Prepare and
 * fails every Complete, so payments are taken and never confirmed.
 *
 * ---------------------------------------------------------------------------
 * Amounts arrive in SO'M, with decimals
 *
 * `"45000.00"`, not `4500000`. This platform stores tiyin everywhere and the
 * conversion happens here, at the boundary, in the one class that knows Click's
 * unit — comparing a so'm string against a tiyin integer is off by a factor of a
 * hundred in the direction that lets a guest pay 1% of a bill.
 *
 * The comparison rounds to the nearest tiyin before checking. Click sends two
 * decimal places, so `45000.00` is exact; parsing it as a float and comparing
 * for equality is not, which is the reason the check is written on integers.
 */
final class ClickGateway implements PaymentGateway
{
    /** Click's own numbering. Positive is never used; 0 is success. */
    private const OK = 0;

    private const ERROR_SIGN_CHECK_FAILED = -1;

    private const ERROR_INCORRECT_AMOUNT = -2;

    private const ERROR_ACTION_NOT_FOUND = -3;

    private const ERROR_ALREADY_PAID = -4;

    private const ERROR_ORDER_NOT_FOUND = -5;

    private const ERROR_TRANSACTION_NOT_FOUND = -6;

    private const ERROR_TRANSACTION_CANCELLED = -9;

    private const ACTION_PREPARE = 0;

    private const ACTION_COMPLETE = 1;

    public function __construct(
        private readonly OnlinePaymentLedger $ledger,
        private readonly ?string $serviceId,
        private readonly ?string $merchantId,
        private readonly ?string $merchantUserId,
        private readonly ?string $secretKey,
        private readonly string $checkoutUrl,
        private readonly string $apiUrl,
        private readonly bool $enabled,
    ) {}

    public function name(): string
    {
        return 'click';
    }

    public function available(): bool
    {
        return $this->enabled
            && $this->serviceId !== null && $this->serviceId !== ''
            && $this->merchantId !== null && $this->merchantId !== ''
            && $this->secretKey !== null && $this->secretKey !== '';
    }

    /**
     * Click takes an ordinary query string.
     *
     * `transaction_param` is what comes back as `merchant_trans_id`, and it is
     * our token rather than the order number — see PaymeGateway for why an
     * identifier printed on a receipt must not be the one a stranger can pay
     * against.
     */
    public function createInvoice(
        string $token,
        int $amountTiyin,
        string $orderNumber,
        ?int $orderId = null,
        ?string $returnUrl = null,
    ): PaymentInvoice {
        if (! $this->available()) {
            throw new RuntimeException('Click provayderi sozlanmagan.');
        }

        $invoice = $this->ledger->byToken($token);

        if ($invoice === null) {
            throw new RuntimeException("To'lov hujjati topilmadi: {$token}");
        }

        $query = [
            'service_id' => $this->serviceId,
            'merchant_id' => $this->merchantId,
            // So'm with two decimals, which is the unit Click's own form shows.
            'amount' => number_format($amountTiyin / 100, 2, '.', ''),
            'transaction_param' => $token,
        ];

        if ($returnUrl !== null && $returnUrl !== '') {
            $query['return_url'] = $returnUrl;
        }

        return $this->ledger
            ->attach($invoice, $this->checkoutUrl.'?'.http_build_query($query))
            ->handle();
    }

    public function handleCallback(Request $request): PaymentResult
    {
        $action = $request->integer('action', -1);
        $clickTransId = (string) $request->input('click_trans_id', '');
        $merchantTransId = (string) $request->input('merchant_trans_id', '');

        if (! $this->signatureHolds($request, $action)) {
            return $this->reply(self::ERROR_SIGN_CHECK_FAILED, 'SIGN CHECK FAILED', $clickTransId, $merchantTransId);
        }

        try {
            return match ($action) {
                self::ACTION_PREPARE => $this->prepare($request, $clickTransId, $merchantTransId),
                self::ACTION_COMPLETE => $this->complete($request, $clickTransId, $merchantTransId),
                default => $this->reply(self::ERROR_ACTION_NOT_FOUND, 'Action not found', $clickTransId, $merchantTransId),
            };
        } catch (Throwable $failure) {
            /*
             * Reported as "transaction not found" rather than a 500.
             *
             * Click retries a transport failure and gives up on a business
             * refusal, and an exception here is our bug: the retry is the
             * behaviour we want while it is being fixed, and an HTML error page
             * would be parsed as a permanent failure by a bank that has already
             * taken the guest's money.
             */
            return $this->reply(
                self::ERROR_TRANSACTION_NOT_FOUND,
                $failure->getMessage(),
                $clickTransId,
                $merchantTransId,
            );
        }
    }

    /**
     * Click's Merchant API reversal.
     *
     * The one provider of the three that will reverse through an API. The
     * authentication is its own scheme — `Auth: merchant_user_id:sha1(timestamp
     * + secret):timestamp` — and it is deliberately assembled here rather than in
     * a shared helper: it is the only place in the platform that speaks it, and a
     * shared version would be a shared place to get one bank's header wrong.
     */
    public function refund(string $providerInvoiceId, int $amountTiyin, string $reason): PaymentResult
    {
        if (! $this->available() || $this->merchantUserId === null || $this->merchantUserId === '') {
            throw new RuntimeException('Click qaytarishi uchun CLICK_MERCHANT_USER_ID kerak.');
        }

        $timestamp = (string) now()->getTimestamp();

        $response = Http::asJson()
            ->withHeaders([
                'Auth' => $this->merchantUserId.':'.sha1($timestamp.$this->secretKey).':'.$timestamp,
            ])
            ->timeout(15)
            ->delete(rtrim($this->apiUrl, '/')."/payment/reversal/{$this->serviceId}/{$providerInvoiceId}");

        if ($response->failed() || (int) $response->json('error_code', -1) !== 0) {
            throw new RuntimeException(
                'Click qaytarishni rad etdi: '.(string) $response->json('error_note', $response->body())
            );
        }

        return new PaymentResult(
            provider: $this->name(),
            state: PaymentResult::CANCELLED,
            amount: $amountTiyin,
            reference: $providerInvoiceId,
            reply: ['error' => self::OK],
            message: $reason,
        );
    }

    // ============ The two callbacks ============

    /** Does this bill exist, and is the amount right? Reserves nothing. */
    private function prepare(Request $request, string $clickTransId, string $merchantTransId): PaymentResult
    {
        $invoice = $this->invoiceFor($merchantTransId);

        if ($invoice === null) {
            return $this->reply(self::ERROR_ORDER_NOT_FOUND, 'Order not found', $clickTransId, $merchantTransId);
        }

        if ($invoice->state === PaymentResult::PAID) {
            return $this->reply(self::ERROR_ALREADY_PAID, 'Already paid', $clickTransId, $merchantTransId, $invoice);
        }

        if ($invoice->state === PaymentResult::CANCELLED) {
            return $this->reply(self::ERROR_TRANSACTION_CANCELLED, 'Transaction cancelled', $clickTransId, $merchantTransId, $invoice);
        }

        if ($this->tiyin($request) !== $invoice->amount) {
            return $this->reply(self::ERROR_INCORRECT_AMOUNT, 'Incorrect amount', $clickTransId, $merchantTransId, $invoice);
        }

        $reserved = $this->ledger->reserve($invoice, $clickTransId);

        return $this->reply(self::OK, 'Success', $clickTransId, $merchantTransId, $reserved, PaymentResult::PENDING);
    }

    /** The money moved. */
    private function complete(Request $request, string $clickTransId, string $merchantTransId): PaymentResult
    {
        $invoice = $this->invoiceFor($merchantTransId);

        if ($invoice === null) {
            return $this->reply(self::ERROR_ORDER_NOT_FOUND, 'Order not found', $clickTransId, $merchantTransId);
        }

        /*
         * A Complete for a payment Click has already cancelled on its own side.
         *
         * `error` on the incoming request is Click telling us the outcome, and a
         * negative value means it did not go through — settling on it would bank
         * money that was never taken.
         */
        if ($request->integer('error', 0) < 0) {
            $cancelled = $this->ledger->cancel($invoice, 'Click error='.$request->input('error_note', $request->input('error')));

            return $this->reply(
                self::ERROR_TRANSACTION_CANCELLED,
                'Transaction cancelled',
                $clickTransId,
                $merchantTransId,
                $cancelled,
                PaymentResult::CANCELLED,
            );
        }

        if ($this->tiyin($request) !== $invoice->amount) {
            return $this->reply(self::ERROR_INCORRECT_AMOUNT, 'Incorrect amount', $clickTransId, $merchantTransId, $invoice);
        }

        // Idempotent under a row lock — a repeated Complete writes one tender.
        $settled = $this->ledger->settle($invoice, $clickTransId);

        return $this->reply(self::OK, 'Success', $clickTransId, $merchantTransId, $settled, PaymentResult::PAID);
    }

    // ============ Protocol helpers ============

    private function signatureHolds(Request $request, int $action): bool
    {
        if ($this->secretKey === null || $this->secretKey === '') {
            return false;
        }

        $fields = [
            (string) $request->input('click_trans_id', ''),
            (string) $request->input('service_id', ''),
            $this->secretKey,
            (string) $request->input('merchant_trans_id', ''),
        ];

        if ($action === self::ACTION_COMPLETE) {
            // Present in Complete and absent from Prepare — the field whose
            // omission verifies half the callbacks and rejects the other half.
            $fields[] = (string) $request->input('merchant_prepare_id', '');
        }

        $fields[] = (string) $request->input('amount', '');
        $fields[] = (string) $action;
        $fields[] = (string) $request->input('sign_time', '');

        return hash_equals(
            md5(implode('', $fields)),
            mb_strtolower((string) $request->input('sign_string', '')),
        );
    }

    /**
     * Click's so'm amount as tiyin.
     *
     * Rounded rather than cast, because `(int) (45000.00 * 100)` is 4499999 on a
     * binary float often enough to matter — and every one of those is a payment
     * refused for an amount that was correct.
     */
    private function tiyin(Request $request): int
    {
        return (int) round(((float) $request->input('amount', 0)) * 100);
    }

    private function invoiceFor(string $merchantTransId): ?InvoiceRow
    {
        $invoice = $merchantTransId === '' ? null : $this->ledger->byToken($merchantTransId);

        return $invoice?->provider === $this->name() ? $invoice : null;
    }

    private function reply(
        int $error,
        string $note,
        string $clickTransId,
        string $merchantTransId,
        ?InvoiceRow $invoice = null,
        ?string $state = null,
    ): PaymentResult {
        $body = [
            'click_trans_id' => $clickTransId,
            'merchant_trans_id' => $merchantTransId,
            'error' => $error,
            'error_note' => $note,
        ];

        if ($invoice !== null) {
            /*
             * Both ids, and they are the same number on purpose.
             *
             * Click hands `merchant_prepare_id` back in the Complete signature,
             * so it has to be something we can look the invoice up by. Two
             * separate counters would mean a second table to reconcile for no
             * gain; the invoice row's own id is already unique per restaurant and
             * already what both halves of the conversation are about.
             */
            $body['merchant_prepare_id'] = (int) $invoice->getKey();
            $body['merchant_confirm_id'] = (int) $invoice->getKey();
        }

        return new PaymentResult(
            provider: $this->name(),
            state: $state ?? ($error === self::OK ? PaymentResult::PENDING : PaymentResult::FAILED),
            amount: $invoice === null ? 0 : $invoice->amount,
            reference: $clickTransId === '' ? null : $clickTransId,
            token: $invoice?->token,
            reply: $body,
            message: $note,
        );
    }
}
