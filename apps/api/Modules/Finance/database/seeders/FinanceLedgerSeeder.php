<?php

declare(strict_types=1);

namespace Modules\Finance\Database\Seeders;

use App\Support\Tenancy\BusinessDay;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Modules\Finance\Models\AccountingPeriod;
use Modules\Finance\Models\CashAccount;
use Modules\Finance\Models\ExpenseCategory;
use Modules\Finance\Models\FixedAsset;
use Modules\Finance\Models\Payment;
use Modules\Finance\Models\PaymentMethod;

/**
 * The ledger's own furniture: tenders, headings, accounts, assets and months.
 *
 * Everything here is CONFIGURATION rather than transactions, which is why it can
 * be `updateOrCreate`d and why it is deterministic to the tiyin. Two runs of
 * `db:seed` produce the same restaurant — the rule the whole seeding layer
 * follows, and the reason `FinancePaymentSeeder` cycles payment methods instead
 * of picking randomly.
 *
 * ---------------------------------------------------------------------------
 * Where this sits, and why it is last among the Finance seeders
 *
 * After `FinancePaymentSeeder`, deliberately. It closes a month, and a closed
 * month refuses new money — see `PeriodLock`. Seeded far enough back that no
 * seeded payment falls inside it, but a console with no closed period at all
 * would draw a ledger screen where the close button had never been used and
 * nobody could tell what a closed row looks like.
 */
final class FinanceLedgerSeeder extends Seeder
{
    public function run(): void
    {
        $today = Carbon::parse(app(BusinessDay::class)->dateFor());

        $this->tenders();
        $this->headings();
        $this->accounts();
        $this->assets($today);
        $this->months($today);

        $this->command?->info('✅ Finance: to\'lov turlari, toifalar, hisoblar, aktivlar va davrlar.');
    }

    /**
     * The tenders this demo restaurant offers.
     *
     * Not all eleven: `card` is the pre-P7 generic and a restaurant configuring
     * its till today would not choose it, and `corporate` needs a contract with
     * a company. Both stay available — an unconfigured tender still appears in
     * `GET /finance/payment-methods` as a platform default — they are simply not
     * something this restaurant has set up.
     */
    private function tenders(): void
    {
        $rows = [
            ['cash', 'cash', 'Naqd', 'Наличные', 'Cash', true, null, null],
            ['uzcard', 'card', 'Uzcard', 'Uzcard', 'Uzcard', true, 120, null],
            ['humo', 'card', 'Humo', 'Humo', 'Humo', true, 120, null],
            ['visa', 'card', 'Visa', 'Visa', 'Visa', true, 240, null],
            ['mastercard', 'card', 'Mastercard', 'Mastercard', 'Mastercard', true, 240, null],
            ['click', 'online', 'Click', 'Click', 'Click', true, 150, 'click'],
            ['payme', 'online', 'Payme', 'Payme', 'Payme', true, 150, 'payme'],
            ['uzum', 'online', 'Uzum Nasiya', 'Uzum Nasiya', 'Uzum Nasiya', true, 150, 'uzum'],
            /*
             * A tab is not fiscal, and that is the one flag on this table worth
             * a sentence. No money arrives at the moment of sale, so a fiscal
             * receipt declaring cash that has not been taken would declare the
             * wrong evening — the same argument `Payment::METHODS` makes for
             * keeping `credit` and `corporate` apart.
             */
            ['credit', 'credit', 'Qarzga', 'В долг', 'On account', false, 0, null],
        ];

        foreach ($rows as $position => [$method, $kind, $uz, $ru, $en, $fiscal, $bps, $gateway]) {
            PaymentMethod::query()->updateOrCreate(
                ['method' => $method],
                [
                    'name' => ['uz' => $uz, 'ru' => $ru, 'en' => $en],
                    'kind' => $kind,
                    'is_fiscal' => $fiscal,
                    'fee_bps' => $bps,
                    'gateway' => $gateway,
                    'is_enabled' => true,
                    'position' => $position,
                ],
            );
        }
    }

