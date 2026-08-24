<?php

declare(strict_types=1);

namespace App\Contracts\Tables;

/**
 * The three things another module may DO to the floor.
 *
 * {@see FloorBoard} is the read half and is deliberately a tally; this is the
 * write half and is deliberately few verbs. Two exist for the same caller: a
 * waiter's phone, draining a queue it filled while the basement had no signal.
 * `POST /api/v1/staff/actions` carries `table_claim` and `call_resolve`, and
 * Staff may not import Tables — `ModuleBoundaryTest` records no such edge, and
 * adding one would make the two modules one program.
 *
 * The third has a different caller and the same shape of problem: a settled
 * bill clearing its own table, from Orders, when the restaurant has asked for
 * that (`policies.auto_close_table_after_payment`).
 *
 * Both answer a boolean rather than throwing, and that is the same decision
 * `StockLedger` made for the same reason: the caller is a batch of twelve
 * entries, and one that cannot land must come back as one refusal with a
 * reason, not as a failed request that leaves the other eleven queued forever.
 *
 * Nothing here takes money, moves a bill or reads a guest. A claim seats a
 * table and says who took it; resolving a call closes a raised hand. A caller
 * that needs anything richer is doing floor work and belongs behind
 * `/api/v1/tables` with its permissions.
 */
interface FloorPlan
{
    /**
     * This waiter has taken that table.
     *
     * Two effects, and both are the point: the table becomes `occupied` so the
     * host stops offering it, and it remembers WHO took it so the floor screen
     * and the waiter's own dashboard can answer "which tables are mine". A
     * claim recorded without the person would seat the room and tell nobody
     * whose section it is.
     *
     * Idempotent for the same person: a phone that queued the claim twice, or
     * retried after a dead connection, gets `true` both times and the table is
     * claimed once. It answers `false` when there is no such table in this
     * restaurant, when the table is not active, or when it is already held by
     * SOMEBODY ELSE — the last of those is the one that matters, because two
     * waiters both told "yes" is two waiters walking to the same six covers.
     */
    public function claim(int $tableId, int $userId): bool;

    /**
     * Somebody answered a raised hand.
     *
     * Closes the call — `done`, stamped with the moment and, when nobody had
     * acknowledged it yet, with the person who did. The waiting time between
     * `created_at` and `closed_at` is the single number `tables.waiter_calls`
     * exists to produce, so this never deletes and never reopens.
     *
     * `false` when there is no such call in this restaurant or it was already
     * closed. Already-closed is not an error the queue should keep retrying:
     * the guest was served, by whoever got there first.
     */
    public function resolveCall(int $callId, int $userId): bool;

    /**
     * The guests have gone — the table needs clearing before it is sold again.
     *
     * `cleaning` rather than `free`, which is the same answer this module's own
     * screens give: a table whose bill has just been settled still has plates on
     * it, and a floor map that showed it free would seat the next party into
     * somebody's dessert. A host taps it clear.
     *
     * Idempotent, and deliberately narrow: a table that is already `cleaning`
     * or already `free` answers `false` because nothing changed, and so does a
     * table that is `reserved` — a bill settled on a table somebody has since
     * booked must not silently unbook it.
     *
     * The caller is `EloquentBillRegistry::close()`, and only when the
     * restaurant has switched the rule on. Nothing here decides that; the
     * policy is read where the bill is closed, because that is where the bill's
     * OTHER open tabs are known — clearing a table that still has a second bill
     * running on it is the one way this verb can be actively wrong.
     */
    public function release(int $tableId): bool;
}
