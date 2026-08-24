<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Controllers;

use App\Contracts\Pos\Approvals;
use App\Contracts\Pos\PendingApproval;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Errors\ErrorResponse;
use App\Support\Tenancy\BranchContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use RuntimeException;

/**
 * The approval queue, on a phone.
 *
 * P9 already moved *answering* an approval out of the till session, and its
 * argument is worth repeating because this controller is the other half of it:
 * a manager is not at the till — they are in the office, in the car park, or at
 * the other branch — and requiring a PIN session meant the manager's PIN got
 * told to the cashier instead, after which the fraud ledger records a lie for
 * the rest of the year.
 *
 * *Asking* was left behind. `POST /pos/approvals` sits inside `pos.session`, so
 * the only thing on the platform that could raise a request was a tablet with a
 * PIN session open. The person who most often needs a signature is a waiter
 * standing at a table with a handset, apologising for a dessert — and they had
 * to walk to a till to ask for it, which is the same walk, in the same
 * direction, for the same reason.
 *
 * ---------------------------------------------------------------------------
 * Why it is here and not a second route on the Pos module
 *
 * Because the crew app is a Staff surface and a module may not import another.
 * Everything below goes through `App\Contracts\Pos\Approvals`, so this
 * controller never learns what a terminal is, and a deployment with no till
 * module answers an empty queue instead of failing to boot.
 *
 * ---------------------------------------------------------------------------
 * The permissions, and why they are not the same one
 *
 * Asking is `pos.sell` — every waiter and cashier holds it, and asking is part
 * of selling. Answering is `pos.approve`, which is what makes the ledger mean
 * anything. Guarding both with one permission would either stop waiters asking
 * or let them sign their own requests off.
 */
final class StaffApprovalController extends Controller
{
    public function __construct(private readonly Approvals $approvals) {}

    /**
     * What is waiting, for the manager holding this phone.
     *
     * Scoped to the venue on `X-Branch` when the handset sends one, and to the
     * whole estate when it does not — convention 3, and the reason a brand
     * manager covering four venues sees one list.
     */
    public function index(Request $request, BranchContext $branches): JsonResponse
    {
        $waiting = $this->approvals->waiting(
            branchId: $branches->id(),
            limit: min($request->integer('limit', 50), 200),
        );

        return response()->json([
            'data' => array_map(
                static fn (PendingApproval $approval): array => $approval->toArray(),
                $waiting,
            ),
        ]);
    }

    /**
     * Ask for a signature from wherever you are standing.
     *
     * The subject and the amount are what a manager is agreeing to, and both are
     * carried so the answer can be bound to them: a signature for one line must
     * never be spendable on a different one, and one for 1 000 000 must not
     * cover 5 000 000. Those checks live in the ledger, not here.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            /*
             * Not validated against the till's own ACTIONS list here.
             *
             * That list belongs to Pos and this module may not read it, so the
             * ledger refuses an unknown verb — with a message a person can act
             * on — and this rule only keeps something absurd out of the wire.
             */
            'action' => ['required', 'string', 'max:32'],
            'reason' => ['required', 'string', 'min:3', 'max:255'],
            'subject_type' => ['nullable', 'string', Rule::in(['bill', 'line', 'payment', 'drawer', 'shift'])],
            'subject_id' => ['nullable', 'integer', 'min:1'],
            'amount' => ['sometimes', 'integer', 'min:0'],
        ]);

        /** @var User $person */
        $person = $request->user();

        try {
            $raised = $this->approvals->ask(
                requestedByUserId: (int) $person->getKey(),
                action: (string) $validated['action'],
                reason: (string) $validated['reason'],
                subjectType: $validated['subject_type'] ?? null,
                subjectId: isset($validated['subject_id']) ? (int) $validated['subject_id'] : null,
                amountTiyin: (int) ($validated['amount'] ?? 0),
                branchId: app(BranchContext::class)->id(),
            );
        } catch (RuntimeException $refusal) {
            return ErrorResponse::make(
                ErrorCatalogue::get('pos.approval_invalid'),
                meta: ['detail' => $refusal->getMessage()],
            );
        }

        return response()->json(['data' => $raised->toArray()], Response::HTTP_CREATED);
    }

    /**
     * Answer one.
     *
     * A refusal travels as well as an agreement, and that is not a nicety: the
     * handset that raised the request is in front of a guest and cannot tell
     * "the manager said no" from "nothing has arrived yet". Those are opposite
     * instructions to give a waiter.
     */
    public function decide(Request $request, int $approval): JsonResponse
    {
        $validated = $request->validate([
            'approved' => ['required', 'boolean'],
        ]);

        /** @var User $person */
        $person = $request->user();

        try {
            $decided = $this->approvals->decide(
                approvalId: $approval,
                byUserId: (int) $person->getKey(),
                granted: (bool) $validated['approved'],
            );
        } catch (RuntimeException $refusal) {
            // One code for every refusal the ledger raises — unknown, already
            // answered, expired, or the caller's own request — with the reason
            // attached. The handset shows the sentence; branching on which of
            // the four it was would change nothing it can do next.
            return ErrorResponse::make(
                ErrorCatalogue::get('pos.approval_closed'),
                meta: ['detail' => $refusal->getMessage()],
            );
        }

        return response()->json(['data' => $decided->toArray()]);
    }
}
