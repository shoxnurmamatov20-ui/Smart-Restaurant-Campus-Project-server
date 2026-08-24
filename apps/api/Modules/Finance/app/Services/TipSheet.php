<?php

declare(strict_types=1);

namespace Modules\Finance\Services;

use App\Contracts\Orders\BillRegistry;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Payment;

/**
 * Whose tips these are, and how they arrived.
 *
 * A tip is a column on `finance.payments` and the server who earned it is on
 * the order — which lives in Orders, and Finance may not read it
 * (`ModuleBoundaryTest`). So the payments are grouped here and the names come
 * back through `BillRegistry::servedBy()`, one call for the whole shift.
 *
 * The split by rail is the point of the sheet rather than decoration: cash
 * tips are already in the waiter's apron and only need recording, while card
 * tips passed through the till and the restaurant owes them out at the end of
 * the night. A single total would tell a cashier nothing about what to hand
 * over.
 *
 * Covers ride along because a tip per cover is how a floor manager reads a
 * section — twelve thousand on four covers is a different evening from
 * twelve thousand on forty.
 */
final class TipSheet
{
    /** Rails whose money never entered the drawer; the rest is cash in hand. */
    private const CARD_RAILS = ['card', 'payme', 'click', 'uzum', 'transfer'];

    public function __construct(private readonly BillRegistry $bills) {}

    /**
     * @return array{
     *     rows: list<array{waiter_user_id: int|null, waiter: string|null, cash: int, card: int, covers: int, total: int}>,
     *     totals: array{cash: int, card: int, covers: int, total: int}
     * }
     */
    public function forShift(CashShift $shift): array
    {
        $payments = Payment::query()
            ->where('cash_shift_id', $shift->getKey())
            ->where('status', 'captured')
            ->where('tip', '>', 0)
            ->get(['order_id', 'method', 'tip']);

        if ($payments->isEmpty()) {
            return ['rows' => [], 'totals' => ['cash' => 0, 'card' => 0, 'covers' => 0, 'total' => 0]];
        }

        $served = $this->bills->servedBy(
            $payments->pluck('order_id')->filter()->map(static fn ($id): int => (int) $id)->unique()->values()->all(),
        );

        /** @var array<string, array{waiter_user_id: int|null, waiter: string|null, cash: int, card: int, bills: list<int>}> $byWaiter */
        $byWaiter = [];

        foreach ($payments as $payment) {
            $orderId = (int) $payment->order_id;
            $bill = $served[$orderId] ?? ['waiter_user_id' => null, 'waiter_name' => null, 'guests' => 0];
            $key = $bill['waiter_user_id'] === null ? 'unassigned' : (string) $bill['waiter_user_id'];

            $byWaiter[$key] ??= [
                'waiter_user_id' => $bill['waiter_user_id'],
                'waiter' => $bill['waiter_name'],
                'cash' => 0,
                'card' => 0,
                'bills' => [],
            ];

            $rail = in_array((string) $payment->method, self::CARD_RAILS, true) ? 'card' : 'cash';
            $byWaiter[$key][$rail] += (int) $payment->tip;

            // A bill counted once, however many tenders split it: two people
            // paying one table are one table's covers, not two.
            if (! in_array($orderId, $byWaiter[$key]['bills'], true)) {
                $byWaiter[$key]['bills'][] = $orderId;
            }
        }

        $rows = [];
        $totals = ['cash' => 0, 'card' => 0, 'covers' => 0, 'total' => 0];

        foreach ($byWaiter as $row) {
            $covers = array_sum(array_map(
                static fn (int $billId): int => $served[$billId]['guests'] ?? 0,
                $row['bills'],
            ));

            $rows[] = [
                'waiter_user_id' => $row['waiter_user_id'],
                'waiter' => $row['waiter'],
                'cash' => $row['cash'],
                'card' => $row['card'],
                'covers' => $covers,
                'total' => $row['cash'] + $row['card'],
            ];

            $totals['cash'] += $row['cash'];
            $totals['card'] += $row['card'];
            $totals['covers'] += $covers;
            $totals['total'] += $row['cash'] + $row['card'];
        }

        // Biggest earner first: the sheet is read to hand money over, and the
        // largest handover is the one worth checking twice.
        usort($rows, static fn (array $a, array $b): int => $b['total'] <=> $a['total']);

        return ['rows' => $rows, 'totals' => $totals];
    }
}
