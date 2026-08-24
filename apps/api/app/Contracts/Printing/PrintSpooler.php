<?php

declare(strict_types=1);

namespace App\Contracts\Printing;

use App\Contracts\Finance\Tender;
use App\Contracts\Orders\Bill;
use App\Support\Finance\TenderPlan;

/**
 * The one way to put something on paper from outside the printing module.
 *
 * The till needs two things a printer does — a guest's receipt, and the pulse that
 * pops the cash drawer — and it may not import the module that owns them. Kitchen
 * dockets are not here on purpose: the kitchen prints its own tickets and nothing
 * crosses a boundary to do it, so a contract for it would be ceremony.
 *
 * **Nothing here throws, and nothing here blocks a sale.** That is the deliberate
 * difference from `TillLedger`, whose fallback refuses precisely because a POS
 * quietly "selling" into a module that is not running would take cash off guests
 * with no record of it. Paper is the opposite: a printer that is out, unplugged or
 * simply not installed must never stop a restaurant from serving. The sale is the
 * record; the receipt is a courtesy, and a re-print costs nothing.
 *
 * So every method answers a {@see PrintOutcome} and the caller is free to ignore
 * it. What it must NOT do is treat a failure as a reason to refuse the tender.
 */
interface PrintSpooler
{
    /**
     * The guest's receipt, 80 mm.
     *
     * Takes the whole {@see TenderPlan} rather than a change figure, because a
     * receipt has to show why the cash total differs from the bill total. DECISIONS
     * Q7 rounds cash to the nearest 1 000 so'm, and a slip that says 45 000 against
     * a bill of 45 240 with nothing naming the difference reads, to a guest, as the
     * till having got their order wrong. The plan carries the rounding, the tip and
     * the change together, and all three belong on the paper.
     *
     * @param array<int, Tender> $tenders How it was paid, for
     *                                    the payment lines. Cards want their last four and their reference.
     * @param int|null $printerId Override the branch's default — a re-print at a
     *                            second till, or a manager reprinting at the office printer.
     * @param string|null $idempotencyKey The device's own id for this print. A
     *                                    retried settlement must not put two receipts on the counter.
     */
    public function receipt(
        Bill $bill,
        TenderPlan $plan,
        array $tenders = [],
        ?int $printerId = null,
        ?string $idempotencyKey = null,
    ): PrintOutcome;

    /**
     * Open the cash drawer — `ESC p 0`.
     *
     * A pulse on the printer's kick port, not a print: no paper moves. It is here
     * rather than on a drawer service because in practice the drawer is wired to
     * the receipt printer, and whoever can reach the printer is the only thing that
     * can open it.
     *
     * Every call is a drawer opening and every drawer opening is worth recording —
     * the implementation is expected to log it. A till that could open the box
     * silently is the till a shortfall hides behind.
     */
    public function openDrawer(?int $printerId = null, ?string $idempotencyKey = null): PrintOutcome;

    /**
     * Put this venue's given-up print jobs back in the queue.
     *
     * The one thing a cashier standing in front of a dead printer can usefully
     * do once the paper is back in. The queue retries itself while a job is
     * still `queued` — that is what the backoff is for — but a job that
     * exhausted its attempts is `failed` and stays failed, deliberately: a
     * receipt that reprinted itself six hours later, unattended, is a document
     * on a public counter with nobody there to take it.
     *
     * So somebody has to say "try again", and until now the only doors that
     * could say it were `POST /kitchen/print-jobs/{job}/retry` (`kitchen.update`)
     * and `POST /kitchen/printers/{printer}/test` (`kitchen.manage`) — neither of
     * which a cashier's role holds. The till's own status strip drew a *Qayta
     * urinish* button it could not wire, and said so.
     *
     * Scoped to one venue, because it is pressed by a person in a building.
     * Returns how many jobs moved, which is what the strip shows: "4 ta chek
     * qayta navbatga qo'yildi" is an answer; a spinner that says "reconnected"
     * is a cashier walking away from a printer that is still dead.
     *
     * @param int|null $branchId Null means the whole restaurant, which only a
     *                           back-office caller should ever pass.
     *
     * @return int How many jobs were re-queued.
     */
    public function requeueFailed(?int $branchId = null): int;
}
