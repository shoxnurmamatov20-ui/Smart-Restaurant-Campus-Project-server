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
 * Payme (Paycom) Merchant API — the protocol where WE are the server.
 *
 * This is the shape that surprises people. With Click and most acquirers the
 * merchant posts to the bank; with Payme the bank posts to the merchant, in
 * JSON-RPC 2.0, over one endpoint, and asks five questions in a fixed order:
 *
 *   CheckPerformTransaction   may this order be paid, and is the amount right?
 *   CreateTransaction         reserve it — the guest has confirmed
 *   PerformTransaction        the money moved; close the bill
 *   CancelTransaction         put it back
 *   CheckTransaction          what state is it in? (asked whenever they doubt us)
 *
 * Payme retries anything it did not get a clean answer to, for hours. That is
 * why every write here goes through {@see OnlinePaymentLedger}, whose settle()
 * is idempotent under a row lock: six PerformTransaction retries must produce
 * one tender, and the header-based idempotency the rest of this API uses cannot
 * help, because a bank does not send our headers.
 *
 * ---------------------------------------------------------------------------
 * The error codes are not decoration
 *
 * Payme branches on the number. -31001 means "wrong amount" and it shows the
 * guest a specific screen; -31050..-31099 is the range reserved for the
 * merchant's own account errors, which is where "no such order" belongs. Return
 * a generic -32400 for an unknown order and the guest is told the payment system
 * is broken instead of that they typed the wrong bill number.
 *
 * Every one of them is answered with HTTP 200. The error lives inside the
 * JSON-RPC envelope; a 4xx or 5xx makes Payme treat it as a transport failure
 * and retry a document it has already permanently rejected.
 *
 * ---------------------------------------------------------------------------
 * Authentication is one header and nothing else
 *
 * `Authorization: Basic base64("Paycom:" + merchant key)`. There is no signature
 * over the body, so that key is the entire wall between a real
 * PerformTransaction and a stranger posting JSON at a public URL. It is compared
 * with `hash_equals` — a timing-safe comparison on the only secret in the flow —
 * and never written to a log.
 */
final class PaymeGateway implements PaymentGateway
{
    /** Payme's own numbering. Anything outside this set means something else to them. */
    private const ERROR_INVALID_AMOUNT = -31001;

    private const ERROR_TRANSACTION_NOT_FOUND = -31003;

    private const ERROR_CANNOT_PERFORM = -31008;

    private const ERROR_METHOD_NOT_FOUND = -32601;

    private const ERROR_UNAUTHORISED = -32504;

    /**
     * The merchant's own range, -31050 to -31099.
     *
     * Payme reserves it for account errors and renders whatever `message` comes
     * back with it, which is why the three sentences travel with the code.
     */
    private const ERROR_ORDER_NOT_FOUND = -31050;

    private const ERROR_ORDER_NOT_PAYABLE = -31051;

    /** Payme's transaction states, and the two ways one can be cancelled. */
    private const STATE_CREATED = 1;

    private const STATE_PERFORMED = 2;

    private const STATE_CANCELLED = -1;

    private const STATE_CANCELLED_AFTER_PERFORM = -2;

    public function __construct(
        private readonly OnlinePaymentLedger $ledger,
        private readonly ?string $merchantId,
        private readonly ?string $key,
        private readonly string $checkoutUrl,
        private readonly string $accountField,
        private readonly bool $enabled,
    ) {}

    public function name(): string
    {
        return 'payme';
    }

    public function available(): bool
    {
        return $this->enabled
            && $this->merchantId !== null && $this->merchantId !== ''
            && $this->key !== null && $this->key !== '';
    }

