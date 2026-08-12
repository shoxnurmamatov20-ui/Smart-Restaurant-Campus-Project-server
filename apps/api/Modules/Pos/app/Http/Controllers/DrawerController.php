<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Contracts\Finance\TillLedger;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Modules\Pos\Http\Controllers\Concerns\ResolvesTillContext;
use Modules\Pos\Http\Resources\DrawerMovementResource;
use Modules\Pos\Models\DrawerMovement;
use Modules\Pos\Services\DrawerService;
use RuntimeException;

/**
 * Notes going into and out of a drawer between sales.
 *
 * Change coming in, a supplier paid in cash, and above all the collection —
 * the manager taking the evening's takings out mid-service. Each needs a
 * reason, because a cash movement with no reason is the record an investigation
 * cannot use.
 */
final class DrawerController extends Controller
{
    use ResolvesTillContext;

    public function __construct(
        private readonly DrawerService $drawer,
        private readonly TillLedger $till,
    ) {}

    public function index(Request $request): ResourceCollection
    {
        $movements = DrawerMovement::query()
            ->with(['user', 'terminal'])
            ->when($request->filled('cash_shift_id'), fn ($q) => $q->forShift($request->integer('cash_shift_id')))
            ->when($request->filled('terminal_id'), fn ($q) => $q->where('terminal_id', $request->integer('terminal_id')))
            ->when($request->filled('kind'), fn ($q) => $q->where('kind', $request->string('kind')))
            ->orderByDesc('occurred_at')
            ->paginate(min($request->integer('per_page', 50), 100))
            ->withQueryString();

        return DrawerMovementResource::collection($movements);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'kind' => ['required', 'string', Rule::in(DrawerMovement::KINDS)],
            'amount' => ['required', 'integer', 'min:1'],
            'reason' => ['required', 'string', 'min:3', 'max:255'],
            'approval_id' => ['sometimes', 'integer', 'min:1'],
        ]);

        $session = $this->session($request);
        $shiftId = $session->cash_shift_id ?? $this->till->openShiftFor((int) $session->user_id);

        if ($shiftId === null) {
            return response()->json([
                'message' => 'Ochiq smena yo\'q. Avval smenani oching.',
                'code' => 'POS_NO_OPEN_SHIFT',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $movement = $this->drawer->record(
                session: $session,
                cashShiftId: (int) $shiftId,
                kind: (string) $validated['kind'],
                amount: (int) $validated['amount'],
                reason: (string) $validated['reason'],
                approvalId: isset($validated['approval_id']) ? (int) $validated['approval_id'] : null,
            );
        } catch (RuntimeException $failure) {
            return response()->json([
                'message' => $failure->getMessage(),
                'code' => 'POS_DRAWER_REFUSED',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return (new DrawerMovementResource($movement->load('user')))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }
}
