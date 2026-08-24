<?php

declare(strict_types=1);

namespace Modules\Finance\Fiscal;

/**
 * What is being declared, in the terms a fiscal provider needs.
 *
 * Deliberately not the payment rows and not the order: a driver that received
 * either would be coupled to a schema it has no business knowing, and the two
 * fields it actually needs — what was sold for, and how much of that was cash —
 * would arrive buried in a model.
 *
 * Every amount is tiyin. The cash/non-cash split is not decoration: the
 * authority is told which forms of payment made up the sale, and a document
 * that declared a card sale as cash is wrong in a way an audit finds.
 */
final readonly class FiscalDocument
{
    /**
     * @param string $kind sale|refund|correction
     * @param int $total Tiyin declared.
     * @param int $cashTotal Tiyin of it taken in notes.
     * @param int $cardTotal Tiyin of it taken by any non-cash method.
     * @param int $vatTotal Tiyin of VAT already inside `$total` — the price a
     *                      guest sees includes it, so this is a breakdown and
     *                      never an addition.
     * @param string|null $correctsSign The fiscal sign of the document this one
     *                                  reverses. A refund the authority cannot
     *                                  match to a sale is a new negative sale.
     * @param array<int, array<string, mixed>> $lines What was sold, when the
     *                                                classification codes are
     *                                                available. Empty is legal
     *                                                for providers that take a
     *                                                total-only declaration.
     */
    public function __construct(
        public string $kind,
        public ?int $orderId,
        public ?string $orderNumber,
        public int $total,
        public int $cashTotal,
        public int $cardTotal,
        public int $vatTotal,
        public ?string $moduleNo = null,
        public ?string $correctsSign = null,
        public array $lines = [],
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'kind' => $this->kind,
            'order_id' => $this->orderId,
            'order_number' => $this->orderNumber,
            'total' => $this->total,
            'cash_total' => $this->cashTotal,
            'card_total' => $this->cardTotal,
            'vat_total' => $this->vatTotal,
            'module_no' => $this->moduleNo,
            'corrects_sign' => $this->correctsSign,
            'lines' => $this->lines,
            'currency' => 'UZS',
        ];
    }
}
