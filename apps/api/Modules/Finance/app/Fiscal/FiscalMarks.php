<?php

declare(strict_types=1);

namespace Modules\Finance\Fiscal;

use Carbon\CarbonImmutable;

/**
 * What the authority stamped on a declaration.
 *
 * The fiscal sign is the whole point: it is what the guest checks and what
 * proves the meal was declared. Everything else here is context for a dispute —
 * which module filed it, which sequence number it got, where to look it up.
 */
final readonly class FiscalMarks
{
    public function __construct(
        public string $fiscalSign,
        public ?string $receiptSeq = null,
        public ?string $moduleNo = null,
        public ?string $qrUrl = null,
        public ?CarbonImmutable $registeredAt = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'fiscal_sign' => $this->fiscalSign,
            'receipt_seq' => $this->receiptSeq,
            'module_no' => $this->moduleNo,
            'qr_url' => $this->qrUrl,
            'registered_at' => $this->registeredAt?->toIso8601String(),
        ];
    }
}
