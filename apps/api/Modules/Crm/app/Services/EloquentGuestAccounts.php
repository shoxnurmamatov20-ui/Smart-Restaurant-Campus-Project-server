<?php

declare(strict_types=1);

namespace Modules\Crm\Services;

use App\Contracts\Crm\GuestAccount;
use App\Contracts\Crm\GuestAccounts;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\BranchContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Modules\Crm\Models\AccountEntry;
use Modules\Crm\Models\Customer;
use RuntimeException;

/**
 * The tab, and the only thing allowed to move it.
 *
 * P13. A regular signs for lunch: the meal was sold, the drawer stayed shut, and
 * somebody has to remember. Everything a tab can do — charge it, take money
 * against it, undo a charge, correct it, give up on it — happens here, because
 * `customers.account_balance` and `crm.account_entries` are two halves of one
 * fact and there is exactly one way to keep them from drifting: never write one
 * without the other, in one transaction, behind one lock.
 *
 * ---------------------------------------------------------------------------
 * The lock is not decoration
 *
 * A balance is read, added to, and written back. Two tills settling two bills
 * for the same company guest at the same second both read 200 000, both write
 * 340 000, and the restaurant has quietly forgiven a lunch. `lockForUpdate()` on
 * the customer row makes the second one wait, and the ledger line it then writes
 * carries a `balance_after` that actually follows from the one before it.
 *
 * ---------------------------------------------------------------------------
 * What this class does NOT check, stated plainly
 *
 * Going over the limit needs a manager, and the manager is not verified here.
 * CRM cannot see `pos.approvals` — modules do not import each other — so
 * `$approvalId` arrives as a number this class writes down and cannot confirm.
 * The check that matters happens in the POS, where `ApprovalGate::consume()`
 * binds the signature to its action, its bill AND its amount, and spends it
 * once. What this class guarantees is narrower and still worth having: an
 * over-limit charge NEVER happens silently. Either it fits, or a signature is
 * named in the ledger line and an auditor can go and see whether that approval
 * exists, who gave it, and for how much.
 */
final class EloquentGuestAccounts implements GuestAccounts
{
    public function __construct(private readonly BranchContext $branches) {}

    /**
     * Put a bill on a guest's tab.
     *
     * Idempotent per bill, and it has to be: the till settles inside a
     * transaction the tablet may retry, and the offline queue replays batches by
     * design. Charging the same bill twice would be invisible — both lines look
     * correct — so a repeat of the same charge returns the line already there,
     * and a repeat with a DIFFERENT amount is refused rather than reconciled,
     * because nothing here can know which of the two figures is the sale.
     *
     * @param int $amount Tiyin, positive — what the guest is signing for.
     * @param int|null $approvalId The `pos.approvals` row that authorised going
     *                             over the limit. Recorded, not verified — see the class docblock.
     *
     * @return int The account entry id.
     *
     * @throws RuntimeException when the guest has no tab, is inactive, the amount
     *                          does not fit and nobody signed for it, or the same bill was already
     *                          charged for a different figure
     */
    /**
     * This guest's tab, as a value the POS can hold.
     *
     * A DTO rather than the `Customer` model, and that is the point of the whole
     * contract: a till holding an Eloquent row could save it, could lazily load a
     * relation, and would break the day CRM renames a column.
     *
     * `available` is computed here and floored at zero rather than left to the
     * caller. A guest already past their ceiling has a negative headroom, and a
     * screen handed that number renders it as credit — offering more rope to
     * exactly the person who should be offered none.
     */
    public function find(int $customerId): ?GuestAccount
    {
        /** @var Customer|null $customer */
        $customer = Customer::query()->find($customerId);

        if ($customer === null) {
            return null;
        }

        return new GuestAccount(
            customerId: (int) $customer->getKey(),
            name: $customer->name,
            phone: (string) $customer->phone,
            isActive: (bool) $customer->is_active,
            creditLimit: (int) $customer->credit_limit,
            balance: (int) $customer->account_balance,
            available: max(0, (int) $customer->credit_limit - (int) $customer->account_balance),
        );
    }

