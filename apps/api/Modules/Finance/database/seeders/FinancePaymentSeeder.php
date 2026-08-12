<?php

declare(strict_types=1);

namespace Modules\Finance\Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;

/**
 * A till with a day in it.
 *
 * FinanceDatabaseSeeder opens a shift and stops there, which leaves the
 * cashier's screen — their main one — showing an open drawer that has never
 * taken any money. The X-report reads zero, the payment mix has no slices, and
 * the variance the whole screen exists to surface cannot be demonstrated.
 *
 * Payments are derived from the orders that were actually closed, so the two
 * agree: the money in the drawer is the money on the bills. Inventing a
 * separate set of takings would produce a demo where the till and the order
 * list disagree, which is precisely the situation the till screen is built to
 * catch — a bad thing to teach by accident.
 *
 * The method split follows how a restaurant in Tashkent is actually paid:
 * roughly half cash, a third by card, the rest through Payme and Click. Held as
 * a fixed cycle rather than a random draw so a seeded database is the same
 * database twice, and a screenshot in a review means something.
 */
final class FinancePaymentSeeder extends Seeder
{
    /** @var array<int, string> */
    private const METHOD_CYCLE = ['cash', 'card', 'cash', 'payme', 'cash', 'card', 'click'];

    /**
     * A day's outgoings, in tiyin.
     *
     * Small and few on purpose: these are the cash expenses a shift actually
     * pays out of the drawer — a delivery paid on arrival, a repair — not the
     * rent, which leaves the bank and never touches a till.
     *
     * @var array<int, array{category: string, description: string, amount: int, cash: bool}>
     */
    private const EXPENSES = [
        ['category' => 'purchase', 'description' => "Ko'kat va limon — bozordan", 'amount' => 8_500_00, 'cash' => true],
        ['category' => 'repair', 'description' => 'Muzlatgich termostati', 'amount' => 320_000_00, 'cash' => true],
        ['category' => 'utilities', 'description' => 'Suv yetkazib berish, 20 ballon', 'amount' => 90_000_00, 'cash' => true],
        ['category' => 'marketing', 'description' => 'Instagram reklama, 3 kun', 'amount' => 450_000_00, 'cash' => false],
    ];

    public function run(): void
    {
        $shift = CashShift::query()->orderByDesc('id')->first();

        if ($shift === null) {
            $this->command?->warn('⏭  Finance: kassa smenasi yo\'q — avval FinanceDatabaseSeeder.');

            return;
        }

        // Query builder, not the Orders models: a module never imports another
        // module's classes — see tests/Architecture/ModuleBoundaryTest.
        $orders = DB::table('orders.orders')
            ->whereIn('status', ['paid', 'closed'])
            ->orderBy('id')
            ->get(['id', 'tenant_id', 'number', 'total', 'closed_at', 'placed_at']);

        if ($orders->isEmpty()) {
            $this->command?->warn('⏭  Finance: yopilgan buyurtma yo\'q — avval OrdersDatabaseSeeder.');

            return;
        }

        $cash = 0;

        foreach ($orders as $index => $order) {
            $method = self::METHOD_CYCLE[$index % count(self::METHOD_CYCLE)];
            $paidAt = $order->closed_at ?? $order->placed_at ?? now();

            Payment::query()->updateOrCreate(
                ['order_id' => $order->id],
                [
                    'tenant_id' => $order->tenant_id,
                    'cash_shift_id' => $shift->id,
                    'order_number' => $order->number,
                    'method' => $method,
                    'amount' => (int) $order->total,
                    'status' => 'captured',
                    // The fiscal module's number. Sequential per shift, which is
                    // what the tax office expects and what the Z-report totals.
                    'fiscal_receipt_no' => sprintf('%s-%04d', $shift->number, $index + 1),
                    'paid_at' => $paidAt,
                ],
            );

            if ($method === 'cash') {
                $cash += (int) $order->total;
            }
        }

        foreach (self::EXPENSES as $index => $expense) {
            Expense::query()->updateOrCreate(
                ['cash_shift_id' => $shift->id, 'description' => $expense['description']],
                [
                    'tenant_id' => $shift->tenant_id,
                    'category' => $expense['category'],
                    'amount' => $expense['amount'],
                    'paid_in_cash' => $expense['cash'],
                    'spent_at' => now()->startOfDay()->addHours(11 + $index),
                ],
            );

            if ($expense['cash']) {
                $cash -= $expense['amount'];
            }
        }

        /*
         * What the drawer should hold.
         *
         * Opening float, plus every cash payment, minus every cash expense. The
         * counted figure is left null because the shift is still open — a
         * variance only exists once someone has counted, and pre-filling one
         * would put a number on the screen that nobody arrived at.
         */
        $shift->forceFill([
            'expected_cash' => (int) $shift->opening_cash + $cash,
        ])->save();

        $this->command?->info(sprintf(
            '✅ Finance: %d ta to\'lov, %d ta xarajat, kutilgan naqd %s so\'m.',
            $orders->count(),
            count(self::EXPENSES),
            number_format(((int) $shift->opening_cash + $cash) / 100, 0, '.', ' '),
        ));
    }
}
