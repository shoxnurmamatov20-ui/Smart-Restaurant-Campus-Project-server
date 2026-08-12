<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Contracts\Finance\TillLedger;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Modules\Pos\Http\Controllers\Concerns\ResolvesTillContext;
use Modules\Pos\Services\DrawerService;
use RuntimeException;

/**
 * Opening the drawer at the start of a service and counting it at the end.
 *
 * The X-report and the Z-report are the same figures; the difference is that
 * one of them closes the shift. Both derive the expected cash on the server —
 * the client only ever contributes the number a human counted, which is the
 * entire point of counting.
 */
final class ShiftController extends Controller
{
    use ResolvesTillContext;

    public function __construct(
        private readonly TillLedger $till,
        private readonly DrawerService $drawer,
    ) {}

    public function open(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'opening_cash' => ['sometimes', 'integer', 'min:0'],
        ]);

        $session = $this->session($request);
        $openingCash = (int) ($validated['opening_cash'] ?? 0);

        try {
            $shiftId = $this->till->openShift((int) $session->user_id, $openingCash);
        } catch (RuntimeException $failure) {
            return $this->refused($failure);
        }

        // The session carries the shift so every later sale lands in the right
        // drawer without the client having to say which one.
        $session->forceFill(['cash_shift_id' => $shiftId])->save();

        if ($openingCash > 0) {
            $this->drawer->record($session, $shiftId, 'opening_float', $openingCash, 'Smena boshlanishi');
        }

        return response()->json([
            'data' => $this->till->shiftTotals($shiftId)->toArray()
                + ['drawer' => $this->drawer->summaryFor($shiftId)],
        ], Response::HTTP_CREATED);
    }

    /** X-report: where the shift stands, without ending it. */
    public function current(Request $request): JsonResponse
    {
        $shiftId = $this->shiftId($request);

        if ($shiftId === null) {
            return $this->noOpenShift();
        }

        return response()->json([
            'data' => $this->till->shiftTotals($shiftId)->toArray()
                + ['drawer' => $this->drawer->summaryFor($shiftId)],
        ]);
    }

    /** Z-report: count the drawer, close the shift, end the session. */
    public function close(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'counted_cash' => ['required', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $session = $this->session($request);
        $shiftId = $this->shiftId($request);

        if ($shiftId === null) {
            return $this->noOpenShift();
        }

        try {
            $totals = $this->till->closeShift(
                $shiftId,
                (int) $validated['counted_cash'],
                $validated['note'] ?? null,
            );
        } catch (RuntimeException $failure) {
            return $this->refused($failure);
        }

        $drawer = $this->drawer->summaryFor($shiftId);

        // Counting the money ends the person's turn at the till as well as the
        // shift — leaving a session open over a counted drawer is how the next
        // sale lands in a closed one.
        $session->close('shift_close');

        return response()->json(['data' => $totals->toArray() + ['drawer' => $drawer]]);
    }

    private function shiftId(Request $request): ?int
    {
        $session = $this->session($request);

        return $session->cash_shift_id
            ?? $this->till->openShiftFor((int) $session->user_id);
    }

    private function noOpenShift(): JsonResponse
    {
        return response()->json([
            'message' => 'Ochiq smena yo\'q. Avval smenani oching.',
            'code' => 'POS_NO_OPEN_SHIFT',
        ], Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    private function refused(RuntimeException $failure): JsonResponse
    {
        return response()->json([
            'message' => $failure->getMessage(),
            'code' => 'POS_SHIFT_REFUSED',
        ], Response::HTTP_UNPROCESSABLE_ENTITY);
    }
}
