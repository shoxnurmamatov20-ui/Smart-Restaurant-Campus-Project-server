<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Contracts\Finance\Tender;
use App\Contracts\Finance\TillLedger;
use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillRegistry;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Errors\ApiException;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Errors\ErrorResponse;
use Illuminate\Http\JsonResponse;
use Modules\Pos\Http\Controllers\Concerns\ResolvesTillContext;
use Modules\Pos\Http\Requests\SyncBatchRequest;
use Modules\Pos\Http\Requests\SyncResolveRequest;
use Modules\Pos\Models\PosApproval;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Models\TerminalSession;
use Modules\Pos\Services\ApprovalGate;
use Modules\Pos\Services\IdempotencyGuard;
use Modules\Pos\Sync\ConflictResolution;
use Modules\Pos\Sync\Mode;
use Modules\Pos\Sync\ResolvedEntry;
use Modules\Pos\Sync\SyncDispatcher;
use RuntimeException;

/**
 * The router came back. Hand over the shift.
 *
 * A till that lost the network kept selling into a local queue, and this is the
 * one door that queue comes through. Everything it holds happened — the food was
 * cooked, the notes are in the drawer — so the job here is not to decide whether
 * to accept it. It is to apply it exactly once, in the order the cashier worked,
 * and to ask a person about the entries the world has moved underneath.
 *
 * ---------------------------------------------------------------------------
 * Why it goes through SyncDispatcher and not through the other controllers
 *
 * Written twice, the live path and the replay path drift the first time anything
 * is added to either — a void that announces itself online and silently does not
 * when replayed, and a loss-prevention screen that misses exactly the shifts
 * worth looking at. So the verbs live in one class and both paths hand them
 * over.
 *
 * ---------------------------------------------------------------------------
 * What a batch is NOT allowed to launder
 *
 * The other routes carry a permission each — `bills/{bill}/cancel` asks for
 * `pos.void`, the rest ask for `pos.sell` — and a batch is one route carrying
 * eleven verbs. Left at that, a waiter could queue `bill.cancel` offline and
 * void a table's whole bill on replay, having been refused it every time they
 * tried it online. So the per-verb permission is checked here, from a map that
 * mirrors `routes/api.php` line for line, and the approval ladder runs on the
 * replayed verb exactly as it runs on the live one.
 *
 * That last part has a consequence worth stating plainly: an act that needs a
 * manager's signature cannot be signed offline, because the approval registry
 * lives on this server. Such an entry comes back `refused` with
 * `pos.approval_required` and the id of the request now sitting in the manager's
 * queue — the sale is not lost, it is waiting, and the till sends the entry again
 * with `approval_id` once it is signed.
 */
final class SyncController extends Controller
{
    use ResolvesTillContext;

    /**
     * The permission each queued verb would have needed had it been done online.
     *
     * A copy of what `routes/api.php` declares, and a deliberate one: there is no
     * way to ask the router "what would this action have cost", and a batch that
     * asked for nothing beyond `pos.sell` would be a hole around every other
     * guard in the module. Change a route's permission and change this line with
     * it; `OfflineSyncTest` holds the case that matters, which is that a waiter
     * cannot void a bill through the queue that they cannot void online.
     *
     * @var array<string, string>
     */
    private const PERMISSION_FOR = [
        'bill.open' => 'pos.sell',
        'bill.line.add' => 'pos.sell',
        'bill.line.void' => 'pos.sell',
        'bill.discount' => 'pos.sell',
        'bill.send' => 'pos.sell',
        'bill.split' => 'pos.sell',
        'bill.merge' => 'pos.sell',
        'bill.transfer' => 'pos.sell',
        // The one that is not `pos.sell`. A waiter may sell all night and may
        // never void a bill.
        'bill.cancel' => 'pos.void',
        // A comp is `pos.sell` on purpose — the waiter apologising for a
        // forty-minute wait is who raises it, and the gate below always sends it
        // to a manager whoever asked.
        'bill.comp' => 'pos.sell',
        'bill.tender' => 'pos.sell',
    ];

    /** The verbs that face the approval ladder, and the ladder's name for each. */
    private const GATED = [
        'bill.line.void' => 'void_line',
        'bill.discount' => 'discount',
        'bill.cancel' => 'void_order',
        'bill.comp' => 'comp',
    ];

    /** Outcomes that moved the queue forward. Everything else is still owed. */
    private const APPLIED = ['accepted', 'duplicate'];

    public function __construct(
        private readonly IdempotencyGuard $guard,
        private readonly SyncDispatcher $sync,
        private readonly ApprovalGate $approvals,
        private readonly BillRegistry $bills,
        private readonly ConflictResolution $resolutions,
        private readonly TillLedger $till,
    ) {}

