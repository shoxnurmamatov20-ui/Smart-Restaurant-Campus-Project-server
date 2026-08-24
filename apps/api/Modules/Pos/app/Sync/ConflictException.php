<?php

declare(strict_types=1);

namespace Modules\Pos\Sync;

use RuntimeException;
use Throwable;

/**
 * One queued write disagrees with the world, and a person has to choose.
 *
 * Thrown rather than returned because it has to unwind whatever the dispatcher
 * had started: a conflict is discovered mid-operation, and half an applied bill
 * is worse than a refused one. `IdempotencyGuard` catches it, releases the claim
 * on the local id — so the till can send the same entry again once somebody has
 * decided — and the batch turns it into one `conflict` row while the rest of the
 * queue keeps draining. One unanswerable line must not strand a night's takings.
 *
 * It is deliberately not an `ApiException`. That class is final and, more to the
 * point, it answers a request; this answers ONE ENTRY inside a request that is
 * otherwise succeeding. The 409 form exists for the single-write path, where the
 * entry and the request are the same thing — see {@see self::meta()}.
 */
final class ConflictException extends RuntimeException
{
    /**
     * @param array<string, mixed> $context Everything a screen needs to phrase the
     *                                      question: which bill, which dish, both prices, the other
     *                                      till's name. Never a model — this crosses to a client.
     */
    public function __construct(
        public readonly ConflictKind $kind,
        string $message,
        public readonly array $context = [],
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, 409, $previous);
    }

    /**
     * @param array<string, mixed> $context
     */
    public static function of(ConflictKind $kind, string $message, array $context = []): self
    {
        return new self($kind, $message, $context);
    }

    /**
     * The shape a client reads, whether it arrives as a 409 body or as one row
     * of a batch response. Identical in both, on purpose: a console that can
     * draw the conflict screen for one can draw it for forty.
     *
     * @return array<string, mixed>
     */
    public function meta(): array
    {
        return [
            'conflict_kind' => $this->kind->value,
            'options' => $this->kind->options(),
            'detail' => $this->getMessage(),
            'context' => $this->context,
        ];
    }
}
