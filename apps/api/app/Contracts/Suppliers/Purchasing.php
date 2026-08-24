<?php

declare(strict_types=1);

namespace App\Contracts\Suppliers;

/**
 * What the rest of the platform may ask the purchasing ledger.
 *
 * {@see Receiving} is the write half of this module's contract surface — one
 * verb, the heaviest one it has. This is the read half, and it exists for two
 * screens that were honestly empty on every live tenant:
 *
 *   the storekeeper's dashboard   which vans are due today, and which arrived
 *   the accountant's dashboard    what is unpaid, what is overdue, what is next
 *
 * Both are drawn by Analytics, which may read Menu, Orders and Finance and
 * nothing else — `ModuleBoundaryTest` records exactly three edges out of that
 * module. So this is a contract rather than a query, for the same reason
 * `StockReport` and `Roster` are.
 *
 * ---------------------------------------------------------------------------
 * Lists, unlike `FloorBoard` — and why that is not a inconsistency
 *
 * `FloorBoard` publishes a tally and says a caller wanting the tables is doing
 * floor work. The distinction it is drawing is about GUEST data: which table is
 * occupied is a fact about the people sitting at it. A purchase order is the
 * restaurant's own paperwork with its own supplier, and the two dashboards need
 * the rows themselves — "three deliveries today" with no supplier names is a
 * number nobody can act on, and an ageing list is by definition a list.
 *
 * What is still withheld is the detail: no line items, no prices per unit, no
 * ingredient ids. A caller that needs those is doing purchasing and belongs
 * behind `/api/v1/suppliers` with its permission checks.
 *
 * ---------------------------------------------------------------------------
 * Not branch-scoped, and that is the register's own shape
 *
 * A supplier belongs to the business, not to an address (CLAUDE.md, binding
 * convention 3): `suppliers.purchase_orders` carries no `branch_id`, so neither
 * does this contract. A per-venue receiving book would be a migration and a
 * decision about how a chain buys, not a parameter added here.
 */
interface Purchasing
{
    /**
     * Deliveries whose due date falls inside a stretch of trading.
     *
     * Both halves of the storekeeper's panel come from one call: the ones still
     * on their way and the ones already signed for, because the KPI card above
     * the table divides the second by the first and two queries would let the
     * numerator and the denominator be cut differently.
     *
     * Ordered by when they were due, earliest first — a receiving bay works
     * through the morning, and an unordered list of vans is a list somebody has
     * to sort by hand.
     *
     * `$from` and `$to` are trading dates (`Y-m-d`), inclusive.
     *
     * @return list<IncomingDelivery>
     */
    public function expectedBetween(string $from, string $to, int $limit = 10): array;

    /**
     * Invoices with money still owed on them, soonest deadline first.
     *
     * "Outstanding" is about MONEY, not delivery: a received order on thirty-day
     * terms is closed and unpaid, and a deposit on a draft is open and part
     * settled. The two clocks run separately and this reads the second one.
     *
     * @return list<Payable>
     */
    public function outstanding(int $limit = 10): array;

    /**
     * The two counts above an accountant's list.
     *
     * Counted rather than derived from `outstanding()` by the caller, because
     * that list is capped: a business with sixty unpaid invoices would report
     * ten, and the card exists precisely to say how deep the pile is.
     *
     * `overdue` is measured against the reader's own clock in this
     * implementation, not the database's — see the note on `Payable::$dueAt`.
     *
     * @return array{unpaid: int, overdue: int, amount_tiyin: int}
     */
    public function payablesSummary(): array;
}
