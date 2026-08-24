<?php

declare(strict_types=1);

namespace App\Contracts\Finance;

use RuntimeException;

/**
 * No Finance module, no online payments — and saying so is the whole job.
 *
 * The empty list is the important half. A checkout asking "what may I offer?"
 * gets nothing and draws cash only, which is exactly right for a venue running
 * without Finance: it can still take an order, it just cannot take a card. The
 * same shape as `UnavailableDayBook`, and the opposite of `UnavailableTillLedger`
 * — that one refuses loudly because a caller trying to bank money must never be
 * told it worked, while a caller asking what buttons to draw can be told
 * "none".
 *
 * `driver()` still throws. Being handed a named provider that does not exist is
 * a caller bug rather than a missing module, and a null object that quietly
 * reported every payment as successful is the one failure mode this whole
 * subsystem must not have.
 */
final class UnavailablePaymentGateways implements PaymentGateways
{
    /** @return array<int, PaymentGateway> */
    public function enabled(): array
    {
        return [];
    }

    /** @return array<int, PaymentGateway> */
    public function all(): array
    {
        return [];
    }

    public function driver(string $provider): PaymentGateway
    {
        throw new RuntimeException(
            "Onlayn to'lov moduli o'chirilgan — '{$provider}' provayderi mavjud emas."
        );
    }

    public function isEnabled(string $provider): bool
    {
        return false;
    }
}
