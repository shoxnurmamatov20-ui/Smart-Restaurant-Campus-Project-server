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
     * @param  string  $method  One of the methods Finance accepts — see Payment::METHODS.
     * @param  int  $amount  Tiyin, never a float. What is owed on the bill, before rounding.
     * @param  int  $tip  Tiyin on top, DECISIONS Q6. Never revenue and never taxed as a
     *                    sale, but in the drawer at counting time — which is why it
     *                    travels beside the amount rather than inside it.
     */
    public function __construct(
        public string $method,
        public int $amount,
        public ?string $reference = null,
        public int $tip = 0,
    ) {}

    /**
     * @param  array{method: string, amount: int|string, reference?: string|null, tip?: int|string|null}  $payload
     */
    public static function fromArray(array $payload): self
    {
        return new self(
            method: (string) $payload['method'],
            amount: (int) $payload['amount'],
            reference: isset($payload['reference']) ? (string) $payload['reference'] : null,
            tip: (int) ($payload['tip'] ?? 0),
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
            'tip' => $this->tip,
        ];
    }
}
