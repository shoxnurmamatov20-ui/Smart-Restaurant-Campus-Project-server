<?php

declare(strict_types=1);

namespace Modules\Finance\Services;

use App\Support\Errors\ApiException;
use App\Support\Tenancy\TenantContext;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Finance\Models\CashAccount;
use Modules\Finance\Models\CashMovement;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;

/**
 * Every movement of money in one window, in one list, with a running balance.
 *
 * The ledger screen has drawn this table since it was designed and no endpoint
 * could fill it. The rows live in three tables — `finance.payments` (money in),
 * `finance.expenses` (money out) and `finance.cash_movements` (money moved) —
 * and neither of the two that had routes accepted a date range. A month's ledger
 * could only be assembled by paging the whole history into a browser and
 * bucketing it there, which is exactly the arithmetic that must not happen in a
 * browser.
 *
 * ---------------------------------------------------------------------------
 * `business_date`, and never `whereDate()`
 *
 * The window is a range on the stamped trading day. Every money row on this
 * platform already carries one, written at creation from the venue's own 06:00
 * boundary, so a bill rung up at 01:30 lands on the evening it belongs to — and
 * a report that grouped by `created_at` would move that bill to the next day and
 * disagree with the Z-report that counted it.
 *
 * `whereDate()` is banned by `ModuleBoundaryTest` for the reason it is banned
 * everywhere: it wraps the column in a function, PostgreSQL cannot use the
 * index, and the tables it would scan are the two that grow fastest.
 *
 * ---------------------------------------------------------------------------
 * Card takings are in the book, and they do not touch the drawer
 *
 * Every captured payment appears, cash or not, because the cash book is the
 * business's book and not the till's — an owner asking "what came in on
 * Tuesday" means all of it. `affects_drawer` is the flag that keeps the two
 * questions apart: `FinancePaymentSeeder` learned the same lesson from the other
 * end, where counting card takings into the drawer made the expected cash wrong
 * by exactly the card total.
 *
 * ---------------------------------------------------------------------------
 * The balance is a running one, and it runs forwards
 *
 * Rows come back oldest first with a balance carried down the list, because that
 * is what a ledger is. The opening figure is the accounts' own
 * `opening_balance` plus everything that happened before the window — computed
 * with two aggregates rather than by fetching history, so asking for one week of
 * a five-year-old restaurant reads one week of rows.
 */
final class CashBook
{
    /** How many rows one read may return. A month of a busy venue fits. */
    public const MAX_ROWS = 2000;

    public function __construct(private readonly TenantContext $tenants) {}

    /**
     * The ledger for one window.
     *
     * @param  string  $from  `Y-m-d`, inclusive
     * @param  string  $to  `Y-m-d`, inclusive
     * @param  int|null  $branchId  Null means the whole business — the platform's
     *                              usual reading of an unset branch, and the one an
     *                              owner reads with
     * @return array{
     *     window: array{from: string, to: string, branch_id: int|null},
     *     opening_balance: int,
     *     closing_balance: int,
     *     totals: array{in: int, out: int, net: int},
     *     truncated: bool,
     *     entries: list<array<string, mixed>>
     * }
     */
    public function between(string $from, string $to, ?int $branchId = null): array
    {
        $rows = array_merge(
            $this->takings($from, $to, $branchId),
            $this->outgoings($from, $to, $branchId),
            $this->movements($from, $to, $branchId),
        );

        /*
         * Oldest first, and ties broken by the row's own key.
         *
         * Three tables mean three id sequences, so `occurred_at` alone leaves
         * the order of two things that happened in the same second up to the
         * order the queries returned — and a running balance that reordered
         * itself between two reads of the same week is a ledger nobody trusts.
         * The composite sort is stable because the source name is in it.
         */
        usort($rows, static function (array $a, array $b): int {
            return [$a['occurred_at'], $a['source'], $a['id']] <=> [$b['occurred_at'], $b['source'], $b['id']];
        });

        $truncated = count($rows) > self::MAX_ROWS;
        $rows = array_slice($rows, 0, self::MAX_ROWS);

        $balance = $this->openingBalance($from, $branchId);
        $opening = $balance;
        $in = 0;
        $out = 0;

        foreach ($rows as $index => $row) {
            $balance += $row['amount'];
            $rows[$index]['balance'] = $balance;

            if ($row['amount'] >= 0) {
                $in += $row['amount'];
            } else {
                $out += -$row['amount'];
            }
        }

        return [
            'window' => ['from' => $from, 'to' => $to, 'branch_id' => $branchId],
            'opening_balance' => $opening,
            'closing_balance' => $balance,
            'totals' => ['in' => $in, 'out' => $out, 'net' => $in - $out],
            // Said rather than hidden: a ledger silently cut at two thousand
            // rows is a balance that does not match the bank and no reason why.
            'truncated' => $truncated,
            'entries' => $rows,
        ];
    }