    /**
     * Drain a queue.
     *
     * Partial application is the contract, not a compromise: one unsellable line
     * must not strand a night's takings, so every entry is tried and every entry
     * gets its own answer. The response says what happened to each.
     *
     * One entry in, one answer out. A batch of a single entry is a till asking
     * "apply this one thing" — usually the resubmission of something a person has
     * just resolved — so it answers in the single-write shape the rest of the
     * module uses: 409 for a conflict, with `conflict_kind` and the ordered
     * `options`, and the same error envelope for anything else refused. A batch
     * of many is a queue being drained and answers 200 with a row per entry,
     * carrying the identical conflict shape, so one console screen draws both.
     */
    public function batch(SyncBatchRequest $request): JsonResponse
    {
        $session = $this->session($request);
        $terminal = $this->terminal($request);
        $actor = $this->actor($request);

        /**
         * Bills this batch has opened, by the id the DEVICE gave the entry that
         * opened them.
         *
         * A till with no network cannot know what number a bill will get, so the
         * four lines and the payment behind it in the queue point at the entry
         * instead. This is where that pointer becomes a bill id, and it is filled
         * for entries applied a moment ago and for entries applied on an earlier
         * attempt alike — a queue that half drained and then lost the network
         * again is the ordinary case.
         *
         * @var array<string, int> $opened
         */
        $opened = [];

        $rows = $this->guard->replayBatch(
            $terminal,
            $request->entries(),
            function (string $action, array $payload) use ($session, $terminal, $actor, &$opened): array {
                $payload = $this->resolveReferences($payload, $opened);

                /*
                 * Order matters, and it is cheapest-and-most-final first.
                 *
                 * Permission is a fact about the person and no amount of
                 * resolving changes it. A conflict comes next because it can make
                 * the question moot — asking a manager to authorise a void on a
                 * bill somebody already settled sends them to answer a screen that
                 * has nothing to do with what actually happened. The signature is
                 * asked for last, when the entry is otherwise ready to apply.
                 */
                $this->refuseWithoutPermission($actor, $action);

                $this->sync->conflictsFor($action, $payload, $session);

                return $this->sync->apply(
                    $action,
                    $payload,
                    $session,
                    $terminal,
                    $this->signatureFor($terminal, $actor, $session, $action, $payload),
                );
            },
            onApplied: static function (string $localId, string $action, array $result) use (&$opened): void {
                // The two verbs that bring a bill into existence. A split's
                // result is the NEW bill, which is exactly the one the entries
                // behind it in the queue are talking about.
                if (in_array($action, ['bill.open', 'bill.split'], true) && isset($result['id'])) {
                    $opened[$localId] = (int) $result['id'];
                }
            },
        );

        if (count($rows) === 1 && ! in_array($rows[0]['status'], self::APPLIED, true)) {
            return $this->asSingleRefusal($rows[0]);
        }

        return response()->json([
            'data' => $rows,
            /*
             * Counted here rather than left to the client, because the number a
             * till acts on is `outstanding` — how much of the queue it must keep
             * holding — and a client deriving that itself gets it wrong the first
             * time a status is added.
             */
            'summary' => $this->summarise($rows),
        ]);
    }