    public function charge(
        int $customerId,
        int $amount,
        ?int $orderId = null,
        ?string $orderNumber = null,
        ?int $paymentId = null,
        ?int $userId = null,
        ?int $approvalId = null,
        ?string $note = null,
    ): int {
        if ($amount <= 0) {
            throw ApiException::of('crm.amount_invalid', field: 'amount');
        }

        return DB::transaction(function () use (
            $customerId, $amount, $orderId, $orderNumber, $paymentId, $userId, $approvalId, $note
        ): int {
            $customer = $this->lock($customerId);

            if ($orderId !== null) {
                $existing = AccountEntry::query()
                    ->ofKind('charge')
                    ->where('order_id', $orderId)
                    ->first();

                if ($existing !== null) {
                    if ($existing->amount !== $amount) {
                        throw ApiException::detailed(
                            'crm.charge_conflict',
                            uz: sprintf(
                                'Bu hisob allaqachon %s so\'mga qarzga yozilgan, %s so\'mga emas.',
                                self::soum($existing->amount),
                                self::soum($amount),
                            ),
                            ru: sprintf(
                                'Этот счёт уже записан в долг на %s сум, а не на %s сум.',
                                self::soum($existing->amount),
                                self::soum($amount),
                            ),
                            en: sprintf(
                                'This bill is already on the tab for %s UZS, not %s UZS.',
                                self::soum($existing->amount),
                                self::soum($amount),
                            ),
                            meta: ['charged' => $existing->amount, 'requested' => $amount],
                        );
                    }

                    return (int) $existing->getKey();
                }
            }

            if (! $customer->is_active) {
                throw ApiException::of('crm.customer_inactive', meta: ['customer_id' => $customerId]);
            }

            if ($customer->credit_limit <= 0) {
                throw ApiException::of('crm.no_credit_account', meta: ['customer_id' => $customerId]);
            }

            if ($amount > $customer->credit_available && $approvalId === null) {
                /*
                 * The refusal the till is expected to answer, not merely display.
                 *
                 * `available` and `shortfall` ride in the meta so the POS can raise
                 * a `credit_sale` approval for the right figure without asking a
                 * second question — and so the sentence a guest is read out loud
                 * ("you have 40 000 left") comes from the same place the check did.
                 */
                throw ApiException::detailed(
                    'crm.credit_limit_exceeded',
                    uz: sprintf(
                        'Limitdan oshadi: qoldiq %s so\'m, so\'ralgan %s so\'m. Menejer tasdig\'i kerak.',
                        self::soum($customer->credit_available),
                        self::soum($amount),
                    ),
                    ru: sprintf(
                        'Превышает лимит: остаток %s сум, запрошено %s сум. Нужно подтверждение менеджера.',
                        self::soum($customer->credit_available),
                        self::soum($amount),
                    ),
                    en: sprintf(
                        'Over the limit: %s UZS left, %s UZS asked for. A manager has to approve it.',
                        self::soum($customer->credit_available),
                        self::soum($amount),
                    ),
                    meta: [
                        'customer_id' => $customerId,
                        'credit_limit' => $customer->credit_limit,
                        'balance' => $customer->account_balance,
                        'available' => $customer->credit_available,
                        'requested' => $amount,
                        'shortfall' => $amount - $customer->credit_available,
                    ],
                );
            }

            $entry = $this->post($customer, 'charge', $amount, [
                'order_id' => $orderId,
                'order_number' => $orderNumber,
                'payment_id' => $paymentId,
                'approval_id' => $approvalId,
                'recorded_by_user_id' => $userId,
                'note' => $note,
            ]);

            return (int) $entry->getKey();
        });
    }