    /**
     * Move money between two places, as two rows that point at each other.
     *
     * Written in one transaction, because half a transfer is worse than none:
     * the leaving leg alone is what made a profitable night read as a loss, and
     * it is the reason this method exists rather than a second call to
     * `recordCashOut()`.
     *
     * One of the two ends may be a drawer (`$fromShiftId` / `$toShiftId`), and
     * the other an account. Both ends being drawers is legal too — a till handing
     * change to another till — and both being accounts is the safe-to-bank run.
     *
     * @param  array{shift?: int|null, account?: int|null}  $source
     * @param  array{shift?: int|null, account?: int|null}  $destination
     * @return array{0: CashMovement, 1: CashMovement} The out leg, then the in leg
     */
    public function transfer(array $source, array $destination, int $amount, string $reason, ?int $userId = null): array
    {
        if ($amount <= 0) {
            throw ApiException::of('finance.transfer_not_positive');
        }

        $sourceShift = $source['shift'] ?? null;
        $sourceAccount = $source['account'] ?? null;
        $targetShift = $destination['shift'] ?? null;
        $targetAccount = $destination['account'] ?? null;

        if (($sourceShift === null && $sourceAccount === null) || ($targetShift === null && $targetAccount === null)) {
            throw ApiException::of('finance.transfer_incomplete');
        }

        // The same drawer or the same safe on both ends is a row that says money
        // moved and a balance that did not change — which reads as a mistake
        // somebody will spend an evening looking for.
        if ($sourceShift !== null && $sourceShift === $targetShift) {
            throw ApiException::of('finance.transfer_same_place');
        }

        if ($sourceAccount !== null && $sourceAccount === $targetAccount) {
            throw ApiException::of('finance.transfer_same_place');
        }

        $now = Carbon::now();

        return DB::transaction(function () use (
            $sourceShift, $sourceAccount, $targetShift, $targetAccount, $amount, $reason, $userId, $now,
        ): array {
            $branchId = $this->branchOf($sourceAccount) ?? $this->branchOf($targetAccount);

            $out = CashMovement::query()->create([
                'branch_id' => $branchId,
                'cash_shift_id' => $sourceShift,
                'cash_account_id' => $sourceAccount,
                'direction' => 'out',
                'amount' => $amount,
                'reason' => $reason,
                'recorded_by_user_id' => $userId,
                'occurred_at' => $now,
            ]);

            $in = CashMovement::query()->create([
                'branch_id' => $branchId,
                'cash_shift_id' => $targetShift,
                'cash_account_id' => $targetAccount,
                'counterpart_id' => $out->id,
                'direction' => 'in',
                'amount' => $amount,
                'reason' => $reason,
                'recorded_by_user_id' => $userId,
                'occurred_at' => $now,
            ]);

            // Both rows carry the pointer, so a ledger read from either side can
            // say where the money went without scanning for a twin.
            $out->forceFill(['counterpart_id' => $in->id])->save();

            return [$out->refresh(), $in];
        });
    }

    // ============ Internals ============

    private function branchOf(?int $accountId): ?int
    {
        if ($accountId === null) {
            return null;
        }

        return CashAccount::query()->whereKey($accountId)->value('branch_id');
    }

    /**
     * Money in: every captured payment in the window.
     *
     * @return list<array<string, mixed>>
     */
    private function takings(string $from, string $to, ?int $branchId): array
    {
        $rows = Payment::query()
            ->where('status', 'captured')
            ->whereBetween('business_date', [$from, $to])
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->orderBy('business_date')
            ->limit(self::MAX_ROWS + 1)
            ->get(['id', 'business_date', 'paid_at', 'created_at', 'method', 'amount', 'order_number', 'cash_shift_id', 'branch_id']);

        return $rows->map(fn (Payment $payment): array => [
            'source' => 'payment',
            'id' => $payment->id,
            'business_date' => $payment->business_date?->toDateString(),
            // `paid_at` is what the till writes; `created_at` is the fallback for
            // a row entered through the console, which leaves it null. An empty
            // string here would sort every such row to the top of the ledger and
            // make the running balance start with money that arrived last.
            'occurred_at' => ($payment->paid_at ?? $payment->created_at)?->toIso8601String() ?? '',
            'kind' => 'takings',
            'label' => $payment->order_number === null ? 'Sotuv' : "Sotuv · {$payment->order_number}",
            'method' => $payment->method,
            // Signed, so the ledger adds up by summation and a running balance
            // cannot disagree with its own rows.
            'amount' => $payment->amount,
            'affects_drawer' => $payment->method === 'cash',
            'cash_shift_id' => $payment->cash_shift_id,
            'cash_account_id' => null,
            'branch_id' => $payment->branch_id,
            'transfer' => false,
        ])->all();
    }

