<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Errors\ErrorResponse;
use App\Support\Events\EventBus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Laravel\Sanctum\PersonalAccessToken;
use Modules\Pos\Events\ApprovalDecided;
use Modules\Pos\Http\Controllers\Concerns\ResolvesTillContext;
use Modules\Pos\Http\Requests\ApproveWithPinRequest;
use Modules\Pos\Http\Resources\PosApprovalResource;
use Modules\Pos\Models\PosApproval;
use Modules\Pos\Models\TerminalSession;
use Modules\Pos\Services\ApprovalGate;
use Modules\Pos\Services\PinAuthenticator;
use RuntimeException;

/**
 * The manager's queue.
 *
 * This is the screen a branch manager actually lives on: everything a cashier
 * has asked permission for, oldest first, with the amount at stake and the
 * reason they gave. Answering is one tap, and the answer is recorded against
 * their name for as long as the restaurant keeps records.
 */
final class ApprovalController extends Controller
{
    use ResolvesTillContext;

    public function __construct(
        private readonly ApprovalGate $gate,
        private readonly EventBus $events,
        private readonly PinAuthenticator $pins,
    ) {}

    public function index(Request $request): ResourceCollection
    {
        $approvals = PosApproval::query()
            ->with(['requestedBy', 'approvedBy', 'terminal'])
            /*
             * Narrowed to the branch the caller is looking at, and only when they
             * named one — `BelongsToBranch` on the model does it, from `X-Branch`.
             *
             * This used to be `whereHas('terminal')`, reading the branch through
             * the till the request came from, and its comment said why: *"the
             * approval row itself has no branch of its own"*. It has one now, and
             * it had to: a waiter's handset can raise a request with no terminal
             * anywhere near it, and under the old join those were invisible to
             * every console in the building — asked for, and shown to nobody who
             * could answer.
             *
             * With no header the whole estate comes back, which is convention 3:
             * an empty tenant is a hole, an empty branch is a roll-up, and a brand
             * manager answering for four venues is the reason the roll-up exists.
             */
            ->when(
                $request->filled('status'),
                fn ($query) => $query->where('status', $request->string('status')),
                fn ($query) => $query->pending(),
            )
            ->when($request->filled('terminal_id'), fn ($query) => $query->where('terminal_id', $request->integer('terminal_id')))
            ->orderBy('requested_at')
            ->paginate(min($request->integer('per_page', 50), 100))
            ->withQueryString();

        return PosApprovalResource::collection($approvals);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'action' => ['required', 'string', Rule::in(PosApproval::ACTIONS)],
            'reason' => ['required', 'string', 'min:3', 'max:255'],
            'subject_type' => ['nullable', 'string', Rule::in(PosApproval::SUBJECTS)],
            'subject_id' => ['nullable', 'integer', 'min:1'],
            'amount' => ['sometimes', 'integer', 'min:0'],
        ]);

        try {
            $approval = $this->gate->request(
                session: $this->session($request),
                action: (string) $validated['action'],
                reason: (string) $validated['reason'],
                subjectType: $validated['subject_type'] ?? null,
                subjectId: isset($validated['subject_id']) ? (int) $validated['subject_id'] : null,
                amount: (int) ($validated['amount'] ?? 0),
            );
        } catch (RuntimeException $failure) {
            return ErrorResponse::make(
                ErrorCatalogue::get('pos.approval_invalid'),
                meta: ['detail' => $failure->getMessage()],
            );
        }

        return (new PosApprovalResource($approval->load('requestedBy')))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function decide(Request $request, PosApproval $approval): JsonResponse
    {
        $validated = $request->validate([
            'approved' => ['required', 'boolean'],
        ]);

        $manager = $this->actor($request);

        // The person who asked can never be the person who agrees. Without this
        // line the whole table is decoration.
        if ((int) $approval->requested_by_user_id === (int) $manager->getKey()) {
            return ErrorResponse::code('pos.approval_self');
        }

        if (! $approval->decide($manager, (bool) $validated['approved'], $this->answeredFrom($request))) {
            return ErrorResponse::code('pos.approval_closed');
        }

        /*
         * The return leg, and it carries refusals as well as agreements.
         *
         * The tablet that raised this is standing in front of a guest. It could
         * poll, and it will; what it cannot do is tell "the manager said no" apart
         * from "nothing has arrived yet", and those are opposite instructions to
         * give a waiter. An event that only announced yeses would teach every till
         * in the estate to read silence as a refusal.
         */
        $this->events->publish(new ApprovalDecided($approval->refresh()));

        return response()->json([
            'data' => (new PosApprovalResource($approval->fresh()?->load(['requestedBy', 'approvedBy'])))->resolve($request),
        ]);
    }

    /**
     * The same answer, typed on the till the request came from.
     *
     * `decide()` above wants the manager's own token, which is right for the
     * manager who is somewhere else. It is wrong for the one who walked over:
     * they would have to sign the cashier out of their own terminal, answer,
     * and sign back in — so in practice the manager's PIN gets told to the
     * cashier instead, and the approval table records a lie for the rest of
     * the year. This route exists to make the honest path the easy one.
     *
     * What is checked, and by whom:
     *
     *   - The route is inside `pos.session`, so the request already carries a
     *     live till and the cashier who opened it. `pos.sell` is the caller's
     *     permission — asking is part of selling.
     *   - `pos.approve` is checked against the person whose PIN was typed, not
     *     against the caller. That is the whole point of the endpoint.
     *   - The approval must belong to this terminal. Without that line a
     *     cashier could answer another venue's queue from their own till by
     *     guessing an id, using a manager PIN they were legitimately given for
     *     their own.
     *
     * `method` stays `pin` because `answeredFrom()` reads the credential, and
     * this request carries a session token — which is exactly the truth: it was
     * answered at a till.
     */
    public function decideWithPin(ApproveWithPinRequest $request, PosApproval $approval): JsonResponse
    {
        $session = $this->session($request);

        if ((int) $approval->terminal_id !== (int) $session->terminal_id) {
            // Not this till's question. Answered as "already closed" rather
            // than "not yours", because the two together would let a keypad
            // enumerate which approvals exist elsewhere.
            return ErrorResponse::code('pos.approval_closed');
        }

        $manager = $this->pins->verifyApprover(
            terminal: $this->terminal($request),
            userId: $request->integer('user_id'),
            pin: (string) $request->string('pin'),
        );

        // The person who asked can never be the person who agrees — the same
        // rule as `decide()`, and the one this door most needs.
        if ((int) $approval->requested_by_user_id === (int) $manager->getKey()) {
            return ErrorResponse::code('pos.approval_self');
        }

        if (! $approval->decide($manager, $request->boolean('approved'), 'pin')) {
            return ErrorResponse::code('pos.approval_closed');
        }

        // Announced like every other decision: the tablet that raised this is
        // standing in front of a guest and cannot tell silence from a refusal.
        $this->events->publish(new ApprovalDecided($approval->refresh()));

        return response()->json([
            'data' => (new PosApprovalResource($approval->fresh()?->load(['requestedBy', 'approvedBy'])))->resolve($request),
        ]);
    }

    public function show(PosApproval $approval): PosApprovalResource
    {
        return new PosApprovalResource($approval->load(['requestedBy', 'approvedBy', 'terminal']));
    }

    /**
     * Was this answered at a till, or from somewhere else?
     *
     * Derived from the credential rather than taken from the body, which is the
     * same rule as everywhere else in this module and matters more here than
     * most. `method` used to be a request field: a manager answering from their
     * phone could send `pin`, and the fraud ledger would then say they were
     * standing at the terminal — the one detail an investigation actually leans
     * on, supplied by the party being investigated.
     *
     * A PIN login mints a token that a `TerminalSession` is attached to. If the
     * token answering has one, somebody typed a PIN on a till; if it does not,
     * this is a phone.
     */
    private function answeredFrom(Request $request): string
    {
        $token = $request->user()?->currentAccessToken();
        $tokenId = $token instanceof PersonalAccessToken ? $token->getKey() : null;

        $atATill = $tokenId !== null && TerminalSession::query()
            ->open()
            ->where('access_token_id', $tokenId)
            ->exists();

        return $atATill ? 'pin' : 'remote';
    }
}