    /**
     * Where to send the guest.
     *
     * Payme takes its parameters as one base64 blob in the path rather than a
     * query string: `m` is the merchant, `ac.<field>` is the account (our order
     * number, under whatever field name the merchant cabinet was configured
     * with), `a` is the amount in tiyin — Payme's own unit, so no conversion —
     * and `c` is where to send the browser afterwards.
     *
     * `accountField` is configuration rather than a constant because it is
     * chosen per merchant when the cabinet is set up. Hard-coding `order_id`
     * breaks every venue that chose `bill` or `phone`, and it breaks it silently:
     * the checkout opens and Payme asks a question about a field we never send.
     */
    public function createInvoice(
        string $token,
        int $amountTiyin,
        string $orderNumber,
        ?int $orderId = null,
        ?string $returnUrl = null,
    ): PaymentInvoice {
        if (! $this->available()) {
            throw new RuntimeException('Payme provayderi sozlanmagan.');
        }

        $invoice = $this->ledger->byToken($token);

        if ($invoice === null) {
            throw new RuntimeException("To'lov hujjati topilmadi: {$token}");
        }

        /*
         * The account is our TOKEN, not the order number.
         *
         * The order number is printed on a receipt and shown to every guest at
         * the table; anybody who saw one could open a Payme checkout against
         * somebody else's bill and pay it, or — worse — probe amounts until
         * CheckPerformTransaction told them what a neighbouring table owed. The
         * token is 32 random hex characters and identifies exactly one attempt.
         */
        $parameters = [
            'm='.$this->merchantId,
            'ac.'.$this->accountField.'='.$token,
            'a='.$amountTiyin,
        ];

        if ($returnUrl !== null && $returnUrl !== '') {
            $parameters[] = 'c='.$returnUrl;
        }

        $payUrl = rtrim($this->checkoutUrl, '/').'/'.base64_encode(implode(';', $parameters));

        return $this->ledger->attach($invoice, $payUrl)->handle();
    }

    public function handleCallback(Request $request): PaymentResult
    {
        /** @var array<string, mixed> $body */
        $body = $request->json()->all();
        $rpcId = $body['id'] ?? null;

        if (! $this->authorised($request)) {
            // -32504, and not a 401. Payme reads the envelope; an HTTP status it
            // did not expect is a transport failure it will retry forever.
            return $this->refuse($rpcId, self::ERROR_UNAUTHORISED, 'Insufficient privilege to perform this method');
        }

        $method = is_string($body['method'] ?? null) ? $body['method'] : '';
        /** @var array<string, mixed> $params */
        $params = is_array($body['params'] ?? null) ? $body['params'] : [];

        try {
            return match ($method) {
                'CheckPerformTransaction' => $this->checkPerform($rpcId, $params),
                'CreateTransaction' => $this->create($rpcId, $params),
                'PerformTransaction' => $this->perform($rpcId, $params),
                'CancelTransaction' => $this->cancel($rpcId, $params),
                'CheckTransaction' => $this->check($rpcId, $params),
                default => $this->refuse($rpcId, self::ERROR_METHOD_NOT_FOUND, "Method not found: {$method}"),
            };
        } catch (Throwable $failure) {
            /*
             * Anything unforeseen is reported as "cannot perform right now".
             *
             * Deliberately a retryable code rather than a permanent refusal: an
             * exception here is our bug, and telling Payme the order can never be
             * paid would leave a guest who did nothing wrong unable to pay for
             * their dinner until somebody deployed a fix.
             */
            return $this->refuse($rpcId, self::ERROR_CANNOT_PERFORM, $failure->getMessage());
        }
    }

    /**
     * Payme reversals are not an API call.
     *
     * They are performed by Payme itself — the merchant cabinet, or Payme's own
     * support acting on a dispute — and the merchant learns about it through a
     * CancelTransaction callback, which this class already handles. There is no
     * outbound endpoint to call, so pretending there is one would report a refund
     * that never happened and leave a guest waiting for money that is not coming.
     */
    public function refund(string $providerInvoiceId, int $amountTiyin, string $reason): PaymentResult
    {
        throw new RuntimeException(
            'Payme to\'lovi API orqali qaytarilmaydi — Payme merchant kabinetidan bekor qilinadi, '
            .'natijasi CancelTransaction callback\'i bilan keladi.'
        );
    }

    // ============ The five methods ============

    /** May this be paid, and is the amount right? Nothing is written. */
    private function checkPerform(mixed $rpcId, array $params): PaymentResult
    {
        $invoice = $this->invoiceFromAccount($params);

        if ($invoice === null) {
            return $this->refuse($rpcId, self::ERROR_ORDER_NOT_FOUND, 'Buyurtma topilmadi', $this->accountField);
        }

        if (! $invoice->isOpen()) {
            return $this->refuse($rpcId, self::ERROR_ORDER_NOT_PAYABLE, 'Buyurtma to\'lovga ochiq emas', $this->accountField);
        }

        if ((int) ($params['amount'] ?? 0) !== $invoice->amount) {
            return $this->refuse($rpcId, self::ERROR_INVALID_AMOUNT, 'Noto\'g\'ri summa');
        }

        return $this->answer($rpcId, ['allow' => true], PaymentResult::PENDING, $invoice);
    }