    /**
     * Money arriving against the tab.
     *
     * A negative balance is a real state and is never clamped: a guest who hands
     * over 500 000 against a 340 000 tab has left the restaurant holding 160 000
     * of theirs, and money the business is holding for somebody is a liability
     * that has to be on the page that records it. Rounding it away is how it
     * disappears.
     *
     * But it does not happen by accident. A cashier taking a settlement is
     * reading a figure off a piece of paper and typing it, and the typo that
     * turns 500 000 into 5 000 000 does not look like anything: the tab goes to
     * zero, the guest walks out, and the restaurant now owes them four and a half
     * million with no line saying it meant to. So the default refuses to overshoot
     * and names what is actually owed, and a genuine deposit is the caller
     * SAYING it is one.
     *
     * @param int $amount Tiyin, positive.
     * @param int|null $paymentId The `finance.payments` row the money arrived on,
     *                            when it came through a till rather than a bank.
     * @param bool $acceptDeposit Let the balance go below zero, because the excess
     *                            is money the restaurant is knowingly holding.
     *
     * @return int The account entry id.
     *
     * @throws RuntimeException when the money is more than the guest owes and
     *                          nobody said it was a deposit
     */
    public function settle(
        int $customerId,
        int $amount,
        ?int $paymentId = null,
        ?int $userId = null,
        ?string $note = null,
        bool $acceptDeposit = false,
    ): int {
        if ($amount <= 0) {
            throw ApiException::of('crm.amount_invalid', field: 'amount');
        }

        return DB::transaction(function () use ($customerId, $amount, $paymentId, $userId, $note, $acceptDeposit): int {
            $customer = $this->lock($customerId);

            if (! $acceptDeposit && $amount > $customer->account_balance) {
                /*
                 * Checked inside the lock, not before it, and that is the whole
                 * reason it lives here rather than in the controller. Two tills
                 * taking money for the same company guest at the same second would
                 * both read the old balance, both decide the figure fits, and
                 * together push the tab past zero — which is the exact overshoot
                 * this refusal exists to prevent.
                 */
                throw ApiException::detailed(
                    'crm.settlement_exceeds_balance',
                    uz: sprintf(
                        'Mijozning qarzi %s so\'m — %s so\'m qabul qilib bo\'lmaydi.',
                        self::soum(max(0, $customer->account_balance)),
                        self::soum($amount),
                    ),
                    ru: sprintf(
                        'Долг клиента — %s сум, принять %s сум нельзя.',
                        self::soum(max(0, $customer->account_balance)),
                        self::soum($amount),
                    ),
                    en: sprintf(
                        'The guest owes %s UZS — %s UZS cannot be taken against it.',
                        self::soum(max(0, $customer->account_balance)),
                        self::soum($amount),
                    ),
                    field: 'amount',
                    meta: [
                        'customer_id' => $customerId,
                        'balance' => $customer->account_balance,
                        'requested' => $amount,
                        'overpayment' => $amount - $customer->account_balance,
                    ],
                );
            }

            $entry = $this->post($customer, 'settlement', -$amount, [
                'payment_id' => $paymentId,
                'recorded_by_user_id' => $userId,
                'note' => $note,
            ]);

            return (int) $entry->getKey();
        });
    }

    /**
     * Take a bill back off the tab, because the sale stopped being a sale.
     *
     * The amount is read from the original charge rather than accepted from the
     * caller — a refund that reversed more than was charged would pay a guest out
     * of a balance they never ran up. A partial figure is allowed for the table
     * that sent one dish back, and it is checked against what is left unreversed,
     * so two partials cannot add up to more than the whole.
     *
     * Returns null when there was nothing on the tab for this bill, or nothing
     * left of it — the caller refunding a cash sale should not have to know
     * whether it was ever a credit one.
     *
     * @param int|null $amount Tiyin. Null means all of what is left.
     */
    public function reverseCharge(
        int $orderId,
        string $reason,
        ?int $amount = null,
        ?int $userId = null,
    ): ?int {
        return DB::transaction(function () use ($orderId, $reason, $amount, $userId): ?int {
            /** @var AccountEntry|null $charge */
            $charge = AccountEntry::query()->ofKind('charge')->where('order_id', $orderId)->first();

            if ($charge === null) {
                return null;
            }

            $alreadyReversed = (int) AccountEntry::query()
                ->ofKind('reversal')
                ->where('order_id', $orderId)
                ->sum('amount');

            // Reversals are stored negative; what is left is the charge plus them.
            $remaining = $charge->amount + $alreadyReversed;

            if ($remaining <= 0) {
                return null;
            }

            $amount ??= $remaining;

            if ($amount <= 0) {
                throw ApiException::of('crm.amount_invalid', field: 'amount');
            }

            if ($amount > $remaining) {
                throw ApiException::detailed(
                    'crm.reversal_exceeds_charge',
                    uz: sprintf(
                        'Bu hisobda qarzdan qaytariladigan %s so\'m qoldi, %s so\'m emas.',
                        self::soum($remaining),
                        self::soum($amount),
                    ),
                    ru: sprintf(
                        'По этому счёту к возврату осталось %s сум, а не %s сум.',
                        self::soum($remaining),
                        self::soum($amount),
                    ),
                    en: sprintf(
                        'Only %s UZS of this bill is still on the tab, not %s UZS.',
                        self::soum($remaining),
                        self::soum($amount),
                    ),
                    meta: ['remaining' => $remaining, 'requested' => $amount],
                );
            }

            $customer = $this->lock((int) $charge->customer_id);

            $entry = $this->post($customer, 'reversal', -$amount, [
                'order_id' => $charge->order_id,
                'order_number' => $charge->order_number,
                'recorded_by_user_id' => $userId,
                'note' => $reason,
            ]);

            return (int) $entry->getKey();
        });
    }

