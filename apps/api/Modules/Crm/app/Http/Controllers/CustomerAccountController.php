<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Modules\Crm\Http\Requests\SettleAccountRequest;
use Modules\Crm\Http\Requests\UpdateCreditLimitRequest;
use Modules\Crm\Http\Resources\AccountEntryResource;
use Modules\Crm\Http\Resources\CustomerAccountResource;
use Modules\Crm\Models\AccountEntry;
use Modules\Crm\Models\Customer;
use Modules\Crm\Services\EloquentGuestAccounts;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * Tabs, over HTTP — P13, "balansiga yozildi · pul kelmadi".
 *
 * Four doors, mounted under /api/v1/crm and gated by Spatie permission
 * middleware on the route definitions (Modules/Crm/routes/api.php): read one
 * guest's tab, take money against it, move the ceiling, and list everybody who
 * owes something.
 *
 * ---------------------------------------------------------------------------
 * There is deliberately no "charge this bill" door here
 *
 * A credit sale is made at a till, against a bill the till already holds, in the
 * same transaction that settles it. Exposing a second way in — a POST a client
 * could send on its own — would mean a tab could grow with no sale behind it and
 * no idempotency key tied to the bill, which is the one thing
 * `account_entries_one_charge_per_bill` exists to make impossible. Charging
 * crosses from the POS through the `GuestAccounts` contract, never over the wire.
 *
 * ---------------------------------------------------------------------------
 * What is NOT checked in this module, said out loud
 *
 * Going over the limit needs a manager's signature, and CRM cannot verify one.
 * Approvals live in `pos.approvals`, modules do not import each other
 * (ModuleBoundaryTest), so an `approval_id` reaching the ledger is a number this
 * module writes down and cannot confirm exists. The check that binds a signature
 * to its action, its bill AND its amount, and spends it exactly once, is
 * `ApprovalGate::consume()` in the POS.
 *
 * That is not a hole waiting to be plugged here, and the next person to read only
 * this module should not "fix" it by importing Pos. What CRM guarantees is
 * narrower and is the part that survives: an over-limit charge is never silent.
 * Either it fitted, or a signature is named on the line and an auditor can go and
 * ask who gave it.
 *
 * ---------------------------------------------------------------------------
 * Nothing here moves cash
 *
 * A credit sale is revenue and is not a drawer movement — that is the whole point
 * of the phase. `CashShift::expectedCashTerms()` counts only payments with
 * `method = 'cash'`, so a tab charge cannot reach the expected figure, and a
 * settlement taken at a till reaches it as the cash payment it actually was,
 * recorded by Finance, with this ledger merely pointing at its `payment_id`.
 */
final class CustomerAccountController extends Controller
{
    private const MAX_PER_PAGE = 100;

    /** How many ledger lines a statement shows before someone asks for the rest. */
    private const DEFAULT_ENTRIES = 20;

    private const MAX_ENTRIES = 100;

    /**
     * Who owes what — the accountant's screen, and the reason this phase exists.
     *
     * Lists guests who have a tab or a balance, not every guest on file: a
     * restaurant with forty thousand customers and eleven credit accounts should
     * open this page and see eleven rows.
     *
     * `outstanding_total` in the meta is the WHOLE book and ignores the filters
     * and the page, on purpose. "What are we owed" is one figure a person carries
     * out of the room, and a total that shrank because somebody typed a name into
     * the search box would be the wrong one to carry.
     */
    public function index(Request $request, EloquentGuestAccounts $accounts): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        /*
         * The narrowing rides on the query handed to QueryBuilder rather than
         * being chained after it, so no filter a client sends can widen it back
         * out to every guest on file.
         */
        $tabsOnly = Customer::query()->where(function (Builder $query): void {
            $query->where('credit_limit', '>', 0)->orWhere('account_balance', '!=', 0);
        });

        $records = QueryBuilder::for($tabsOnly)
            ->allowedFilters([
                AllowedFilter::exact('phone'),
                AllowedFilter::partial('name'),
                AllowedFilter::callback('in_debt', $this->filterInDebt(...)),
                AllowedFilter::callback('over_limit', $this->filterOverLimit(...)),
            ])
            ->allowedSorts(['account_balance', 'credit_limit', 'name'])
            // Biggest debt first: it is the row somebody is going to act on.
            ->defaultSort('-account_balance')
            ->paginate($perPage)
            ->withQueryString();

        /*
         * How long each debt has been outstanding, attached row by row.
         *
         * One extra query for the whole page rather than a column on the
         * customer row, because "since when" is a property of the LEDGER and
         * putting a date on `customers` would be a second copy of a fact that
         * `crm.account_entries` already holds — the exact drift this module
         * spends a lock avoiding on the balance itself.
         *
         * The books screen cannot draw its ageing buckets or its age column
         * without it, and those two ARE the receivables tab: a list of debtors
         * with no age is a list nobody can act on.
         */
        $ages = $accounts->oldestUnsettled(
            $records->getCollection()
                ->filter(static fn (Customer $customer): bool => $customer->account_balance > 0)
                ->map(static fn (Customer $customer): int => (int) $customer->getKey())
                ->values()
                ->all(),
        );

