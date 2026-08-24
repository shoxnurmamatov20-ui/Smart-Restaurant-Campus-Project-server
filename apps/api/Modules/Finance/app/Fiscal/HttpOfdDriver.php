<?php

declare(strict_types=1);

namespace Modules\Finance\Fiscal;

use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * A real OFD, over HTTP — the driver every Uzbek installation actually files
 * through.
 *
 * ---------------------------------------------------------------------------
 * Why one class serves several operators
 *
 * Uzbekistan has a handful of fiscal data operators (soliq.uz's own service,
 * MultiBank, and others) and a restaurant uses exactly one, chosen by its
 * accountant. Their contracts are handed out per merchant and are not public,
 * but the shape they share is not in doubt, because it is the shape the law
 * requires: post a document, receive back a fiscal sign, a receipt number and a
 * QR the guest can scan on soliq.uz to check that their meal was declared.
 *
 * So the differences between operators are endpoint paths and field names, and
 * both of those are configuration here rather than four near-identical classes.
 * When a venue's integration document arrives, connecting it is an environment
 * file — `FISCAL_OFD_URL`, `FISCAL_OFD_TOKEN`, and the four field names below —
 * and no PHP at all in the common case.
 *
 * **What is verified:** the queue, the backoff, the 24-hour window, the
 * correction flow and the duplicate stamp — all of it in `FiscalRegistrar`, all
 * of it exercised against `DemoFiscalDriver`. **What is not:** the field names.
 * They are named in config for exactly that reason, and `probe()` is what a
 * manager runs on the day the contract lands to find out whether they are right
 * before a single guest is handed a receipt.
 *
 * ---------------------------------------------------------------------------
 * The two failures, and getting them the right way round
 *
 * {@see FiscalDriver} states the rule: `FiscalUnavailable` is "not now" and goes
 * back in the queue; `FiscalRejected` is "not this document" and must not be
 * retried for a day. Here that maps onto the response:
 *
 *   a timeout, a connection refused, a 5xx      → unavailable
 *   a 4xx, or a 200 carrying an error code      → rejected
 *
 * A 429 is the one that does not follow the status class: it is rate limiting,
 * which is the most transient failure there is, and treating it as a rejection
 * would permanently drop the receipts of a restaurant that got busy.
 */
final class HttpOfdDriver implements FiscalDriver
{
    /**
     * How long to wait for the tax service.
     *
     * Short, and it is not a performance choice. `FiscalRegistrar` files after
     * the sale's transaction has committed, so nothing is holding a row lock —
     * but the request still occupies a worker, and an OFD that has stopped
     * answering must not be able to occupy all of them during a Friday service.
     * The queue is what handles a slow provider; a long timeout only delays the
     * moment it takes over.
     */
    private const TIMEOUT_SECONDS = 8;

    /**
     * @param string $provider Stored on every receipt row: `soliq`, `multibank`.
     * @param array<string, string> $fields The operator's own names for the four
     *                                      values that come back. Configuration
     *                                      rather than constants — see the class
     *                                      docblock.
     */
    public function __construct(
        private readonly string $provider,
        private readonly string $baseUrl,
        private readonly ?string $token,
        private readonly ?string $moduleNo,
        private readonly array $fields = [],
        private readonly string $registerPath = '/receipts',
        private readonly string $statusPath = '/status',
    ) {}

    public function name(): string
    {
        return $this->provider;
    }