    /** Reserve it. The guest has confirmed; the money has not moved yet. */
    private function create(mixed $rpcId, array $params): PaymentResult
    {
        $transactionId = (string) ($params['id'] ?? '');
        $existing = $transactionId === '' ? null : $this->ledger->byProviderTransaction($this->name(), $transactionId);

        if ($existing !== null) {
            // A retry of a reservation we already made. Answered with the same
            // figures rather than a second reservation: Payme compares them, and
            // a fresh `create_time` would look like a different transaction.
            return $this->answer($rpcId, [
                'create_time' => $this->millis($existing->reserved_at?->getTimestamp()),
                'transaction' => (string) $existing->getKey(),
                'state' => $this->paymeState($existing),
            ], PaymentResult::PENDING, $existing);
        }

        $invoice = $this->invoiceFromAccount($params);

        if ($invoice === null) {
            return $this->refuse($rpcId, self::ERROR_ORDER_NOT_FOUND, 'Buyurtma topilmadi', $this->accountField);
        }

        if (! $invoice->isOpen()) {
            return $this->refuse($rpcId, self::ERROR_CANNOT_PERFORM, 'Buyurtma allaqachon yopilgan');
        }

        if ((int) ($params['amount'] ?? 0) !== $invoice->amount) {
            return $this->refuse($rpcId, self::ERROR_INVALID_AMOUNT, 'Noto\'g\'ri summa');
        }

        $reserved = $this->ledger->reserve($invoice, $transactionId);

        return $this->answer($rpcId, [
            'create_time' => $this->millis($reserved->reserved_at?->getTimestamp()),
            'transaction' => (string) $reserved->getKey(),
            'state' => self::STATE_CREATED,
        ], PaymentResult::PENDING, $reserved);
    }

    /** The money moved. This is the only call that banks anything. */
    private function perform(mixed $rpcId, array $params): PaymentResult
    {
        $invoice = $this->ledger->byProviderTransaction($this->name(), (string) ($params['id'] ?? ''));

        if ($invoice === null) {
            return $this->refuse($rpcId, self::ERROR_TRANSACTION_NOT_FOUND, 'Tranzaksiya topilmadi');
        }

        // Idempotent under a row lock: a retry returns the same perform_time and
        // writes no second tender. See OnlinePaymentLedger::settle().
        $settled = $this->ledger->settle($invoice);

        return $this->answer($rpcId, [
            'transaction' => (string) $settled->getKey(),
            'perform_time' => $this->millis($settled->paid_at?->getTimestamp()),
            'state' => self::STATE_PERFORMED,
        ], PaymentResult::PAID, $settled);
    }

    /** Put it back — before the money moved, or after. */
    private function cancel(mixed $rpcId, array $params): PaymentResult
    {
        $invoice = $this->ledger->byProviderTransaction($this->name(), (string) ($params['id'] ?? ''));

        if ($invoice === null) {
            return $this->refuse($rpcId, self::ERROR_TRANSACTION_NOT_FOUND, 'Tranzaksiya topilmadi');
        }

        if ($invoice->state === PaymentResult::PAID) {
            /*
             * Money that has already reached the day's takings.
             *
             * Refused with -31008 rather than silently reversed, and the refusal
             * is the correct answer: undoing a banked payment is a refund, which
             * has to move the drawer and the bill together
             * (`TillLedger::refundPayment()`), and a state flip here would leave
             * the payment captured and the invoice claiming otherwise. Payme
             * surfaces this to the merchant, which is where the decision belongs.
             */
            return $this->refuse($rpcId, self::ERROR_CANNOT_PERFORM, 'To\'langan tranzaksiya bekor qilinmaydi');
        }

        $cancelled = $this->ledger->cancel($invoice, 'Payme reason='.(string) ($params['reason'] ?? '—'));

        return $this->answer($rpcId, [
            'transaction' => (string) $cancelled->getKey(),
            'cancel_time' => $this->millis($cancelled->cancelled_at?->getTimestamp()),
            'state' => self::STATE_CANCELLED,
        ], PaymentResult::CANCELLED, $cancelled);
    }