    /**
     * A correction somebody signs their name to.
     *
     * Signed both ways, because both directions happen: a balance carried over
     * from the notebook this module replaces, or a charge that was typed twice
     * before there was an index to stop it. It is never how a debt is forgiven —
     * that is {@see writeOff()}, and the two are different words in a year-end
     * report for a reason.
     *
     * @param int $amount Tiyin, signed. Positive means the guest owes more.
     */
    public function adjust(int $customerId, int $amount, string $reason, ?int $userId = null): int
    {
        if ($amount === 0) {
            throw ApiException::of('crm.amount_invalid', field: 'amount');
        }

        return DB::transaction(function () use ($customerId, $amount, $reason, $userId): int {
            $customer = $this->lock($customerId);

            $entry = $this->post($customer, 'adjustment', $amount, [
                'recorded_by_user_id' => $userId,
                'note' => $reason,
            ]);

            return (int) $entry->getKey();
        });
    }

    /**
     * The restaurant gives up on a debt.
     *
     * Its own kind rather than an adjustment, because this is the only line in
     * the ledger that is a loss. An accountant totalling a year of tabs needs to
     * separate "the sale did not happen" from "the sale happened and we were
     * never paid" — the first is a correction, the second is money the business
     * actually lost, and only one of them belongs in that figure.
     *
     * @param int $amount Tiyin, positive — how much is being forgiven.
     */
    public function writeOff(int $customerId, int $amount, string $reason, ?int $userId = null): int
    {
        if ($amount <= 0) {
            throw ApiException::of('crm.amount_invalid', field: 'amount');
        }

        return DB::transaction(function () use ($customerId, $amount, $reason, $userId): int {
            $customer = $this->lock($customerId);

            if ($customer->account_balance <= 0) {
                throw ApiException::of('crm.nothing_owed', meta: ['customer_id' => $customerId]);
            }

            if ($amount > $customer->account_balance) {
                throw ApiException::detailed(
                    'crm.writeoff_exceeds_debt',
                    uz: sprintf(
                        'Mijoz %s so\'m qarzdor, %s so\'mni hisobdan chiqarib bo\'lmaydi.',
                        self::soum($customer->account_balance),
                        self::soum($amount),
                    ),
                    ru: sprintf(
                        'Клиент должен %s сум — списать %s сум нельзя.',
                        self::soum($customer->account_balance),
                        self::soum($amount),
                    ),
                    en: sprintf(
                        'The guest owes %s UZS — %s UZS cannot be written off.',
                        self::soum($customer->account_balance),
                        self::soum($amount),
                    ),
                    meta: ['balance' => $customer->account_balance, 'requested' => $amount],
                );
            }

            $entry = $this->post($customer, 'writeoff', -$amount, [
                'recorded_by_user_id' => $userId,
                'note' => $reason,
            ]);

            return (int) $entry->getKey();
        });
    }

    /**
     * What every guest on file owes, added up.
     *
     * From the customer rows rather than by summing the ledger: the balance is
     * maintained line by line under a lock, so the two agree by construction, and
     * a debtors' report that re-sums a year of entries every time it is opened
     * gets slower every month it is useful.
     */
    public function outstandingTotal(): int
    {
        return (int) Customer::query()->inDebt()->sum('account_balance');
    }