    /**
     * Is there anything on the other end, and does this till have a number.
     *
     * Both halves, because they are different faults needing opposite responses:
     * a configured module number with a dead endpoint is a restaurant that
     * believes it is filing receipts, and an answering endpoint with no module
     * number is one that cannot file any. The plan asks for at least eight
     * digits and that check is here rather than in config validation, so a
     * manager running the probe sees the actual reason rather than a boot
     * failure somebody else has to read.
     */
    public function probe(): FiscalProbe
    {
        if ($this->moduleNo === null || ! preg_match('/^\d{8,}$/', $this->moduleNo)) {
            return new FiscalProbe(
                provider: $this->provider,
                reachable: false,
                moduleNo: $this->moduleNo,
                message: 'Fiskal modul raqami yo\'q yoki noto\'g\'ri — kamida 8 raqam bo\'lishi kerak (FISCAL_MODULE_NO).',
            );
        }

        if ($this->token === null || $this->token === '') {
            return new FiscalProbe(
                provider: $this->provider,
                reachable: false,
                moduleNo: $this->moduleNo,
                message: 'OFD kaliti sozlanmagan (FISCAL_OFD_TOKEN).',
            );
        }

        try {
            $response = $this->client()->get($this->statusPath);
        } catch (Throwable $failure) {
            return new FiscalProbe(
                provider: $this->provider,
                reachable: false,
                moduleNo: $this->moduleNo,
                message: $failure->getMessage(),
            );
        }

        return new FiscalProbe(
            provider: $this->provider,
            reachable: $response->successful(),
            moduleNo: $this->moduleNo,
            message: $response->successful()
                ? 'OFD javob berdi.'
                : 'OFD '.$response->status().' qaytardi: '.mb_substr($response->body(), 0, 160),
        );
    }

    public function register(FiscalDocument $document): FiscalMarks
    {
        /*
         * The two checks a driver must make before spending a network round trip.
         *
         * Rejected rather than reported unavailable, because no amount of
         * retrying turns zero into a total or makes a split add up — and a
         * document retried every ten minutes for a day is a thousand identical
         * refusals that still miss the window.
         */
        if ($document->total <= 0) {
            throw new FiscalRejected('Fiskal hujjat summasi noldan katta bo\'lishi kerak.');
        }

        if ($document->cashTotal + $document->cardTotal !== $document->total) {
            throw new FiscalRejected('Naqd va naqdsiz yig\'indisi umumiy summaga teng emas.');
        }

        if ($this->moduleNo === null || $this->token === null || $this->token === '') {
            // Unavailable, not rejected: the document is fine and the
            // installation is not. It files itself the moment somebody fills the
            // environment file in, which is exactly what the queue is for.
            throw new FiscalUnavailable('OFD sozlanmagan — fiskal modul raqami yoki kalit yo\'q.');
        }

        try {
            $response = $this->client()->post($this->registerPath, $this->payload($document));
        } catch (ConnectionException $unreachable) {
            throw new FiscalUnavailable('OFD ga ulanib bo\'lmadi: '.$unreachable->getMessage());
        } catch (Throwable $failure) {
            throw new FiscalUnavailable('OFD so\'rovi bajarilmadi: '.$failure->getMessage());
        }

        $this->refuseIfFailed($response);

        return $this->marksFrom($response);
    }

    // ============ Internals ============

    private function client(): PendingRequest
    {
        return Http::asJson()
            ->acceptJson()
            ->withToken((string) $this->token)
            ->baseUrl(rtrim($this->baseUrl, '/'))
            ->timeout(self::TIMEOUT_SECONDS)
            /*
             * No retries here, and that is deliberate.
             *
             * `FiscalRegistrar` owns the retry policy and it is a queue with six
             * backoff rungs across three hours. A client-level retry would sit
             * inside it, tripling the time a worker is held for a provider that
             * is down while producing the same outcome the queue would have
             * produced a minute later.
             */
            ->retry(0);
    }

