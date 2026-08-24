<?php

declare(strict_types=1);

namespace Modules\Crm\Services;

use Modules\Crm\Models\ComplaintCase;
use Modules\Crm\Models\Customer;

/**
 * What each of the four answers actually does to a guest's account.
 *
 * `case-actions.tsx` was explicit that the flag alone is not the answer: "a
 * 'refunded' flag with no movement through the till is a case that is closed on
 * this screen and open in the drawer". This is the movement.
 *
 * ---------------------------------------------------------------------------
 * Why a refund becomes a credit on the tab rather than a till refund
 *
 * The comment named the ideal — `POST finance/payments/{payment}/refund` against
 * the original payment — and that is not reachable from a complaints desk, for
 * two reasons that are about the building rather than about the code.
 *
 * A till refund needs a PAYMENT id, and a complaint knows an order at best: a
 * guest ringing about a missing tea has a receipt number, not the id of one of
 * the two cards that settled the table. And `TillLedger::refundPayment()` needs
 * an open shift to pay it out of, because cash leaving the box has to land on
 * somebody's Z-report — while the person answering complaints is an operator at
 * eleven at night with no drawer in front of them.
 *
 * So the money moves where it can move honestly: `crm.account_entries`, as a
 * negative balance, which is the platform's existing word for "the restaurant
 * owes this guest". It is a real ledger line with a name and a reason on it, it
 * appears on the accountant's own debtors screen with the sign that says the
 * debt runs the other way, and a cashier can settle it in cash on the guest's
 * next visit through the endpoint that already exists.
 *
 * The one thing it deliberately is NOT is a flag with nothing behind it.
 *
 * ---------------------------------------------------------------------------
 * An anonymous complaint has nowhere to put the money
 *
 * A guest who left no account and no phone number can still be answered — the
 * outcome is recorded, the history says who decided — but there is no ledger to
 * credit. Refusing the decision would leave the complaint open forever; writing
 * a ledger line against nobody would be a number in the books with no owner.
 * Recording the decision and moving no money is the honest third answer, and
 * the resource reports `outcome_tiyin` so the desk can see what was promised.
 */
final class CaseOutcomes
{
    public function __construct(private readonly EloquentGuestAccounts $accounts) {}

    /**
     * Apply one answer. Runs inside the caller's transaction.
     *
     * @param  string  $outcome  One of ComplaintCase::OUTCOMES
     * @param  int  $amount  Tiyin. Zero for a decline.
     */
    public function apply(ComplaintCase $case, string $outcome, int $amount, ?int $userId): void
    {
        if ($amount <= 0 || $case->customer_id === null) {
            return;
        }

        $reason = sprintf('%s · %s', $case->number, $outcome);

        match ($outcome) {
            /*
             * Negative, so the balance moves towards the guest. `adjust()` is
             * CRM's own method and is deliberately absent from the GuestAccounts
             * contract — forgiving or granting money is a back-office decision,
             * not a till power — which is why this service calls the
             * implementation rather than the interface.
             */
            'refunded', 'partly' => $this->accounts->adjust($case->customer_id, -$amount, $reason, $userId),

            /*
             * Points, in whole so'm.
             *
             * The loyalty balance counts so'm rather than tiyin — `POINTS` on
             * the customer is an integer of so'm, and a hundred-fold error here
             * would be a guest handed a hundred times the apology anybody meant.
             */
            'points' => $this->grantPoints($case, $amount),

            default => null,
        };
    }

    private function grantPoints(ComplaintCase $case, int $amount): void
    {
        $customer = Customer::query()->lockForUpdate()->find($case->customer_id);

        if ($customer === null) {
            return;
        }

        $customer->adjustPoints(
            'bonus',
            intdiv($amount, 100),
            $case->order_id,
            sprintf('%s · shikoyat', $case->number),
        );
    }
}
