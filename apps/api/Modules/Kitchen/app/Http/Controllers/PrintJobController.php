<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Tenancy\BranchContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Modules\Kitchen\Http\Resources\PrintJobResource;
use Modules\Kitchen\Models\PrintJob;
use Modules\Kitchen\Printing\Document;
use Modules\Kitchen\Printing\EscPos;
use Modules\Kitchen\Printing\PrintQueue;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * The spool, from both ends.
 *
 * `index` is for a person — the console screen that answers "what is stuck".
 * `claim`, `printed` and `failed` are the local agent's protocol and are not
 * REST: they hand out work with a deadline and take answers back. See
 * `Modules/Kitchen/docs/print-agent-design.md` for the loop they belong to.
 */
final class PrintJobController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(PrintJob::class)
            ->allowedFilters([
                AllowedFilter::exact('status'),
                AllowedFilter::exact('kind'),
                AllowedFilter::exact('printer_id'),
                AllowedFilter::exact('branch_id'),
            ])
            ->allowedSorts(['created_at', 'available_at', 'attempts'])
            // Newest first: this screen is opened because something is wrong
            // right now, and what is wrong right now is at the top.
            ->defaultSort('-id')
            ->paginate($perPage)
            ->withQueryString();

        return PrintJobResource::collection($records);
    }

    /**
     * The agent asks for work.
     *
     * Returns the rendered bytes alongside the document, so the agent is a pipe
     * and not a renderer: every decision about wrapping, codepages and cut
     * commands stays on the server where it can be tested and changed without
     * touching software installed on a hundred counters. The document travels
     * too, because an agent that logs what it printed in a form a human can read
     * is worth the few hundred bytes.
     */
    public function claim(Request $request, PrintQueue $queue, EscPos $escpos): JsonResponse
    {
        $validated = $request->validate([
            // Named by the agent rather than taken from a header: an agent
            // serves the venue it is installed in, forever, and a misrouted
            // header would print one restaurant's orders in another's kitchen.
            'branch_id' => ['nullable', 'integer'],
            'agent' => ['required', 'string', 'max:64'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $branchId = $validated['branch_id'] ?? app(BranchContext::class)->id();
        $jobs = $queue->claim($branchId, $validated['agent'], $validated['limit'] ?? null);

        return response()->json([
            'jobs' => $jobs->map(function (PrintJob $job) use ($escpos): array {
                $document = Document::fromArray($job->document);
                $printer = $job->printer;

                return [
                    'id' => (int) $job->id,
                    'kind' => $job->kind,
                    'reference' => $job->reference,
                    'title' => $job->title,
                    'copies' => (int) $job->copies,
                    'attempts' => (int) $job->attempts,
                    'printer' => [
                        'id' => (int) $printer->id,
                        'code' => $printer->code,
                        'connection' => $printer->connection,
                        'target' => $printer->target,
                    ],
                    'document' => $document->toArray(),
                    // Base64 because this is a JSON body carrying bytes that are
                    // not text: ESC/POS is full of control characters and a
                    // single-byte codepage that is not UTF-8, so the payload
                    // would not survive being encoded as a JSON string.
                    'escpos' => base64_encode(
                        $escpos->render($document, $printer->codepage, $printer->columns),
                    ),
                ];
            })->all(),
        ]);
    }

    /** It came out. */
    public function printed(PrintJob $job, PrintQueue $queue): JsonResponse
    {
        $queue->acknowledge($job);

        return response()->json(new PrintJobResource($job->refresh()));
    }

    /** It did not. The row survives and the queue tries again. */
    public function failed(Request $request, PrintJob $job, PrintQueue $queue): JsonResponse
    {
        $validated = $request->validate([
            'error' => ['required', 'string', 'max:255'],
        ]);

        $queue->reject($job, $validated['error']);

        return response()->json(new PrintJobResource($job->refresh()));
    }

    /**
     * A human says try again.
     *
     * The only way out of `failed`. A job that has exhausted its attempts stays
     * put on purpose — it is the record of what did not print tonight — and
     * somebody who has changed the roll or the cable is the only one who knows
     * that retrying is worth it.
     */
    public function retry(PrintJob $job): JsonResponse
    {
        $job->requeue();

        return response()->json(new PrintJobResource($job->refresh()));
    }
}