    /**
     * A conflicted entry, answered.
     *
     * The other half of `batch()`. That method asks six questions; this one
     * takes the answer and finishes the write — one entry at a time, because a
     * person answers one question at a time and batching the answers would mean
     * a screen that had to collect six decisions before any of them took effect.
     *
     * **The conflict check is not re-run, and that is the design.** `apply()`
     * has never performed one — only `conflictsFor()` does, and this path does
     * not call it — so "keep the line even though the dish is stopped" applies
     * instead of bouncing off the same stop list forever. Re-checking would also
     * be wrong on its own terms: the world can move again between the question
     * and the answer, and a second run could raise a *different* conflict, to
     * which the cashier's chosen option would then be applied.
     *
     * Everything else the batch path does still happens. The permission for the
     * verb is checked — a waiter must not resolve their way into a void they
     * were refused online — the approval ladder is asked, and the whole thing
     * goes through the same idempotency guard on the same `local_id`, so a
     * resolve retried after a dropped connection replays rather than applying
     * twice.
     */
    public function resolve(SyncResolveRequest $request): JsonResponse
    {
        $session = $this->session($request);
        $terminal = $this->terminal($request);
        $actor = $this->actor($request);

        $action = (string) $request->input('action');

        $this->refuseWithoutPermission($actor, $action);

        $resolved = $this->resolutions->resolve(
            kind: $request->kind(),
            option: (string) $request->input('option'),
            action: $action,
            payload: $request->payload(),
            with: $request->with(),
            session: $session,
        );

        if ($resolved->discarded()) {
            /*
             * Nothing is applied, and the queue is still told it is finished.
             *
             * A discarded entry that came back as an error would be offered to
             * the cashier again on the next drain, and they would answer the
             * same question every morning until they stopped reading it.
             *
             * `merged_into_bill_id` rides in the result for the one discard that
             * has a successor: everything queued behind a merged `bill.open`
             * points at "the bill that entry opened", and this is the id it now
             * means.
             */
            return response()->json([
                'data' => [
                    'local_id' => $request->input('local_id'),
                    'local_seq' => (int) $request->input('local_seq'),
                    'action' => $action,
                    'status' => 'resolved',
                    'resolution' => $resolved->note,
                    'applied' => false,
                    'result' => isset($resolved->payload['merged_into_bill_id'])
                        ? ['id' => (int) $resolved->payload['merged_into_bill_id']]
                        : null,
                ],
            ]);
        }

        if ($resolved->mode === Mode::RecordAndReverse) {
            return response()->json([
                'data' => [
                    'local_id' => $request->input('local_id'),
                    'local_seq' => (int) $request->input('local_seq'),
                    'action' => $action,
                    'status' => 'resolved',
                    'resolution' => $resolved->note,
                    'applied' => true,
                    'result' => $this->recordAndReverse($resolved, $session),
                ],
            ]);
        }

        try {
            $applied = $this->guard->run(
                terminal: $terminal,
                localId: (string) $request->input('local_id'),
                localSeq: (int) $request->input('local_seq'),
                action: $action,
                payload: $resolved->payload,
                work: fn (): array => $this->sync->apply(
                    $action,
                    $resolved->payload,
                    $session,
                    $terminal,
                    $this->signatureFor($terminal, $actor, $session, $action, $resolved->payload),
                    $resolved->shift,
                ),
            );
        } catch (ApiException $named) {
            /*
             * A refusal that already has a name keeps it — the approval this
             * entry now needs, the option that was incomplete. Rethrown before
             * the catch below, because `ApiException` IS a `RuntimeException` and
             * would otherwise be flattened into a generic refusal, losing the
             * approval id a till has to poll.
             */
            throw $named;
        } catch (RuntimeException $refused) {
            /*
             * A module refusing on its own terms: a dish that is stopped, a bill
             * that closed again, a shift with nothing open.
             *
             * This escaped as a 500 until a test caught it. That is wrong twice
             * over — "Mastava hozir stop-listda" is a sentence a cashier has to
             * be told, not a server fault, and a 500 tells a till to retry
             * something that will refuse identically every time. `batch()` never
             * had this problem because `replayBatch()` catches per entry; this
             * path calls `run()` directly and had nothing around it.
             */
            throw ApiException::of('pos.bill_refused', meta: [
                'local_id' => $request->input('local_id'),
                'action' => $action,
                'resolution' => $resolved->note,
                'detail' => $refused->getMessage(),
            ]);
        }

        return response()->json([
            'data' => [
                'local_id' => $request->input('local_id'),
                'local_seq' => (int) $request->input('local_seq'),
                'action' => $action,
                'status' => $applied['replayed'] ? 'duplicate' : 'resolved',
                'resolution' => $resolved->note,
                'applied' => true,
                'result' => $applied['result'],
            ],
        ]);
    }

