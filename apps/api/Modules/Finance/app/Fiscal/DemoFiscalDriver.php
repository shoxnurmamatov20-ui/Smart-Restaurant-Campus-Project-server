<?php

declare(strict_types=1);

namespace Modules\Finance\Fiscal;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * A provider that answers, for a machine with no tax authority on it.
 *
 * Everything around fiscalisation — the queue, the backoff, the window, the
 * correction of a refunded meal, the duplicate stamp — is provider-independent
 * and is most of the work. None of it can be developed or tested against a
 * government endpoint, so this stands in for one.
 *
 * ---------------------------------------------------------------------------
 * It refuses to run in production, and that guard is the important line here
 *
 * This class manufactures fiscal signs. A sign is what a guest scans to check
 * that their meal was declared, and one that leads nowhere is worse than no
 * receipt at all: the restaurant believes it is compliant, the guest believes
 * they have proof, and the tax authority has never heard of any of it. A
 * misconfigured `FISCAL_DRIVER` on a live server would produce exactly that,
 * silently, for as long as nobody scanned a QR.
 *
 * So the marks are deliberately unmistakable — the sign carries a `DEMO` prefix
 * and the QR points at nothing — and the constructor throws outright when the
 * application is in production. A fake that is hard to tell from the real thing
 * is not a useful test double; it is a liability with a nice interface.
 */
final class DemoFiscalDriver implements FiscalDriver
{
    /**
     * @param  string  $moduleNo  Eight digits, because the probe checks for them
     *                            and a demo that failed its own probe would teach
     *                            nothing about the real one.
     */
    public function __construct(
        private readonly string $moduleNo = '00000000',
        private readonly bool $production = false,
    ) {
        if ($this->production) {
            throw new RuntimeException(
                'DemoFiscalDriver production muhitida ishlamaydi: u soxta fiskal belgi yasaydi. '
                .'FISCAL_DRIVER ni haqiqiy OFD provayderiga o\'zgartiring.'
            );
        }
    }

    public function name(): string
    {
        return 'demo';
    }

    public function probe(): FiscalProbe
    {
        return new FiscalProbe(
            provider: $this->name(),
            reachable: true,
            moduleNo: $this->moduleNo,
            message: 'Demo fiskal drayveri javob berdi — bu HAQIQIY OFD emas.',
        );
    }

    public function register(FiscalDocument $document): FiscalMarks
    {
        /*
         * The one check a real driver also has to make.
         *
         * A document with nothing in it is not a sale, and filing one would
         * declare a meal that was never served. Rejected rather than reported
         * unavailable: no amount of retrying turns zero into a total.
         */
        if ($document->total <= 0) {
            throw new FiscalRejected('Fiskal hujjat summasi noldan katta bo\'lishi kerak.');
        }

        if ($document->cashTotal + $document->cardTotal !== $document->total) {
            // The split has to add up, and a provider that accepted a document
            // where it did not would have declared a different sale from the one
            // that happened.
            throw new FiscalRejected('Naqd va naqdsiz yig\'indisi umumiy summaga teng emas.');
        }

        // Logged rather than sent, so a developer can read exactly what a real
        // provider would have received — which is the other half of what this
        // class is for.
        Log::debug('fiscal.demo.register', $document->toArray());

        $sign = 'DEMO-'.strtoupper(substr(hash('sha256', json_encode($document->toArray(), JSON_THROW_ON_ERROR)), 0, 16));

        return new FiscalMarks(
            fiscalSign: $sign,
            receiptSeq: (string) random_int(100_000, 999_999),
            moduleNo: $this->moduleNo,
            // Deliberately not a soliq.uz address: a demo QR that led to the
            // real checker would show "not found" and read as a failed filing
            // rather than as a machine with no tax authority on it.
            qrUrl: 'about:blank#demo-fiscal-'.$sign,
            registeredAt: CarbonImmutable::now(),
        );
    }
}