    /**
     * The document, in the operator's own field names.
     *
     * `lines` is sent when the bill's lines are available and omitted when they
     * are not: several operators accept a total-only declaration, and sending an
     * empty array reads to some of them as "a sale with no items", which is
     * refused. `FiscalDocument` already models that distinction.
     *
     * @return array<string, mixed>
     */
    private function payload(FiscalDocument $document): array
    {
        $body = [
            'module_no' => $document->moduleNo ?? $this->moduleNo,
            'operation' => $document->kind,
            'receipt_id' => $document->orderNumber,
            'total' => $document->total,
            'cash' => $document->cashTotal,
            'card' => $document->cardTotal,
            'vat' => $document->vatTotal,
            'currency' => 'UZS',
            'time' => CarbonImmutable::now()->toIso8601String(),
        ];

        if ($document->correctsSign !== null) {
            // A reversal the authority cannot match to a sale is treated as a
            // new negative sale, which is a different thing and a worse one.
            $body['corrects'] = $document->correctsSign;
        }

        if ($document->lines !== []) {
            $body['items'] = $document->lines;
        }

        return $body;
    }

    /**
     * Turn a failed response into the right kind of refusal.
     *
     * The mapping is the whole of a driver's judgement, and getting it backwards
     * is expensive in both directions: everything-unavailable turns every
     * mistake into an expired receipt, everything-rejected turns a five-second
     * outage into a permanent liability.
     */
    private function refuseIfFailed(Response $response): void
    {
        if ($response->successful() && $this->errorIn($response) === null) {
            return;
        }

        $detail = $this->errorIn($response) ?? mb_substr($response->body(), 0, 200);

        // Rate limiting is the most transient failure there is, and it does not
        // follow its status class. A busy restaurant must not lose its receipts.
        if ($response->status() === 429 || $response->serverError()) {
            throw new FiscalUnavailable("OFD {$response->status()}: {$detail}");
        }

        throw new FiscalRejected("OFD hujjatni rad etdi ({$response->status()}): {$detail}");
    }

    /**
     * Several operators answer 200 with an error inside the body.
     *
     * Checking only the HTTP status would file nothing and record every one of
     * them as a successful declaration — the worst outcome available, because
     * the receipt would carry a fiscal sign that is not one.
     */
    private function errorIn(Response $response): ?string
    {
        $code = $response->json($this->field('error_code', 'error_code'));

        if ($code === null || $code === 0 || $code === '0') {
            return null;
        }

        return (string) $code.': '.(string) $response->json($this->field('error_message', 'error_message'), '');
    }

    private function marksFrom(Response $response): FiscalMarks
    {
        $sign = (string) $response->json($this->field('fiscal_sign', 'fiscal_sign'), '');

        if ($sign === '') {
            /*
             * An answer with no fiscal sign in it.
             *
             * Rejected rather than accepted-with-an-empty-string, because an
             * empty sign printed on a receipt is a QR that leads nowhere: the
             * restaurant believes it is compliant, the guest believes they have
             * proof, and the tax authority has never heard of any of it. The same
             * failure `DemoFiscalDriver` refuses to create in production.
             */
            throw new FiscalRejected('OFD javobida fiskal belgi yo\'q.');
        }

        return new FiscalMarks(
            fiscalSign: $sign,
            receiptSeq: (string) $response->json($this->field('receipt_seq', 'receipt_seq'), ''),
            moduleNo: (string) $this->moduleNo,
            qrUrl: (string) $response->json($this->field('qr_url', 'qr_url'), $this->checkerUrl($sign)),
            registeredAt: CarbonImmutable::now(),
        );
    }

    /**
     * Where a guest scans to check their meal was declared.
     *
     * Built from the sign when the operator does not return a URL of its own.
     * ofd.soliq.uz is the authority's own checker, so a receipt printed from
     * this driver always carries something a guest can actually verify — which
     * is the entire consumer-facing point of fiscalisation.
     */
    private function checkerUrl(string $sign): string
    {
        return 'https://ofd.soliq.uz/check?t='.rawurlencode((string) $this->moduleNo)
            .'&f='.rawurlencode($sign);
    }

    private function field(string $key, string $default): string
    {
        $name = $this->fields[$key] ?? null;

        return is_string($name) && $name !== '' ? $name : $default;
    }
}
