<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Errors\ErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Modules\Pos\Http\Controllers\Concerns\ResolvesTillContext;
use Modules\Pos\Http\Resources\PosApprovalResource;
use Modules\Pos\Models\PosApproval;
use Modules\Pos\Services\ApprovalGate;
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

    public function __construct(private readonly ApprovalGate $gate) {}

    public function index(Request $request): ResourceCollection
    {
        $approvals = PosApproval::query()
            ->with(['requestedBy', 'approvedBy', 'terminal'])
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
            'subject_type' => ['nullable', 'string', Rule::in(['bill', 'line', 'payment', 'drawer'])],
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
            'method' => ['sometimes', 'string', Rule::in(['pin', 'remote'])],
        ]);

        $manager = $this->actor($request);

        // The person who asked can never be the person who agrees. Without this
        // line the whole table is decoration.
        if ((int) $approval->requested_by_user_id === (int) $manager->getKey()) {
            return ErrorResponse::code('pos.approval_self');
        }

        if (! $approval->decide($manager, (bool) $validated['approved'], (string) ($validated['method'] ?? 'pin'))) {
            return ErrorResponse::code('pos.approval_closed');
        }

        return response()->json([
            'data' => (new PosApprovalResource($approval->fresh()?->load(['requestedBy', 'approvedBy'])))->resolve($request),
        ]);
    }

    public function show(PosApproval $approval): PosApprovalResource
    {
        return new PosApprovalResource($approval->load(['requestedBy', 'approvedBy', 'terminal']));
    }
}