    /**
     * Record the second capture, then give it straight back.
     *
     * Only for `payment_duplicate:refund_duplicate`, where a guest really was
     * charged twice because both tills took money before either could tell the
     * other. Two rows that net to nothing is the honest shape: the card capture
     * exists at the acquirer whatever this system decides, so a reconciliation
     * against the bank statement has to find it here too, and a refund with no
     * payment behind it is a movement an accountant cannot explain.
     *
     * It does NOT go through the dispatcher, and the reason is worth stating
     * because the shape looks like every other resolution. `TenderService`
     * refuses to settle a bill that is already settled — rightly, or the bill
     * would close twice — so there is no settlement here to apply. The money goes
     * to the ledger directly and the bill's state is left exactly as the guest
     * signed for it.
     *
     * @return array<string, mixed>
     */
    private function recordAndReverse(ResolvedEntry $resolved, TerminalSession $session): array
    {
        $bill = $this->bills->find((int) ($resolved->payload['bill_id'] ?? 0));

        if ($bill === null) {
            throw ApiException::of('pos.conflict_option_incomplete', field: 'bill_id', meta: [
                'option' => 'refund_duplicate',
            ]);
        }

        $shiftId = $session->cash_shift_id ?? $this->till->openShiftFor((int) $session->user_id);

        if ($shiftId === null) {
            throw new RuntimeException('Ochiq smena yo\'q.');
        }

        $captured = [];
        $refunded = [];

        foreach ((array) ($resolved->payload['tenders'] ?? []) as $line) {
            $amount = (int) ($line['amount'] ?? 0);

            if ($amount <= 0) {
                continue;
            }

            $paymentId = $this->till->capture(
                shiftId: (int) $shiftId,
                orderId: $bill->id,
                orderNumber: $bill->number,
                tender: new Tender(
                    method: (string) $line['method'],
                    amount: $amount,
                    reference: isset($line['reference']) ? (string) $line['reference'] : null,
                    // The tip is dropped along with the charge. A waiter keeps a
                    // tip on money the guest meant to pay; this is money that is
                    // going straight back, and paying a tip out of it would leave
                    // the drawer short by exactly the tip.
                    tip: 0,
                ),
            );

            $captured[] = $paymentId;

            // No shift named: the notes come out of whichever drawer is open,
            // which is `refundPayment()`'s own rule and the only one that keeps
            // two Z-reports honest when a refund crosses a shift boundary.
            $refunded[] = $this->till->refundPayment($paymentId, $resolved->note)->paymentId;
        }

        return [
            'bill_id' => $bill->id,
            'payment_ids' => $captured,
            'refunded_payment_ids' => $refunded,
        ];
    }

    // ============ Internals ============

    /**
     * Turn "the bill that entry opened" into "bill 4 812".
     *
     * A queued line cannot name a bill id, because the bill was opened on a
     * tablet that had nothing to ask. It names the local id of the entry that
     * opened it, and that pointer is resolved here, in queue order, so a bill
     * opened at seq 1 is a number by the time seq 2 is dispatched.
     *
     * An unresolvable pointer is a hard failure and not a guess. It means the
     * entry that opens the bill conflicted, was refused, or was never sent — and
     * inventing a bill for the lines to land on would put a guest's food onto
     * somebody else's table.
     *
     * @param  array<string, mixed>  $payload
     * @param  array<string, int>  $opened
     * @return array<string, mixed>
     */
    private function resolveReferences(array $payload, array $opened): array
    {
        foreach (['bill_local_id' => 'bill_id', 'target_bill_local_id' => 'target_bill_id'] as $pointer => $field) {
            if (! isset($payload[$pointer])) {
                continue;
            }

            $localId = (string) $payload[$pointer];

            if (! isset($opened[$localId])) {
                throw new RuntimeException("Bu hisobni ochgan yozuv qo'llanmadi: {$localId}.");
            }

            $payload[$field] = $opened[$localId];
        }

        return $payload;
    }

