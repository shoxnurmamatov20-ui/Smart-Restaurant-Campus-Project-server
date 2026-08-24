<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Modules\Finance\Http\Requests\StoreCashShiftRequest;
use Modules\Finance\Http\Requests\UpdateCashShiftRequest;
use Modules\Finance\Http\Resources\CashShiftResource;
use Modules\Finance\Models\CashCount;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Support\CashDenominations;
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

    /**
     * The tills, and how many of them failed their count.
     *
     * `from` / `to` range over `opened_at`, which is the only date this table
     * has: unlike payments and movements, a shift carries no `business_date`
     * column — it IS a trading day's drawer, opened once and closed once. `to`
     * is inclusive of the whole day it names, because comparing a timestamp
     * against a bare date would drop every till opened after midnight on the
     * last day of the window. A plain comparison, never `whereDate()` —
     * ModuleBoundaryTest refuses that by name.
     *
     * `unreconciled` is the console's actual question. The finance screen
     * prints one number — how many drawers disagreed with what the system
     * expected — and counting it from a page of rows would answer it for the
     * first twenty-five shifts of the month.
     */
    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $query = QueryBuilder::for(CashShift::class)
            ->allowedFilters([
                AllowedFilter::exact('number'),
                AllowedFilter::exact('status'),
                AllowedFilter::callback('from', function ($query, $value): void {
                    $query->where('opened_at', '>=', CarbonImmutable::parse($value)->startOfDay());
                }),
                AllowedFilter::callback('to', function ($query, $value): void {
                    $query->where('opened_at', '<', CarbonImmutable::parse($value)->addDay()->startOfDay());
                }),
                /*
                 * A drawer that did not agree with the system.
                 *
                 * Only a CLOSED shift can be short: `difference` is zero until
                 * the count is entered, so an open till would otherwise be
                 * counted as reconciled — a figure that improves every time
                 * somebody opens a new shift.
                 */
                AllowedFilter::callback('unreconciled', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->whereNotNull('closed_at')->where('difference', '<>', 0);
                    }
                }),
            ]);

        // Before the sort: see PaymentController::index() — a clone taken after
        // `paginate()` carries `order by opened_at` into an aggregate, and
        // PostgreSQL refuses it.
        $totals = $this->windowTotals($query);

        $records = $query
            ->allowedSorts(['opened_at', 'number', 'created_at'])
            ->allowedIncludes(['payments', 'expenses'])
            ->defaultSort('-opened_at')
            ->paginate($perPage)
            ->withQueryString();

        return CashShiftResource::collection($records)->additional(['meta' => $totals]);
    }

    /**
     * The window's counting record, over the same filters the page used.
     *
     * @param QueryBuilder<CashShift> $query
     *
     * @return array{closed_count: int, unreconciled_count: int, difference_tiyin: int}
     */
    private function windowTotals(QueryBuilder $query): array
    {
        $row = $query->clone()
            ->toBase()
            ->selectRaw('count(case when closed_at is not null then 1 end)::bigint as closed_count')
            ->selectRaw('count(case when closed_at is not null and difference <> 0 then 1 end)::bigint as off_count')
            // Signed and summed: two tills, one short by 20 000 and one over by
            // the same, is a business that is square and two people who each
            // have something to explain. The count beside it is what says so.
            ->selectRaw('coalesce(sum(case when closed_at is not null then difference else 0 end), 0)::bigint as difference')
            ->first();

        return [
            'closed_count' => (int) ($row->closed_count ?? 0),
            'unreconciled_count' => (int) ($row->off_count ?? 0),
            'difference_tiyin' => (int) ($row->difference ?? 0),
        ];
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

    /**
     * Open the till. Only one session may be open at a time.
     *
     * The count that produces the float can arrive note by note, which is what
     * the tablet's opening screen sends: somebody standing at an open drawer has
     * banknotes in their hand, not a total in their head. When it does, the
     * figure comes from the notes and the breakdown is kept — so the float a
     * whole evening is reconciled against is a count rather than a claim.
     */
    public function open(Request $request): CashShiftResource
    {
        $validated = $request->validate([
            'opening_cash' => ['nullable', 'integer', 'min:0'],
            'denominations' => ['sometimes', 'array'],
            'denominations.*' => ['integer', 'min:0'],
        ]);

        /** @var array<array-key, int|string> $notes */
        $notes = $validated['denominations'] ?? [];

        // `unclosed()`, not `open()`: a till being counted has not finished, and
        // opening a second one beside it puts the next sale in an arbitrary
        // drawer.
        abort_if(
            CashShift::query()->unclosed()->exists(),
            422,
            'Ochiq kassa smenasi allaqachon bor — avval uni yoping.',
        );

        $float = $notes === []
            ? (int) ($validated['opening_cash'] ?? 0)
            : CashDenominations::total($notes);

        if ($notes !== [] && isset($validated['opening_cash']) && (int) $validated['opening_cash'] !== $float) {
            // Both sent and they disagree: one of the two is wrong and picking
            // either would make the whole evening reconcile against a guess.
            throw ApiException::of('finance.count_mismatch', field: 'opening_cash', meta: [
                'opening_cash' => (int) $validated['opening_cash'],
                'from_denominations' => $float,
            ]);
        }

        return DB::transaction(function () use ($request, $float, $notes): CashShiftResource {
            $shift = CashShift::create([
                // Through the shared counter rather than counting rows: two tills
                // opening at the same moment both read the same count and both
                // build the same number, and the second one dies on the unique
                // index with a cashier waiting.
                'number' => CashShift::nextNumber(),
                'opened_by_user_id' => $request->user()?->id,
                'opened_at' => now(),
                'opening_cash' => $float,
                'status' => 'open',
            ]);

            if ($notes !== []) {
                CashCount::record(
                    shift: $shift,
                    kind: 'open',
                    breakdown: $notes,
                    countedByUserId: $request->user()?->id,
                );
            }

            return new CashShiftResource($shift->refresh());
        });
    }
}