    /**
     * Money out: every expense in the window.
     *
     * @return list<array<string, mixed>>
     */
    private function outgoings(string $from, string $to, ?int $branchId): array
    {
        $rows = Expense::query()
            ->whereBetween('business_date', [$from, $to])
            /*
             * Expenses carry no `branch_id` — money leaving the business belongs
             * to the business, exactly as the platform's tenancy rules say. So a
             * branch filter narrows it through the SHIFT the payout came from,
             * which is the only venue an expense can be attributed to, and an
             * expense entered from the office reaches nobody's branch ledger
             * rather than every one of them.
             */
            ->when($branchId !== null, fn ($query) => $query->whereIn(
                'cash_shift_id',
                DB::table('finance.cash_shifts')->select('id')->where('branch_id', $branchId),
            ))
            ->orderBy('business_date')
            ->limit(self::MAX_ROWS + 1)
            ->get(['id', 'business_date', 'spent_at', 'created_at', 'category', 'description', 'amount', 'paid_in_cash', 'cash_shift_id']);

        return $rows->map(fn (Expense $expense): array => [
            'source' => 'expense',
            'id' => $expense->id,
            'business_date' => $expense->business_date?->toDateString(),
            // Same fallback as a payment's, and the same reason: `spent_at` is
            // nullable and an expense typed into the console does not carry one.
            'occurred_at' => ($expense->spent_at ?? $expense->created_at)?->toIso8601String() ?? '',
            'kind' => 'expense',
            'label' => $expense->description,
            'method' => $expense->category,
            'amount' => -$expense->amount,
            'affects_drawer' => $expense->paid_in_cash,
            'cash_shift_id' => $expense->cash_shift_id,
            'cash_account_id' => null,
            'branch_id' => null,
            'transfer' => false,
        ])->all();
    }

    /**
     * Money moved: drawer top-ups, collections, transfers between accounts.
     *
     * @return list<array<string, mixed>>
     */
    private function movements(string $from, string $to, ?int $branchId): array
    {
        $rows = CashMovement::query()
            ->whereBetween('business_date', [$from, $to])
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->orderBy('business_date')
            ->limit(self::MAX_ROWS + 1)
            ->get();

        return $rows->map(fn (CashMovement $movement): array => [
            'source' => 'movement',
            'id' => $movement->id,
            'business_date' => $movement->business_date?->toDateString(),
            'occurred_at' => $movement->occurred_at->toIso8601String(),
            'kind' => $movement->counterpart_id === null ? 'movement' : 'transfer',
            'label' => $movement->reason,
            'method' => 'cash',
            'amount' => $movement->direction === 'in' ? $movement->amount : -$movement->amount,
            'affects_drawer' => $movement->cash_shift_id !== null,
            'cash_shift_id' => $movement->cash_shift_id,
            'cash_account_id' => $movement->cash_account_id,
            'branch_id' => $movement->branch_id,
            /*
             * A transfer nets to zero across the two legs, and the reader has to
             * be able to see that. Without the flag, a week containing one
             * 5 000 000 move between the till and the safe reads as 5 000 000 in
             * and 5 000 000 out — twice the turnover the restaurant had.
             */
            'transfer' => $movement->counterpart_id !== null,
        ])->all();
    }

    /**
     * What the balance stood at the moment the window opened.
     *
     * Three aggregates and the accounts' declared opening figures, rather than
     * fetching history: a five-year-old restaurant asked for one week must read
     * one week of rows.
     */
    private function openingBalance(string $from, ?int $branchId): int
    {
        $tenantId = $this->tenants->id();

        if ($tenantId === null) {
            return 0;
        }

        $declared = (int) CashAccount::query()
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->sum('opening_balance');

        $takings = (int) Payment::query()
            ->where('status', 'captured')
            ->where('business_date', '<', $from)
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->sum('amount');

        $spent = (int) Expense::query()
            ->where('business_date', '<', $from)
            ->when($branchId !== null, fn ($query) => $query->whereIn(
                'cash_shift_id',
                DB::table('finance.cash_shifts')->select('id')->where('branch_id', $branchId),
            ))
            ->sum('amount');

        /*
         * Movements net to zero across a transfer's two legs and do not net to
         * zero for a one-legged one, which is exactly right: a collection handed
         * to a courier leaves the business, a move to the safe does not. Summing
         * the signed amounts is what expresses that without a special case.
         */
        $moved = (int) CashMovement::query()
            ->where('business_date', '<', $from)
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->selectRaw("coalesce(sum(case when direction = 'in' then amount else -amount end), 0) as net")
            ->value('net');

        return $declared + $takings - $spent + $moved;
    }
}
