<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Tenancy\BranchContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Kitchen\Http\Requests\StorePrinterRequest;
use Modules\Kitchen\Http\Requests\UpdatePrinterRequest;
use Modules\Kitchen\Http\Resources\PrinterResource;
use Modules\Kitchen\Models\Printer;
use Modules\Kitchen\Printing\EloquentPrintSpooler;
use Modules\Kitchen\Printing\PrintQueue;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * The hardware register, and the one endpoint a till polls all service.
 *
 * Mounted under /api/v1/kitchen/printers.
 */
final class PrinterController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Printer::class)
            ->allowedFilters([
                AllowedFilter::exact('role'),
                AllowedFilter::exact('is_active'),
                AllowedFilter::exact('branch_id'),
            ])
            ->allowedSorts(['code', 'role', 'created_at'])
            ->defaultSort('code')
            ->paginate($perPage)
            ->withQueryString();

        return PrinterResource::collection($records);
    }

    /**
     * Is anything printing — the question the status strip asks.
     *
     * The whole reason P8 exists in the plan is its acceptance test: when a
     * printer dies, the waiter finds out **from the status strip and not from
     * the kitchen**. Two minutes of a cook wondering why no dockets have come
     * out, then walking to the pass to say so, is the failure this replaces.
     *
     * Answered for one venue rather than the whole estate. A waiter cares about
     * the printer in the room they are standing in, and a chain's owner reading
     * across forty branches would get a strip that is permanently amber because
     * one printer somewhere is always out of paper.
     */
    public function health(Request $request, PrintQueue $queue): JsonResponse
    {
        $branchId = $request->integer('branch_id') ?: app(BranchContext::class)->id();

        return response()->json($queue->health($branchId));
    }

    public function store(StorePrinterRequest $request): PrinterResource
    {
        return new PrinterResource(Printer::create($request->validated())->refresh());
    }

    public function show(Printer $printer): PrinterResource
    {
        return new PrinterResource($printer);
    }

    public function update(UpdatePrinterRequest $request, Printer $printer): PrinterResource
    {
        $printer->update($request->validated());

        return new PrinterResource($printer->refresh());
    }

    public function destroy(Printer $printer): Response
    {
        // Soft deleted. Queue rows point at it, and an accountant asking why a
        // receipt never printed six weeks ago needs the device to still have a
        // name.
        $printer->delete();

        return response()->noContent();
    }

    /**
     * Print a page that proves the wiring.
     *
     * Deliberately full of `oʻ`, `gʻ` and Cyrillic: if the codepage is wrong
     * this is where it shows, rather than on a guest's receipt during service.
     */
    public function test(Printer $printer, EloquentPrintSpooler $spooler): JsonResponse
    {
        return response()->json($spooler->selfTest($printer)->toArray(), 202);
    }

    /**
     * The agent saying it is still there.
     *
     * Does not clear a failure — only a job that actually printed does that. An
     * agent whose printer is jammed keeps heartbeating perfectly happily, and a
     * strip that went green on this would clear the warning while the paper was
     * still stuck.
     */
    public function heartbeat(Printer $printer): JsonResponse
    {
        $printer->heardFrom();

        return response()->json(['state' => $printer->refresh()->state]);
    }
}
