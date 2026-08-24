<?php

declare(strict_types=1);

namespace Modules\Finance\Database\Seeders;

use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Payment;

/**
 * The money behind the demo week: one counted till per day, one payment per
 * bill.
 *
 * `DemoTradingSeeder` (Orders) keeps the last seven days stocked with paid
 * bills. A paid bill with no payment is a contradiction the cash book, the
 * Z-report and the P&L all notice in their own way, so this side writes what
 * the till would have: a shift opened at nine and sealed at half past eleven
 * for every business day in the window, and a captured payment for every demo
 * bill, in that day's shift, by a method that cycles the way a real evening
 * does. Cash is counted exactly on most days and a few thousand so'm short on
 * some, because a drawer that never differs is the one figure an accountant
 * does not believe.
 *
 * Reads bills through the query builder, not the Orders models — the same
 * rule and the same reason as `FinancePaymentSeeder`. Keyed on `order_id`
 * for payments and on the shift number for shifts, so a second run changes
 * nothing; the scheduler runs it every morning.
 */
final class DemoTakingsSeeder extends Seeder
{
    private const METHOD_CYCLE = ['cash', 'card', 'cash', 'payme', 'cash', 'card', 'click', 'cash'];

    /** Tiyin the count came to, short of expected, on the days it did. */
    private const SHORTFALLS = [0, 0, 0, 2_000_00, 0, 0, 5_000_00];

    public function run(): void
    {
        $tenantId = app(TenantContext::class)->id();

        if ($tenantId === null) {
            $this->command?->warn('⚠️  Finance: tenant tanlanmagan — demo:seed orqali ishga tushiring.');

            return;
        }

        $cashier = User::query()->where('tenant_id', $tenantId)->role('cashier')->orderBy('id')->first()
            ?? User::query()->where('tenant_id', $tenantId)->orderBy('id')->first();

        if ($cashier === null) {
            $this->command?->warn('⚠️  Finance: kassir yo\'q — avval UserSeeder.');

            return;
        }

        $bills = DB::table('orders.orders')
            ->where('tenant_id', $tenantId)
            ->where('number', 'like', 'D%')
            ->where('status', 'paid')
            ->orderBy('placed_at')
            ->get(['id', 'branch_id', 'number', 'total', 'business_date', 'closed_at', 'placed_at']);

        if ($bills->isEmpty()) {
            $this->command?->line('⏭  Finance: demo cheklar yo\'q — avval DemoTradingSeeder.');

            return;
        }

        $shifts = 0;
        $payments = 0;

        foreach ($bills->groupBy('business_date') as $date => $dayBills) {
            $day = CarbonImmutable::parse((string) $date)->startOfDay();
            $branchId = $dayBills->first()->branch_id;

            $cash = 0;
            $rows = [];

            foreach ($dayBills->values() as $index => $bill) {
                $method = self::METHOD_CYCLE[$index % count(self::METHOD_CYCLE)];
                $rows[] = [$bill, $method, $index];

                if ($method === 'cash') {
                    $cash += (int) $bill->total;
                }
            }

            $opening = 500_000_00;
            $short = self::SHORTFALLS[$day->dayOfWeek];
            $expected = $opening + $cash;

            $number = sprintf('DZ-%s', $day->format('ymd'));
            $shift = CashShift::query()->where('number', $number)->first();

            if ($shift === null) {
                $shift = new CashShift([
                    'tenant_id' => $tenantId,
                    'number' => $number,
                    'opened_by_user_id' => $cashier->id,
                    'closed_by_user_id' => $cashier->id,
                    'opened_at' => $day->addHours(9),
                    'closed_at' => $day->addHours(23)->addMinutes(30),
                    'locked_at' => $day->addHours(23)->addMinutes(30),
                    'opening_cash' => $opening,
                    'expected_cash' => $expected,
                    'counted_cash' => $expected - $short,
                    'difference' => -$short,
                    'difference_reason' => $short > 0 ? 'Qaytim berishda yanglishgan' : null,
                    'status' => 'closed',
                ]);

                // Not fillable on purpose — a till must not pick its branch from
                // a request body. A seeder may.
                $shift->forceFill(['branch_id' => $branchId])->save();
                $shifts++;
            }

            foreach ($rows as [$bill, $method, $index]) {
                $payment = Payment::query()->firstOrCreate(
                    ['order_id' => $bill->id],
                    [
                        'tenant_id' => $tenantId,
                        'branch_id' => $bill->branch_id,
                        'cash_shift_id' => $shift->id,
                        'order_number' => $bill->number,
                        'method' => $method,
                        'amount' => (int) $bill->total,
                        'status' => 'captured',
                        'fiscal_receipt_no' => sprintf('%s-%04d', $shift->number, $index + 1),
                        'paid_at' => $bill->closed_at ?? $bill->placed_at,
                        'business_date' => $day->toDateString(),
                    ],
                );

                if ($payment->wasRecentlyCreated) {
                    $payments++;
                }
            }
        }

        $this->command?->info(sprintf('✅ Finance: demo tushum — %d yangi smena, %d yangi to\'lov.', $shifts, $payments));
    }
}
