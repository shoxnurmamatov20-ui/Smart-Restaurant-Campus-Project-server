<?php

declare(strict_types=1);

namespace App\Contracts\Pos;

use RuntimeException;

/**
 * "Does somebody else have to sign for this, and who is waiting on one?"
 *
 * The approval ledger, reachable from outside the Pos module. Two callers need
 * it and neither may import a till:
 *
 *   **The staff app.** A waiter with a handset is the person who most often
 *   needs a manager's signature — they are the one standing in front of the
 *   guest — and a manager holding a phone is the person who answers. Until this
 *   existed, raising a request required a PIN session on a tablet, so in
 *   practice the waiter walked to a till, and the manager's PIN got told to
 *   whoever was standing at it. The table then records a lie for the rest of the
 *   year.
 *
 *   **The back office.** The console can discount and move a bill now, and
 *   `ApprovalGate`'s rule has to hold there too: the person who asks is never
 *   the person who agrees.
 *
 * Everything here is ids and tiyin. Nothing leaks an Eloquent model, and no
 * caller learns what a terminal is.
 */
interface Approvals
{
    /**
     * Does this person need somebody else's signature for this?
     *
     * The one question a caller outside Pos actually has. Answering it needs the
     * role ladder, the always-approved list and the amount at stake, all of
     * which live in the till module.
     *
     * True when in doubt. A caller with no terminal — a console, a handset — has
     * no discount ladder to be measured against, so anyone without `pos.approve`
     * is sent to ask. That is the safe direction to be wrong in, and in practice
     * it costs nothing: everybody who can reach those screens either holds the
     * approving permission or genuinely needs a signature.
     *
     * @param  int  $amountTiyin  What is at stake. A 2% discount on a coffee is not
     *                            a 2% discount on a wedding.
     * @param  int  $subtotalTiyin  What the amount is a share of.
     */
    public function requiredFor(int $userId, string $action, int $amountTiyin = 0, int $subtotalTiyin = 0): bool;

    /**
     * Raise a request and put it in the queue. Returns its id.
     *
     * `$branchId` says which building is being asked, and it is what a manager's
     * queue is narrowed by — a request nobody can see is a request nobody
     * answers.
     *
     * @throws RuntimeException when the action is not one this ledger knows
     */
    public function ask(
        int $requestedByUserId,
        string $action,
        string $reason,
        ?string $subjectType = null,
        ?int $subjectId = null,
        int $amountTiyin = 0,
        ?int $branchId = null,
    ): PendingApproval;

    /**
     * What is waiting for a signature, oldest first.
     *
     * Oldest first because the person who has been standing in front of a guest
     * longest is the one who matters, and a queue sorted any other way teaches a
     * manager to answer whoever asked most recently.
     *
     * @param  int|null  $branchId  Null is a roll-up across the estate — convention
     *                              3: an empty tenant is a hole, an empty branch is
     *                              a total.
     * @return array<int, PendingApproval>
     */
    public function waiting(?int $branchId = null, int $limit = 50): array;

    /**
     * Spend a granted signature, or explain why it cannot be spent.
     *
     * Bound to its action, its subject AND its amount: a signature for one line
     * must not be spendable on another, and one granted for 1 000 000 must not
     * cover 5 000 000 — the manager answered a screen that said a figure, and
     * that sentence is the entire content of their decision.
     *
     * Single use. Marking it spent happens in the same transaction as the check,
     * so two concurrent requests cannot both redeem one signature.
     *
     * @throws RuntimeException when it is unknown, unanswered, refused, expired,
     *                          already spent, or was granted for something else
     */
    public function spend(
        int $approvalId,
        string $action,
        ?string $subjectType = null,
        ?int $subjectId = null,
        int $amountTiyin = 0,
    ): void;

    /**
     * Answer one, as this person.
     *
     * The person who asked can never be the person who agrees; that rule is
     * enforced here rather than by each caller, because it is the only thing
     * that makes the whole ledger worth keeping.
     *
     * @throws RuntimeException when the request is unknown, already answered,
     *                          expired, or is the caller's own
     */
    public function decide(int $approvalId, int $byUserId, bool $granted): PendingApproval;
}
