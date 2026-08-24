<?php

declare(strict_types=1);

namespace Modules\Pos\Services;

use App\Contracts\Finance\TillLedger;
use Illuminate\Support\Facades\DB;
use Modules\Pos\Models\DrawerMovement;
use Modules\Pos\Models\TerminalSession;
use RuntimeException;

/**
 * Cash in and out of the drawer, and the two lines that keep the Z-report true.
 *
 * A collection mid-shift removes real notes from a real drawer. If nothing
 * records that, the count at closing is short by exactly the amount the manager
 * walked away with — and the cashier gets blamed for it. The fix is not to
 * teach the Z-report about collections; it is to write the movement into
 * Finance, which the existing close arithmetic already accounts for.
 *
 * That was written for money leaving, and money arriving was left out for a
 * year — so change brought up from the safe closed the shift OVER by exactly the
 * amount that had been brought, which reads as the same accusation with the sign
 * flipped. Both directions are reported now; see `record()` for the single
 * exception, and why it is one.
 */
final class DrawerService
{
    public function __construct(private readonly TillLedger $till) {}

    public function record(
        TerminalSession $session,
        int $cashShiftId,
        string $kind,
        int $amount,
        string $reason,
        ?int $approvalId = null,
    ): DrawerMovement {
        if (! in_array($kind, DrawerMovement::KINDS, true)) {
            throw new RuntimeException("Noma'lum kassa harakati: {$kind}");
        }

        if ($amount <= 0) {
            throw new RuntimeException('Summa noldan katta bo\'lishi kerak.');
        }

        if (trim($reason) === '') {
            throw new RuntimeException('Sabab ko\'rsatilishi shart.');
        }

        // Direction is a property of the kind, never a caller's choice: a
        // "collection" that claimed to put money *in* would silently invert a
        // day's cash position.
        $direction = DrawerMovement::DIRECTIONS[$kind];

        return DB::transaction(function () use ($session, $cashShiftId, $kind, $amount, $reason, $approvalId, $direction): DrawerMovement {
            $expenseId = null;
            $movementId = null;

            /*
             * Both directions reach Finance now, and only one of them used to.
             *
             * Money OUT was written as a cash expense, which the expected-cash
             * calculation already subtracts. Money IN was written nowhere: a
             * `cash_in` or a `correction` produced a row in this table and
             * nothing else, so the shift closed over by exactly the amount that
             * had been put in — and a drawer that is over reads as a cashier who
             * cannot count, or as one holding the difference back. It is the same
             * defect as the collection this class was written to fix, in the
             * other direction, and it survived because the fix was written as
             * `if out` rather than as "tell Finance".
             *
             * `opening_float` is the one movement that must NOT be sent: it is a
             * drawer movement so the count is on the record, but `opening_cash`
             * on the shift already carries it, and passing it through here would
             * have every till start the day with double its float.
             */
            if ($direction === 'out') {
                $expenseId = $this->till->recordCashOut($cashShiftId, $amount, "POS: {$reason}");
            } elseif ($kind !== 'opening_float') {
                $movementId = $this->till->recordCashIn($cashShiftId, $amount, "POS: {$reason}");
            }

            return DrawerMovement::create([
                'terminal_id' => $session->terminal_id,
                'session_id' => $session->getKey(),
                'user_id' => $session->user_id,
                'cash_shift_id' => $cashShiftId,
                'finance_expense_id' => $expenseId,
                'finance_movement_id' => $movementId,
                'kind' => $kind,
                'amount' => $amount,
                'direction' => $direction,
                'reason' => $reason,
                'approval_id' => $approvalId,
                'occurred_at' => now(),
            ]);
        });
    }

    /**
     * What the drawer did this shift, for the X and Z reports.
     *
     * @return array{in: int, out: int, net: int, movements: int}
     */
    public function summaryFor(int $cashShiftId): array
    {
        $movements = DrawerMovement::query()->forShift($cashShiftId)->get();

        $in = $movements->where('direction', 'in')->sum('amount');
        $out = $movements->where('direction', 'out')->sum('amount');

        return [
            'in' => (int) $in,
            'out' => (int) $out,
            'net' => (int) $in - (int) $out,
            'movements' => $movements->count(),
        ];
    }
}
