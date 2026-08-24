<?php

declare(strict_types=1);

namespace App\Contracts\Crm;

use RuntimeException;

/**
 * Running a tab, from outside the CRM module.
 *
 * "Balansiga yozildi · pul kelmadi" — the sale happened and the cash did not.
 * A regular signs for lunch, the food leaves the kitchen, and the money arrives
 * on Friday. The POS has to be able to do that without importing a CRM model,
 * which is what this interface is for.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately NOT here
 *
 * `adjust()` and `writeOff()` exist on the implementation and stay off this
 * contract. Forgiving a debt is a back-office decision made in writing, not a
 * till power — and a terminal that could reach it is a terminal that can make a
 * guest's balance disappear between two shifts.
 *
 * There is also no HTTP route that charges a tab, for the same shape of reason:
 * a charge is idempotent per bill (a partial unique index enforces it), and an
 * open endpoint would let the same meal be signed for twice.
 *
 * ---------------------------------------------------------------------------
 * The boundary, stated rather than implied
 *
 * CRM cannot verify an approval. Checking one means reading the POS module,
 * which `ModuleBoundaryTest` forbids — so `charge()` RECORDS the `approvalId`
 * it is handed and the POS is what actually enforces the ceiling, through
 * `ApprovalGate::consume()`. That looks like a hole to anyone reading only the
 * CRM side. It is not; it is the boundary, and the fix is never to import Pos.
 */
interface GuestAccounts
{
    /**
     * This guest's tab, or null when there is no such customer.
     *
     * Read BEFORE the "on account" button is drawn, not after it is pressed. A
     * till that offers the tender and then refuses it has done so with the guest
     * standing at the counter and the meal already eaten.
     */
    public function find(int $customerId): ?GuestAccount;

    /**
     * Put a bill on the tab.
     *
     * Idempotent per bill: a partial unique index refuses a second charge against
     * the same `orderId`, which is what makes an offline queue safe to replay.
     * A charge with no order — a deposit, a correction — is always accepted,
     * because there is nothing to be idempotent against.
     *
     * @param  int|null  $approvalId  The manager's signature, when the amount went
     *                                past the ceiling. Recorded here; ENFORCED in the POS. See the class
     *                                note.
     * @return int The ledger entry id.
     *
     * @throws RuntimeException when the guest has no tab, is inactive, or the
     *                          amount would pass the limit without a signature
     */
    public function charge(
        int $customerId,
        int $amount,
        ?int $orderId = null,
        ?string $orderNumber = null,
        ?int $paymentId = null,
        ?int $userId = null,
        ?int $approvalId = null,
        ?string $note = null,
    ): int;

    /**
     * The guest pays the tab down.
     *
     * Carries the `paymentId` so the two halves can be reconciled: Finance
     * captured money and CRM reduced a debt, and an auditor asking which payment
     * cleared which balance has one answer rather than a guess by timestamp.
     *
     * Refuses to overshoot unless told otherwise — paying more than is owed turns
     * a debt into a deposit, which is a real thing a restaurant does and a
     * terrible thing to do by accident.
     *
     * @return int The ledger entry id.
     */
    public function settle(
        int $customerId,
        int $amount,
        ?int $paymentId = null,
        ?int $userId = null,
        ?string $note = null,
        bool $acceptDeposit = false,
    ): int;

    /**
     * Take a bill back off the tab.
     *
     * The refund path: a signed-for meal that is being reversed has to come off
     * the balance, or the guest pays on Friday for food they sent back.
     *
     * Answers null when the bill was never on a tab, so the POS does not have to
     * know whether a settlement was a credit sale before asking.
     *
     * @param  int|null  $amount  Part of the charge, or null for all of it.
     */
    public function reverseCharge(
        int $orderId,
        string $reason,
        ?int $amount = null,
        ?int $userId = null,
    ): ?int;

    /**
     * Everything owed to this restaurant right now, in tiyin.
     *
     * The Z-report's explaining line. Without it a day that sold 4 000 000 and
     * banked 3 200 000 shows an 800 000 hole, and the manager goes looking for a
     * thief instead of reading "sold, not yet collected".
     */
    public function outstandingTotal(): int;
}