    /**
     * Turn one unapplied row into the answer the single-write path would have
     * given, so a conflict is a 409 with its kind and its options whether it
     * arrived alone or forty-first in a queue.
     *
     * @param  array<string, mixed>  $row
     */
    private function asSingleRefusal(array $row): JsonResponse
    {
        // A bare failure has no name of its own — a closed bill, a dish that is
        // gone — and gets the same one the live selling path gives it.
        $code = (string) ($row['code'] ?? 'pos.bill_refused');

        unset($row['status'], $row['code'], $row['result']);

        return ErrorResponse::make(ErrorCatalogue::get($code), meta: $row);
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<string, int>
     */
    private function summarise(array $rows): array
    {
        $counts = ['accepted' => 0, 'duplicate' => 0, 'conflict' => 0, 'refused' => 0, 'failed' => 0];

        foreach ($rows as $row) {
            $status = (string) $row['status'];
            $counts[$status] = ($counts[$status] ?? 0) + 1;
        }

        return [...$counts, 'total' => count($rows), 'outstanding' => $counts['conflict']
            + $counts['refused'] + $counts['failed']];
    }

    /**
     * @throws ApiException when this person could not have done it online either
     */
    private function refuseWithoutPermission(User $actor, string $action): void
    {
        // Unknown verbs never reach here — the form request checks the action
        // against the dispatcher's own list — so a missing entry in the map is a
        // route added without its line here, and the strictest permission in the
        // module is the safe direction to be wrong in.
        $permission = self::PERMISSION_FOR[$action] ?? 'pos.manage';

        if ($actor->can($permission)) {
            return;
        }

        throw ApiException::of('pos.sync_action_forbidden', meta: [
            'action' => $action,
            'permission' => $permission,
        ]);
    }

    /**
     * The manager's signature this entry needs, spent — or the request that has
     * just been put in front of a manager, thrown.
     *
     * @param  array<string, mixed>  $payload
     *
     * @throws ApiException
     */
    private function signatureFor(
        Terminal $terminal,
        User $actor,
        TerminalSession $session,
        string $action,
        array $payload,
    ): ?PosApproval {
        $stake = $this->stakeFor($action, $payload);

        if ($stake === null) {
            return null;
        }

        [$gateAction, $amount, $subtotal, $subjectType, $subjectId] = $stake;

        /*
         * `alreadyFired` is deliberately not passed here.
         *
         * `policies.void_sent_needs_manager_pin` is a rule about a cashier
         * standing at a till with a plate in front of them. This is a queue
         * draining after an outage: the void was decided hours ago, on a tablet
         * that had no way to raise an approval and no manager on the network to
         * sign one. Refusing it now would not undo the strike — it would leave
         * the entry in the queue forever, which is the failure `apply()` already
         * refuses to create when it declines to re-check conflicts.
         *
         * The role ladder still applies, so a void beyond a cashier's ceiling
         * still comes back as an approval request the till can answer.
         */
        if (! $this->approvals->requires($terminal, $actor, $gateAction, $amount, $subtotal)) {
            return null;
        }

        $approvalId = (int) ($payload['approval_id'] ?? 0);

        if ($approvalId <= 0) {
            $raised = $this->approvals->request(
                session: $session,
                action: $gateAction,
                reason: (string) ($payload['reason'] ?? ''),
                subjectType: $subjectType,
                subjectId: $subjectId,
                amount: $amount,
            );

            // The id matters as much as the refusal: without it the till knows
            // only that a manager must sign something, and cannot poll it, show
            // it, or send the entry back once it is signed.
            throw ApiException::of('pos.approval_required', meta: [
                'approval_id' => $raised->getKey(),
            ]);
        }

        try {
            // The amount goes back in, so the signature is checked against what
            // it is now being spent on rather than only against what it named.
            return $this->approvals->consume($approvalId, $gateAction, $subjectType, $subjectId, $amount);
        } catch (RuntimeException $failure) {
            throw ApiException::of('pos.approval_invalid', meta: ['detail' => $failure->getMessage()]);
        }
    }

    /**
     * What is at stake in a queued verb: the ladder's name for it, the money on
     * it, and the bill it is measured against.
     *
     * The same three readings `BillController` makes before it calls its own
     * gate — the value of the line being voided, the resolved discount, the whole
     * bill for a void or a comp — and for now the second copy of them. They could
     * not simply be borrowed: a controller is not callable from another
     * controller, and the readings are what the gate needs rather than what the
     * dispatcher does. When `BillController` is next opened this belongs on
     * `SyncDispatcher` beside the verbs, read from one place by both paths.
     *
     * Null means the verb faces no ladder, or names a bill that is not there —
     * nobody should be asked to authorise an operation that is going to be
     * refused by name a moment later.
     *
     * @param  array<string, mixed>  $payload
     * @return array{0: string, 1: int, 2: int, 3: string, 4: int}|null
     */
    private function stakeFor(string $action, array $payload): ?array
    {
        $gateAction = self::GATED[$action] ?? null;

        if ($gateAction === null) {
            return null;
        }

        $bill = $this->bills->find((int) ($payload['bill_id'] ?? 0));

        if ($bill === null) {
            return null;
        }

        if ($gateAction === 'void_line') {
            $lineId = (int) ($payload['line_id'] ?? 0);

            return [$gateAction, $this->lineStake($bill, $lineId), $bill->subtotal, 'line', $lineId];
        }

        if ($gateAction === 'discount') {
            /*
             * The amount, never a percent.
             *
             * `BillController` resolves a percentage into tiyin before the entry
             * is ever queued, precisely so a replay carries what was DONE: a
             * percentage of a subtotal that has moved since is a different
             * discount, and the manager who signed for one figure would be
             * recorded as having signed for another.
             */
            return [$gateAction, (int) ($payload['amount'] ?? 0), $bill->subtotal, 'bill', $bill->id];
        }

        // Ending a bill puts the whole bill at stake, which no percentage ladder
        // survives — that is the intended answer, not an accident of the maths.
        return [$gateAction, $bill->total, $bill->subtotal, 'bill', $bill->id];
    }

    private function lineStake(Bill $bill, int $lineId): int
    {
        foreach ($bill->lines as $line) {
            if ($line->id === $lineId) {
                return $line->totalPrice;
            }
        }

        return 0;
    }
}