    /**
     * How long each guest's money has been outstanding — the ageing column.
     *
     * The books screen draws four buckets (0–30, 31–60, 61–90, over 90) and an
     * age in days beside every debtor, and neither can be drawn from a balance:
     * a balance is one number with no date on it. What has a date is the ledger,
     * so this answers, per guest, WHEN the debt they are still carrying began.
     *
     * ---------------------------------------------------------------------
     * The oldest charge since the tab was last clear, not the oldest charge
     *
     * A regular who has signed for lunch every week for two years and pays every
     * month is not ninety days overdue; their oldest CHARGE is, and reporting
     * that would put a good customer in the red bucket for ever. `balance_after`
     * is what makes the correct answer cheap: the last line where it fell to
     * zero or below is the moment the guest was square, and the first charge
     * after that is the money that is actually still owed.
     *
     * Settlements are applied oldest-debt-first by that same reading, which is
     * the FIFO convention every ageing report in accounting uses — the alternative
     * (letting a payment sit against whichever charge somebody names) needs an
     * allocation table this platform does not have and no restaurant would keep.
     *
     * One query for the whole page. A correlated subquery per guest looks worse
     * than it is: both halves ride the `(customer_id, occurred_at)` index, and
     * the alternative — reading every entry of every debtor into PHP — is the
     * shape that stops working in the second year of trading.
     *
     * @param list<int> $customerIds
     *
     * @return array<int, string> Customer id => ISO 8601 timestamp
     */
    public function oldestUnsettled(array $customerIds): array
    {
        if ($customerIds === []) {
            return [];
        }

        /*
         * The last line where the tab reached zero, per guest.
         *
         * Raw and correlated rather than a join, because the comparison is
         * "later than that guest's own reset" and a join would need one derived
         * table per customer on the page. The schema is named in full, so the
         * statement does not depend on the reader's `search_path`.
         *
         * No tenant clause inside it, and that is not an oversight:
         * `crm.account_entries` is behind row-level security (see
         * RowLevelSecurityTest), so a subquery cannot see a row the outer query
         * could not, and the outer query carries the model's own tenant scope.
         */
        $sinceCleared = 'crm.account_entries.id > coalesce(('
            .'select max(cleared.id) from crm.account_entries cleared'
            .' where cleared.customer_id = crm.account_entries.customer_id'
            .' and cleared.balance_after <= 0'
            .'), 0)';

        $rows = AccountEntry::query()
            ->whereIn('customer_id', $customerIds)
            // A charge, an adjustment upwards — anything that made the guest owe
            // more. A settlement is negative and is not what is aged.
            ->where('amount', '>', 0)
            ->whereRaw($sinceCleared)
            ->groupBy('customer_id')
            ->selectRaw('customer_id')
            ->selectRaw('min(occurred_at) as oldest')
            ->toBase()
            ->get();

        $ages = [];

        foreach ($rows as $row) {
            $ages[(int) $row->customer_id] = CarbonImmutable::parse((string) $row->oldest)->toIso8601String();
        }

        return $ages;
    }

    // ============ Internals ============

    /**
     * The one place a ledger line is written and a balance moves.
     *
     * Both, or neither. The caller is already inside a transaction; this keeps
     * the two writes adjacent so nobody can add a third path that does one of
     * them. `balance_after` is computed from the row that was locked, which is
     * what makes the column trustworthy rather than decorative.
     *
     * @param int $delta Tiyin, signed — what this line does to the balance.
     * @param array<string, mixed> $attributes
     */
    private function post(Customer $customer, string $kind, int $delta, array $attributes = []): AccountEntry
    {
        $balanceAfter = $customer->account_balance + $delta;

        /** @var AccountEntry $entry */
        $entry = AccountEntry::query()->create(array_merge($attributes, [
            'customer_id' => $customer->getKey(),
            // Filled here rather than by a trait, so nothing narrows a read of
            // the ledger by branch — see AccountEntry::branch().
            'branch_id' => $attributes['branch_id'] ?? $this->branches->id(),
            'kind' => $kind,
            'amount' => $delta,
            'balance_after' => $balanceAfter,
            'occurred_at' => now(),
        ]));

        // forceFill: `account_balance` is not fillable on purpose, and this is
        // the single exception the guard exists to allow.
        $customer->forceFill(['account_balance' => $balanceAfter])->save();

        return $entry;
    }

    /**
     * The guest's row, held for the rest of the transaction.
     *
     * @throws RuntimeException when there is no such guest in this restaurant
     */
    private function lock(int $customerId): Customer
    {
        /** @var Customer|null $customer */
        $customer = Customer::query()->lockForUpdate()->find($customerId);

        if ($customer === null) {
            throw ApiException::of('crm.customer_not_found', meta: ['customer_id' => $customerId]);
        }

        return $customer;
    }

    /**
     * Tiyin as the so'm figure a person reads.
     *
     * Only ever for a message — money stays whole tiyin everywhere it is
     * computed with, and the one place a fraction may appear is a sentence
     * explaining a refusal.
     */
    private static function soum(int $tiyin): string
    {
        return number_format($tiyin / 100, 0, ',', ' ');
    }
}
