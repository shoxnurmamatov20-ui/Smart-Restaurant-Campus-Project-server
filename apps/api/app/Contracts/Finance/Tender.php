<?php

declare(strict_types=1);

namespace App\Contracts\Finance;

/**
 * One way money arrived, on one bill.
 *
 * A guest paying half in cash and half by card is two tenders, not one payment
 * with a mixed method — which is why settlement takes a list of these rather
 * than an amount and a method.
 */
final readonly class Tender
{
    /**
     * @param string $method One of the methods Finance accepts (cash, card, payme, click, uzum, corporate).
     * @param int $amount Tiyin, never a float.
     */
    public function __construct(
        public string $method,
        public int $amount,
        public ?string $reference = null,
    ) {}

    /**
     * @param array{method: string, amount: int|string, reference?: string|null} $payload
     */
    public static function fromArray(array $payload): self
    {
        return new self(
            method: (string) $payload['method'],
            amount: (int) $payload['amount'],
            reference: isset($payload['reference']) ? (string) $payload['reference'] : null,
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'method' => $this->method,
            'amount' => $this->amount,
            'reference' => $this->reference,
        ];
    }
}
