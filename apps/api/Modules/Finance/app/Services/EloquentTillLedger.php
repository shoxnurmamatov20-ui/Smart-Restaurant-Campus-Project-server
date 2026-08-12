<?php

declare(strict_types=1);

namespace Modules\Finance\Services;

use App\Contracts\Finance\ShiftTotals;
use App\Contracts\Finance\Tender;
use App\Contracts\Finance\TillLedger;
use Illuminate\Support\Facades\DB;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;
use RuntimeException;

/**
 * Finance answering the platform's write contract for money.
 *
 * The POS never touches a payment row. It asks for one, and this class decides
 * whether that is allowed — which is the only arrangement where "what did we
 * take today" can have a single answer.
 *
 * Note what is *not* here: any way for a caller to state the expected cash in a
 * drawer. `CashShift::close()` derives it from what was taken and paid out, and
 * this class simply passes the count through. A collection mid-shift is recorded
 * as a cash expense for the same reason — the existing arithmetic already
 * subtracts cash paid out, so an inkassatsiya stops looking like a shortfall
 * without anybody editing that calculation.
 */
final class EloquentTillLedger implements TillLedger
{
    public function openShift(int $userId, int $openingCash = 0): int
    {
        if ($openingCash < 0) {
            throw new RuntimeException('Boshlang\'ich naqd manfiy bo\'la olmaydi.');
        }

        return DB::transaction(function () use ($userId, $openingCash): int {
            $existing = CashShift::query()->open()->where('opened_by_user_id', $userId)->first();

            if ($existing !== null) {
                // Two open shifts for one cashier means every payment after the
                // second one lands in an arbitrary drawer.
                throw new RuntimeException('Sizda allaqachon ochiq smena bor.');
            }

            $shift = CashShift::create([
                'number' => $this->nextShiftNumber(),
                'opened_by_user_id' => $userId,
                'opened_at' => now(),
                'opening_cash' => $openingCash,
                'expected_cash' => 0,
                'counted_cash' => 0,
                'difference' => 0,
                'status' => 'open',
            ]);

            return (int) $shift->getKey();
        });
    }

    public function openShiftFor(int $userId): ?int
    {
        $id = CashShift::query()->open()->where('opened_by_user_id', $userId)->value('id');

        return $id === null ? null : (int) $id;
    }

    public function closeShift(int $shiftId, int $countedCash, ?string $note = null): ShiftTotals
    {
        if ($countedCash < 0) {
            throw new RuntimeException('Sanalgan naqd manfiy bo\'la olmaydi.');
        }

        return DB::transaction(function () use ($shiftId, $countedCash, $note): ShiftTotals {
            $shift = $this->shiftOrFail($shiftId);

            if ($shift->status === 'closed') {
                throw new RuntimeException('Bu smena allaqachon yopilgan.');
            }

            // The existing model owns the arithmetic. Nothing here recomputes
            // it — two places that both work out expected cash is one place too
            // many.
            $shift->close($countedCash, $note);

            return $this->totalsFor($shift->refresh());
        });
    }

    public function capture(int $shiftId, int $orderId, string $orderNumber, Tender $tender): int
    {
        if ($tender->amount <= 0) {
            throw new RuntimeException('To\'lov summasi noldan katta bo\'lishi kerak.');
        }

        if (! in_array($tender->method, Payment::METHODS, true)) {
            throw new RuntimeException("Noma'lum to'lov usuli: {$tender->method}");
        }

        return DB::transaction(function () use ($shiftId, $orderId, $orderNumber, $tender): int {
            $shift = $this->shiftOrFail($shiftId);

            if ($shift->status !== 'open') {
                throw new RuntimeException('Yopilgan smenaga to\'lov yozib bo\'lmaydi.');
            }

            $payment = Payment::create([
                'cash_shift_id' => $shift->getKey(),
                'order_id' => $orderId,
                'order_number' => $orderNumber,
                'method' => $tender->method,
                'amount' => $tender->amount,
                'status' => 'captured',
                'paid_at' => now(),
            ]);

            return (int) $payment->getKey();
        });
    }

    public function refund(int $paymentId, string $reason): bool
    {
        /** @var Payment|null $payment */
        $payment = Payment::query()->find($paymentId);

        if ($payment === null) {
            throw new RuntimeException("#{$paymentId} to'lovi topilmadi.");
        }

        return $payment->refund($reason);
    }

    public function recordCashOut(int $shiftId, int $amount, string $description): int
    {
        if ($amount <= 0) {
            throw new RuntimeException('Chiqim summasi noldan katta bo\'lishi kerak.');
        }

        return DB::transaction(function () use ($shiftId, $amount, $description): int {
            $shift = $this->shiftOrFail($shiftId);

            if ($shift->status !== 'open') {
                throw new RuntimeException('Yopilgan smenadan pul chiqarib bo\'lmaydi.');
            }

            $expense = Expense::create([
                'cash_shift_id' => $shift->getKey(),
                'category' => 'other',
                'description' => $description,
                'amount' => $amount,
                'paid_in_cash' => true,
                'spent_at' => now(),
            ]);

            return (int) $expense->getKey();
        });
    }

    public function shiftTotals(int $shiftId): ShiftTotals
    {
        return $this->totalsFor($this->shiftOrFail($shiftId));
    }

    /**
     * @return array<int, string>
     */
    public function methods(): array
    {
        return Payment::METHODS;
    }

    // ============ Internals ============

    private function shiftOrFail(int $shiftId): CashShift
    {
        /** @var CashShift|null $shift */
        $shift = CashShift::query()->find($shiftId);

        if ($shift === null) {
            throw new RuntimeException("#{$shiftId} smenasi topilmadi.");
        }

        return $shift;
    }

    private function totalsFor(CashShift $shift): ShiftTotals
    {
        $captured = $shift->payments()->where('status', 'captured');

        $byMethod = (clone $captured)
            ->selectRaw('method, sum(amount) as total')
            ->groupBy('method')
            ->pluck('total', 'method')
            ->map(static fn ($total): int => (int) $total)
            ->all();

        $cashTaken = (int) ($byMethod['cash'] ?? 0);
        $cashPaidOut = (int) $shift->expenses()->where('paid_in_cash', true)->sum('amount');

        return new ShiftTotals(
            shiftId: (int) $shift->getKey(),
            status: (string) $shift->status,
            openingCash: (int) $shift->opening_cash,
            cashTaken: $cashTaken,
            cashPaidOut: $cashPaidOut,
            // For an open shift the model has not written this yet, so it is
            // derived the same way `close()` derives it. One formula, two
            // callers, no chance of an X-report that disagrees with the Z.
            expectedCash: $shift->status === 'closed'
                ? (int) $shift->expected_cash
                : (int) $shift->opening_cash + $cashTaken - $cashPaidOut,
            countedCash: $shift->status === 'closed' ? (int) $shift->counted_cash : null,
            difference: $shift->status === 'closed' ? (int) $shift->difference : null,
            totalTakings: (int) (clone $captured)->sum('amount'),
            refunded: (int) $shift->payments()->where('status', 'refunded')->sum('amount'),
            paymentCount: (int) (clone $captured)->count(),
            byMethod: $byMethod,
        );
    }

    private function nextShiftNumber(): string
    {
        $last = (int) CashShift::withTrashed()->max('id');

        return sprintf('Z-%05d', $last + 1);
    }
}
