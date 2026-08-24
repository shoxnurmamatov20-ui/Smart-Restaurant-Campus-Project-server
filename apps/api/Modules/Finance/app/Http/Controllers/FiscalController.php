<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Modules\Finance\Http\Resources\FiscalReceiptResource;
use Modules\Finance\Models\FiscalReceipt;
use Modules\Finance\Services\FiscalRegistrar;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * The tax authority, as the people at the till see it.
 *
 * Fiscalisation is deliberately invisible while it works: the document is raised
 * inside the sale's own transaction and filed after it commits, and nothing on
 * the selling path ever waits for soliq.uz. The price of that is that when it
 * stops working, nobody finds out — so these four endpoints exist to make the
 * queue visible to a person rather than only to the scheduler.
 *
 * They answer the four questions a venue actually asks, in the order it asks
 * them: is the fiscal module connected at all, what has not been declared yet,
 * print me that receipt again, and file the backlog now because we have just
 * come back online and the guests have gone home.
 */
final class FiscalController extends Controller
{
    private const MAX_PER_PAGE = 100;

    /** A hand-drained pass, capped so one request cannot hold a worker all night. */
    private const MAX_RELAY = 500;

    public function __construct(private readonly FiscalRegistrar $registrar) {}

    /**
     * Is there a tax authority on the other end of this?
     *
     * The plan asks for two facts and they are different faults with opposite
     * fixes: a module number of at least eight digits, and something answering.
     * A configured number with a dead endpoint is a network problem; an
     * answering endpoint with no number is a form somebody never filled in. So
     * `ready` is both of them and the message says which one failed.
     *
     * The queue figures ride along because this is the screen a manager opens
     * when they suspect something is wrong, and "connected" on its own would be
     * a green light above forty undeclared meals. `expired` is the number that
     * matters: pending will probably clear itself, expired never will.
     */
    public function probe(): JsonResponse
    {
        $probe = $this->registrar->probe();

        return response()->json([
            'data' => $probe->toArray() + [
                'enabled' => (bool) config('finance.fiscal.enabled', false),
                // How long a declaration may be deferred. On the same document
                // as the queue counts, because a backlog of nine is a different
                // evening depending on whether the window is 24 hours or one.
                'window_hours' => (int) config('finance.fiscal.window_hours', 24),
                'queue' => $this->queueSummary(),
            ],
        ]);
    }

    /**
     * What has been declared, and what has not.
     *
     * `?filter[status]=pending` is the one a cashier reaches for — it is the
     * `fiscal_pending` list the Z-report counts — and `?filter[status]=expired`
     * is the one a manager has to act on. Sorted newest first: a queue is read
     * from the end a person is standing at.
     */
    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(FiscalReceipt::class)
            ->allowedFilters([
                AllowedFilter::exact('status'),
                AllowedFilter::exact('kind'),
                AllowedFilter::exact('shift', 'cash_shift_id'),
                AllowedFilter::exact('order', 'order_id'),
                // Everything still on its way, ripe for a retry or not. One
                // filter rather than asking a client to name both `pending` and
                // `sent` — two spellings of "not declared yet" is one of them
                // eventually being forgotten.
                AllowedFilter::scope('outstanding'),
            ])
            ->allowedSorts(['created_at', 'expires_at', 'total', 'attempts'])
            ->allowedIncludes(['cashShift'])
            ->defaultSort('-id')
            ->paginate($perPage)
            ->withQueryString();

        // Beside the page rather than behind a second request: a till showing
        // one page of documents still has to say that four of tonight's meals
        // are undeclared, and it must not have to count them itself.
        return FiscalReceiptResource::collection($records)
            ->additional(['summary' => $this->queueSummary()]);
    }

    public function show(FiscalReceipt $receipt): FiscalReceiptResource
    {
        return new FiscalReceiptResource($receipt->load('cashShift'));
    }

    /**
     * The NUSXA copy — the same declaration on new paper.
     *
     * It files nothing and creates nothing. The marks on the copy are the marks
     * the OFD returned for the original, so the QR a guest scans leads to the
     * one meal that was declared; what the copy adds is a count, and the count
     * is what makes "this receipt was printed four times" answerable.
     *
     * A document with no fiscal sign is refused rather than counted. Copying a
     * receipt that was never accepted would hand a guest a second piece of paper
     * that verifies nothing, stamped as though it did — and the whole reason
     * duplicates are stamped is so that nobody can present one as a sale.
     */
    public function duplicate(FiscalReceipt $receipt): FiscalReceiptResource
    {
        if (! $receipt->is_legal) {
            throw ApiException::of('finance.fiscal_not_registered', field: 'receipt', meta: [
                'status' => $receipt->status,
                'last_error' => $receipt->last_error,
            ]);
        }

        $copy = $this->registrar->duplicate($receipt);

        return (new FiscalReceiptResource($copy))->additional([
            'meta' => [
                // What the paper has to carry, so the print agent does not have
                // to invent the word or the number for itself.
                'stamp' => 'NUSXA',
                'copy_no' => $copy->duplicates_printed,
            ],
        ]);
    }

    /**
     * Drain the queue by hand.
     *
     * `fiscal:relay` already runs every minute, so this is not how documents
     * normally get filed. It is for the evening a venue spends offline and then
     * comes back at half past eleven with forty declarations queued and a
     * manager who wants to see the number reach zero before going home, rather
     * than trusting a scheduler they cannot see.
     *
     * One restaurant's queue and not the node's: this runs inside the caller's
     * tenant, unlike the command, which sweeps every tenant on the box. A button
     * in one venue's console must never file another venue's declarations.
     */
    public function relay(Request $request): JsonResponse
    {
        $limit = min(max(1, $request->integer('limit', 100)), self::MAX_RELAY);

        $result = $this->registrar->relayPending($limit);

        return response()->json([
            'data' => $result + ['queue' => $this->queueSummary()],
        ]);
    }

    /**
     * How much is undeclared, and how long there is left.
     *
     * `expires_soonest_at` is the figure a manager acts on. A backlog of nine is
     * not urgent at eight in the evening and is very urgent at four in the
     * morning, and the count alone cannot tell the two apart.
     *
     * @return array<string, mixed>
     */
    private function queueSummary(): array
    {
        $outstanding = FiscalReceipt::query()->outstanding();

        /** @var FiscalReceipt|null $soonest */
        $soonest = (clone $outstanding)
            ->whereNotNull('expires_at')
            ->orderBy('expires_at')
            ->first();

        return [
            'pending' => (clone $outstanding)->count(),
            'pending_total' => (int) (clone $outstanding)->sum('total'),
            // Read off the model rather than with min(), so the cast turns it
            // into the same ISO string every other timestamp in this API is.
            'expires_soonest_at' => $soonest?->expires_at?->toIso8601String(),
            // Terminal, and the only fiscal fact somebody genuinely has to act
            // on: the window closed on a meal that was sold and never declared,
            // and no amount of waiting fixes it — it needs a correction.
            'expired' => FiscalReceipt::query()->where('status', 'expired')->count(),
            'expired_total' => (int) FiscalReceipt::query()->where('status', 'expired')->sum('total'),
        ];
    }
}