    /**
     * The eight built-in headings as rows, plus the two this restaurant added.
     *
     * The built-ins get rows so the settings screen has something to rename;
     * they are marked `is_system` so neither this seeder's work nor the till's
     * can be archived away. See `ExpenseCategory::SYSTEM_NAMES`.
     */
    private function headings(): void
    {
        $position = 0;

        foreach (ExpenseCategory::SYSTEM_NAMES as $code => $name) {
            ExpenseCategory::query()->updateOrCreate(
                ['code' => $code, 'direction' => 'out'],
                ['name' => $name, 'is_system' => true, 'position' => $position++],
            );
        }

        // The ninth and tenth — the whole reason the table exists. A restaurant
        // that licences music and rents a second van filed both under `other`.
        $added = [
            ['licence', ['uz' => 'Litsenziya va musiqa', 'ru' => 'Лицензии и музыка', 'en' => 'Licences & music']],
            ['transport', ['uz' => 'Transport', 'ru' => 'Транспорт', 'en' => 'Transport']],
        ];

        foreach ($added as [$code, $name]) {
            ExpenseCategory::query()->updateOrCreate(
                ['code' => $code, 'direction' => 'out'],
                ['name' => $name, 'is_system' => false, 'position' => $position++],
            );
        }

        // Money in that is not a sale. There is no built-in list for these —
        // takings are classified by payment method — so every row is the
        // restaurant's own.
        $income = [
            ['hall_hire', ['uz' => 'Zal ijarasi', 'ru' => 'Аренда зала', 'en' => 'Hall hire']],
            ['supplier_rebate', ['uz' => 'Yetkazuvchi bonusi', 'ru' => 'Бонус поставщика', 'en' => 'Supplier rebate']],
        ];

        foreach ($income as $index => [$code, $name]) {
            ExpenseCategory::query()->updateOrCreate(
                ['code' => $code, 'direction' => 'in'],
                ['name' => $name, 'is_system' => false, 'position' => $index],
            );
        }
    }

    /** The safe in the office and the settlement account at the bank. */
    private function accounts(): void
    {
        CashAccount::query()->updateOrCreate(
            ['code' => 'safe'],
            [
                'name' => ['uz' => 'Seyf', 'ru' => 'Сейф', 'en' => 'Safe'],
                'kind' => 'safe',
                // 3 000 000 so'm of change, which is what a venue this size
                // keeps so a Friday evening never runs out of small notes.
                'opening_balance' => 300_000_000,
                'is_active' => true,
            ],
        );

        CashAccount::query()->updateOrCreate(
            ['code' => 'bank'],
            [
                'name' => ['uz' => 'Bank hisobi', 'ru' => 'Банковский счёт', 'en' => 'Bank account'],
                'kind' => 'bank',
                'opening_balance' => 0,
                'is_active' => true,
            ],
        );
    }

    /**
     * Four things bought once, with lives an accountant would recognise.
     *
     * Dated backwards from today so the register always has one asset that is
     * nearly written off, one halfway, and one bought last quarter — which is
     * what makes the "accumulated" column on the screen worth looking at.
     */
    private function assets(Carbon $today): void
    {
        $rows = [
            ['Rational kombi pech', 'equipment', 84, 84, 720_000_000, 60_000_000],
            ['Zal mebeli · 24 stol', 'furniture', 40, 60, 430_000_000, 0],
            ['Ventilyatsiya va zonalar', 'fit_out', 26, 120, 980_000_000, 0],
            ['Yetkazish avtomobili', 'vehicle', 5, 84, 1_450_000_000, 400_000_000],
        ];

        foreach ($rows as [$name, $category, $monthsAgo, $life, $cost, $residual]) {
            FixedAsset::query()->updateOrCreate(
                ['name' => $name],
                [
                    'category' => $category,
                    'acquired_on' => $today->copy()->subMonthsNoOverflow($monthsAgo)->startOfMonth()->addDays(9),
                    'cost' => $cost,
                    'residual' => $residual,
                    'useful_life_months' => $life,
                ],
            );
        }
    }

    /**
     * The last twelve months, with the oldest three closed.
     *
     * Three, and they are the three furthest from today, because seeded
     * payments and expenses land in the recent weeks — a closed month with
     * seeded money in it would refuse the next `db:seed` run rather than
     * repeating it, and a seeder that only works once is worse than no seeder.
     */
    private function months(Carbon $today): void
    {
        $cursor = $today->copy()->startOfMonth();

        for ($step = 0; $step < 12; $step++) {
            $period = $cursor->format('Y-m');
            [$from, $to] = AccountingPeriod::bounds($period);

            // The oldest three of the twelve. `$step` counts backwards from the
            // current month, so 9, 10 and 11 are the far end.
            $closed = $step >= 9;

            AccountingPeriod::query()->updateOrCreate(
                ['period' => $period],
                [
                    'starts_on' => $from,
                    'ends_on' => $to,
                    'status' => $closed ? 'closed' : 'open',
                    'revenue_tiyin' => $closed ? $this->takings($from, $to) : 0,
                    'expenses_tiyin' => 0,
                    'closed_at' => $closed ? $cursor->copy()->endOfMonth()->addDays(5) : null,
                    'note' => $closed ? 'Seeder: davr yopildi' : null,
                ],
            );

            $cursor->subMonthNoOverflow();
        }
    }

    private function takings(string $from, string $to): int
    {
        return (int) Payment::query()
            ->where('status', 'captured')
            ->whereBetween('business_date', [$from, $to])
            ->sum('amount');
    }
}
