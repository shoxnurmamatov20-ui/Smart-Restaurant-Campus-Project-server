<?php

declare(strict_types=1);

namespace App\Contracts\Messaging;

/**
 * What the gateway said about one message.
 *
 * A value rather than a bool, because "it did not go" has three usefully
 * different shapes — the gateway refused it, the gateway never answered, or
 * the driver is a local stub that never sends anything at all — and a caller
 * writing an audit line needs to say which.
 *
 * `reference` is the gateway's own id, and it is the only thing that makes a
 * support conversation possible three days later: "we sent it at 19:42" is not
 * an answer a mobile operator can look anything up by.
 */
final readonly class SmsDelivery
{
    private function __construct(
        public bool $accepted,
        public ?string $reference,
        public ?string $reason,
    ) {}

    public static function accepted(?string $reference = null): self
    {
        return new self(true, $reference, null);
    }

    /** @param string $reason Short, machine-ish, and safe to log — never the message body. */
    public static function refused(string $reason): self
    {
        return new self(false, null, $reason);
    }
}
