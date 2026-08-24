<?php

declare(strict_types=1);

namespace App\Contracts\Crm;

use RuntimeException;

/**
 * What callers get when the CRM module is not installed or is switched off.
 *
 * Split down the middle, and the split is the whole design. The **reads** answer
 * "nothing": no such guest, no tab, nothing outstanding. A till whose credit
 * button simply does not appear is a till that sells for cash, which is a working
 * restaurant.
 *
 * The **writes** refuse, loudly. A tab recorded into a module that is not running
 * is a meal given away with no record of who owes for it — the guest leaves
 * believing they have signed, the restaurant has no line to collect against, and
 * nothing anywhere reports it. That is the same reasoning as
 * `UnavailableBillRegistry` and `UnavailableTillLedger`, and the opposite of
 * `UnavailablePrintSpooler`: paper can be missing, money cannot.
 */
final class UnavailableGuestAccounts implements GuestAccounts
{
    public function find(int $customerId): ?GuestAccount
    {
        return null;
    }

    public function charge(
        int $customerId,
        int $amount,
        ?int $orderId = null,
        ?string $orderNumber = null,
        ?int $paymentId = null,
        ?int $userId = null,
        ?int $approvalId = null,
        ?string $note = null,
    ): int {
        $this->refuse();
    }

    public function settle(
        int $customerId,
        int $amount,
        ?int $paymentId = null,
        ?int $userId = null,
        ?string $note = null,
        bool $acceptDeposit = false,
    ): int {
        $this->refuse();
    }

    public function reverseCharge(
        int $orderId,
        string $reason,
        ?int $amount = null,
        ?int $userId = null,
    ): ?int {
        return null;
    }

    public function outstandingTotal(): int
    {
        return 0;
    }

    private function refuse(): never
    {
        throw new RuntimeException(
            'CRM moduli o\'chirilgan — qarzga sotib bo\'lmaydi. '.
            'Enable the CRM module before selling on account.',
        );
    }
}
