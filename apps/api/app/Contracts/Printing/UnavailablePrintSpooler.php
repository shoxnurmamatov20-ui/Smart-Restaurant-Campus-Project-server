<?php

declare(strict_types=1);

namespace App\Contracts\Printing;

use App\Contracts\Orders\Bill;
use App\Support\Finance\TenderPlan;

/**
 * What callers get when no printing module is installed.
 *
 * Answers "nothing was queued, and that is fine". Deliberately unlike
 * `UnavailableBillRegistry` and `UnavailableTillLedger`, which refuse loudly: those
 * guard money, and a sale recorded nowhere is theft by accident. This guards paper,
 * and a restaurant with no printer is a restaurant, not an error — plenty of venues
 * run entirely from screens.
 *
 * The one thing it must never do is throw. A settlement is wrapped in a
 * transaction, so an exception raised while printing a receipt would roll back the
 * payment that was already captured — the guest's card charged, the bill still
 * open, and the cause a printer nobody had plugged in.
 */
final class UnavailablePrintSpooler implements PrintSpooler
{
    public function receipt(
        Bill $bill,
        TenderPlan $plan,
        array $tenders = [],
        ?int $printerId = null,
        ?string $idempotencyKey = null,
    ): PrintOutcome {
        return PrintOutcome::skipped('no_printer');
    }

    public function openDrawer(?int $printerId = null, ?string $idempotencyKey = null): PrintOutcome
    {
        return PrintOutcome::skipped('no_printer');
    }

    /** No queue, so nothing to put back in it. Zero, not a refusal — see above. */
    public function requeueFailed(?int $branchId = null): int
    {
        return 0;
    }
}
