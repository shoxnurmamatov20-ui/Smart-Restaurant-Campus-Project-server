<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Finance\Http\Requests\StoreCashShiftRequest;
use Modules\Finance\Http\Requests\UpdateCashShiftRequest;
use Modules\Finance\Http\Resources\CashShiftResource;
use Modules\Finance\Models\CashShift;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for cash shifts.
 *
 * Mounted under /api/v1/finance/shifts and gated by Spatie permission
 * middleware on the route definition (Modules/Finance/routes/api.php).
 */
final class CashShiftController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(CashShift::class)
            ->allowedFilters([
                AllowedFilter::exact('number'),
                AllowedFilter::exact('status'),
            ])
            ->allowedSorts(['opened_at', 'number', 'created_at'])
            ->allowedIncludes(['payments', 'expenses'])
            ->defaultSort('-opened_at')
            ->paginate($perPage)
            ->withQueryString();

        return CashShiftResource::collection($records);
    }

    public function store(StoreCashShiftRequest $request): CashShiftResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = CashShift::create($request->validated())->refresh();

        return new CashShiftResource($record->load('payments'));
    }

    public function show(CashShift $shift): CashShiftResource
    {
        return new CashShiftResource($shift->load('payments'));
    }

    public function update(UpdateCashShiftRequest $request, CashShift $shift): CashShiftResource
    {
        $shift->update($request->validated());

        return new CashShiftResource($shift->refresh()->load('payments'));
    }

    public function destroy(CashShift $shift): Response
    {
        $shift->delete();

        return response()->noContent();
    }

    /** Open the till. Only one session may be open at a time. */
    public function open(Request $request): CashShiftResource
    {
        $validated = $request->validate([
            'opening_cash' => ['nullable', 'integer', 'min:0'],
        ]);

        abort_if(
            CashShift::query()->open()->exists(),
            422,
            'Ochiq kassa smenasi allaqachon bor — avval uni yoping.',
        );

        $shift = CashShift::create([
            'number' => 'Z-'.str_pad((string) (CashShift::withTrashed()->count() + 1), 4, '0', STR_PAD_LEFT),
            'opened_by_user_id' => $request->user()?->id,
            'opened_at' => now(),
            'opening_cash' => (int) ($validated['opening_cash'] ?? 0),
            'status' => 'open',
        ]);

        return new CashShiftResource($shift->refresh());
    }

    /** Z-report: count the drawer and close. */
    public function close(Request $request, CashShift $shift): CashShiftResource
    {
        $validated = $request->validate([
            'counted_cash' => ['required', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        abort_unless(
            $shift->close((int) $validated['counted_cash'], $validated['note'] ?? null),
            422,
            'Bu smena allaqachon yopilgan.',
        );

        return new CashShiftResource($shift->refresh());
    }
}