        $records->getCollection()->each(static function (Customer $customer) use ($ages): void {
            // Set on the model rather than passed beside the collection: a
            // resource renders one row and has no way to reach a lookup table,
            // and a second parallel array is how a page ends up showing one
            // guest's age against another's name.
            $customer->setAttribute('oldest_unsettled_at', $ages[$customer->getKey()] ?? null);
        });

        return CustomerAccountResource::collection($records)->additional([
            'meta' => [
                'outstanding_total' => $accounts->outstandingTotal(),
            ],
        ]);
    }

    /**
     * `?filter[in_debt]=1` — only guests who actually owe something.
     *
     * Through the model's own scope, which is strictly greater than zero: a guest
     * holding a deposit has a negative balance and is not a debtor, and putting
     * them on this list is how a collections call gets made to somebody the
     * restaurant owes money to.
     *
     * @param  Builder<Customer>  $query
     */
    private function filterInDebt(Builder $query, mixed $value): void
    {
        if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
            $query->inDebt();
        }
    }

    /**
     * `?filter[over_limit]=1` — guests past their ceiling.
     *
     * Not a list of mistakes. It fills up the ordinary way: a manager authorises
     * one charge over the limit, or somebody lowers a limit afterwards on a guest
     * who already owes more than the new one. Either way these are the accounts
     * that stopped being able to sign for lunch, and the guest will find out at
     * the till unless somebody rings them first.
     *
     * @param  Builder<Customer>  $query
     */
    private function filterOverLimit(Builder $query, mixed $value): void
    {
        if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
            $query->whereColumn('account_balance', '>', 'credit_limit')
                ->where('account_balance', '>', 0);
        }
    }

    /**
     * One guest's tab: the two numbers, and the working behind them.
     *
     * The recent lines ride along rather than sitting behind a second request,
     * because the two questions are never asked separately — a cashier reading
     * "you owe 340 000" to a guest is immediately asked "since when".
     */
    public function show(Request $request, Customer $customer): CustomerAccountResource
    {
        $limit = min(
            max($request->integer('entries', self::DEFAULT_ENTRIES), 1),
            self::MAX_ENTRIES,
        );

        // setRelation rather than a constrained eager load: `accountEntries()`
        // already orders newest-first, and this keeps the limit visibly attached
        // to the query that is actually run.
        $customer->setRelation('accountEntries', $customer->accountEntries()->limit($limit)->get());

        return new CustomerAccountResource($customer);
    }

    /**
     * The guest pays the tab down.
     *
     * `crm.update` rather than `crm.manage`, because a cashier has to be able to
     * take money over the counter at eight in the evening. Taking money REDUCES
     * what the restaurant is owed, so the person doing it has no incentive to
     * inflate it, and the one direction that needed a higher bar — raising the
     * ceiling — is a different route with a different permission.
     *
     * 201 and the created line, not the balance alone: a settlement is a receipt,
     * and the guest standing there is owed an id they can be shown again.
     */
    public function settle(
        SettleAccountRequest $request,
        Customer $customer,
        EloquentGuestAccounts $accounts,
    ): JsonResponse {
        $validated = $request->validated();

        $entryId = $accounts->settle(
            customerId: (int) $customer->getKey(),
            amount: (int) $validated['amount'],
            paymentId: isset($validated['payment_id']) ? (int) $validated['payment_id'] : null,
            userId: $request->user()?->id,
            note: $validated['note'] ?? null,
        );

        /** @var AccountEntry $entry */
        $entry = AccountEntry::query()->findOrFail($entryId);

        return response()->json([
            'entry' => new AccountEntryResource($entry),
            'account' => new CustomerAccountResource($customer->refresh()),
        ], 201);
    }

    /**
     * Move the ceiling. `crm.manage`, and the split is the point of the route.
     *
     * Lowering it below what the guest already owes is allowed and is not an
     * error: `credit_available` floors at zero, so the effect is that they may
     * sign for nothing more, which is exactly what a restaurant wants when a debt
     * has grown. Refusing it would mean the only way to stop extending credit to
     * somebody is to first collect from them.
     *
     * Zero closes the tab and leaves the balance alone. What is owed is still
     * owed — a limit is permission to borrow, not the debt itself, and clearing a
     * debt is `writeOff()`, which is a loss somebody signs for.
     *
     * The change is not written silently: `LogsActivity` on Customer records
     * `credit_limit` with its causer and both values, which is how "who let them
     * run this up" stays answerable a year later.
     */
    public function updateCreditLimit(UpdateCreditLimitRequest $request, Customer $customer): CustomerAccountResource
    {
        $customer->update(['credit_limit' => (int) $request->validated()['credit_limit']]);

        return new CustomerAccountResource($customer->refresh());
    }
}