    /** What state is it in? Asked whenever Payme doubts an earlier answer. */
    private function check(mixed $rpcId, array $params): PaymentResult
    {
        $invoice = $this->ledger->byProviderTransaction($this->name(), (string) ($params['id'] ?? ''));

        if ($invoice === null) {
            return $this->refuse($rpcId, self::ERROR_TRANSACTION_NOT_FOUND, 'Tranzaksiya topilmadi');
        }

        return $this->answer($rpcId, [
            'create_time' => $this->millis($invoice->reserved_at?->getTimestamp()),
            'perform_time' => $this->millis($invoice->paid_at?->getTimestamp()),
            'cancel_time' => $this->millis($invoice->cancelled_at?->getTimestamp()),
            'transaction' => (string) $invoice->getKey(),
            'state' => $this->paymeState($invoice),
            'reason' => null,
        ], $invoice->state, $invoice);
    }

    // ============ Envelope helpers ============

    private function authorised(Request $request): bool
    {
        if ($this->key === null || $this->key === '') {
            return false;
        }

        $header = (string) $request->header('Authorization', '');

        if (! str_starts_with($header, 'Basic ')) {
            return false;
        }

        $decoded = base64_decode(mb_substr($header, 6), true);

        // Timing-safe, because this string is the only wall between a genuine
        // PerformTransaction and a stranger posting JSON at a public URL.
        return $decoded !== false && hash_equals('Paycom:'.$this->key, $decoded);
    }

    /**
     * The invoice a callback is about, found through the account field.
     *
     * Payme sends `params.account.<field>`; the value is our token. Older
     * cabinets nest it differently, so a flat `params.<field>` is accepted too —
     * a merchant whose cabinet was configured before the nesting convention
     * settled would otherwise see every payment fail with "order not found".
     */
    private function invoiceFromAccount(array $params): ?InvoiceRow
    {
        /** @var array<string, mixed> $account */
        $account = is_array($params['account'] ?? null) ? $params['account'] : $params;
        $token = $account[$this->accountField] ?? null;

        if (! is_string($token) || $token === '') {
            return null;
        }

        $invoice = $this->ledger->byToken($token);

        return $invoice?->provider === $this->name() ? $invoice : null;
    }

    /** Our state, in Payme's numbering. */
    private function paymeState(InvoiceRow $invoice): int
    {
        return match ($invoice->state) {
            PaymentResult::PAID => self::STATE_PERFORMED,
            PaymentResult::CANCELLED => $invoice->paid_at === null
                ? self::STATE_CANCELLED
                : self::STATE_CANCELLED_AFTER_PERFORM,
            default => self::STATE_CREATED,
        };
    }

    /** Payme deals in milliseconds; a zero means "has not happened". */
    private function millis(?int $seconds): int
    {
        return $seconds === null ? 0 : $seconds * 1_000;
    }

    /** @param array<string, mixed> $result */
    private function answer(mixed $rpcId, array $result, string $state, ?InvoiceRow $invoice = null): PaymentResult
    {
        return new PaymentResult(
            provider: $this->name(),
            state: $state,
            amount: $invoice === null ? 0 : $invoice->amount,
            reference: $invoice?->provider_invoice_id,
            token: $invoice?->token,
            reply: ['jsonrpc' => '2.0', 'id' => $rpcId, 'result' => $result],
        );
    }

    private function refuse(mixed $rpcId, int $code, string $message, ?string $field = null): PaymentResult
    {
        $error = ['code' => $code, 'message' => $this->trilingual($message)];

        if ($field !== null) {
            // Payme renders the field name beside the message, so the guest is
            // told which box was wrong rather than that "something failed".
            $error['data'] = $field;
        }

        return new PaymentResult(
            provider: $this->name(),
            state: PaymentResult::FAILED,
            reply: ['jsonrpc' => '2.0', 'id' => $rpcId, 'error' => $error],
            message: $message,
        );
    }

    /**
     * Payme's message object, which is three languages by protocol.
     *
     * Its own field names — `uz`, `ru`, `en` — happen to match this platform's
     * error envelope, and that is the only thing they have in common: this one
     * goes to a guest inside the Payme app, not to one of our surfaces. The
     * sentences are already Uzbek at every call site, so the other two carry the
     * same text rather than a machine translation nobody checked.
     *
     * @return array<string, string>
     */
    private function trilingual(string $message): array
    {
        return ['uz' => $message, 'ru' => $message, 'en' => $message];
    }
}
