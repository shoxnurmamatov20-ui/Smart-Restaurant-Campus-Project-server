<?php

declare(strict_types=1);

namespace App\Contracts\Finance;

/**
 * What a provider's callback turned out to mean, and what to say back to it.
 *
 * The second half is unusual and it is the important one. Every other endpoint
 * on this platform answers in the one error envelope
 * (`App\Support\Errors\ErrorResponse`), because fourteen surfaces read it and
 * they all read it the same way. A payment provider is not one of those
 * surfaces: Payme expects JSON-RPC 2.0 with its own numbered error codes, Click
 * expects a flat object with `error` and `error_note`, and neither will retry
 * or reconcile if it is handed `{"error": {"code": "finance.…"}}` instead.
 *
 * So the driver — the only thing that knows the protocol — decides the body,
 * and `reply` carries it out through the controller verbatim. The controller
 * stays protocol-free, which is the whole point of having a driver.
 *
 * A callback that means nothing happened is still a result: `state` says
 * `pending`, `reply` says whatever the provider needs to hear, and no money
 * moves. Reporting that as an exception would make a routine "is this order
 * payable?" probe look like a failure in the logs of the one subsystem that
 * must never be noisy.
 */
final readonly class PaymentResult
{
    /** Waiting for the guest — the provider has only asked a question so far. */
    public const PENDING = 'pending';

    /** The money is with the provider and the bill can be closed. */
    public const PAID = 'paid';

    /** The guest walked away, or the provider reversed it. */
    public const CANCELLED = 'cancelled';

    /** The provider refused: wrong amount, unknown order, bad signature. */
    public const FAILED = 'failed';

    public const STATES = [self::PENDING, self::PAID, self::CANCELLED, self::FAILED];

    /**
     * @param  string  $state  One of self::STATES.
     * @param  int  $amount  Tiyin the provider says it is holding. Zero when the
     *                       callback carried no amount — a status probe, a cancel.
     * @param  string|null  $reference  The provider's transaction id, which is what
     *                                  an accountant quotes when a guest disputes a
     *                                  charge. Stored on the payment row.
     * @param  array<string, mixed>  $reply  The body to send back, in the provider's
     *                                       own shape. See the class docblock.
     * @param  int  $status  The HTTP status for that body. Payme wants 200 even for
     *                       its own errors — the error lives inside the JSON-RPC
     *                       envelope, and a 4xx makes it retry a document it has
     *                       already rejected.
     */
    public function __construct(
        public string $provider,
        public string $state,
        public int $amount = 0,
        public ?string $reference = null,
        public ?string $token = null,
        public array $reply = [],
        public int $status = 200,
        public ?string $message = null,
    ) {}

    public function isPaid(): bool
    {
        return $this->state === self::PAID;
    }
}
