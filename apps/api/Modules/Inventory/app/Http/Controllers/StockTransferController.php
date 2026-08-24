<?php

declare(strict_types=1);

namespace Modules\Inventory\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Support\Facades\DB;
use Modules\Inventory\Http\Requests\StoreStockTransferRequest;
use Modules\Inventory\Http\Resources\StockTransferResource;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\StockTransfer;

/**
 * Stock moving between two of a restaurant's own venues.
 *
 * The endpoint the operations screen has been drawn against since it was built,
 * and the one its own comment said could not exist: with one tenant-wide
 * balance, posting `-25 kg` and `+25 kg` netted to zero on the same row, so the
 * ledger recorded a transfer and the shelf was unchanged. `stock_levels` is
 * what made it postable, and every leg here goes through `Ingredient::move()`
 * with a branch, so the audit line and the venue's shelf move together.
 *
 * Three verbs, because a transfer is three moments: written, dispatched,
 * arrived. Nothing collapses `send` into `receive` — the gap between them is
 * the van, and stock inside it belongs to neither shelf. That is exactly what
 * the `delivered` chip on the screen is for.
 */
final class StockTransferController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function __construct(
        private readonly TenantContext $tenants,
        private readonly BranchContext $branches,
    ) {}

    /**
     * What has moved, and what is still in a van.
     *
     * Scoped to the venue in `X-Branch` when there is one, and it has to be
     * `touching()` rather than a plain column filter: Termiz needs to see what
     * Chilonzor sent it, and a global scope on one `branch_id` would have shown
     * a venue only what it sent and never what is arriving.
     */
    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);
        $branchId = $this->branches->id();

        $query = StockTransfer::query()
            ->with(['lines.ingredient', 'fromBranch', 'toBranch'])
            ->when($branchId !== null, fn ($inner) => $inner->touching((int) $branchId))
            ->when(
                $request->filled('status'),
                fn ($inner) => $inner->where('status', $request->string('status')->value()),
            )
            ->latest('id');

        return StockTransferResource::collection($query->paginate($perPage)->withQueryString());
    }

    public function show(StockTransfer $transfer): StockTransferResource
    {
        return new StockTransferResource($transfer->load(['lines.ingredient', 'fromBranch', 'toBranch']));
    }

    /**
     * Write the transfer and, unless asked not to, send it.
     *
     * The whole van in one call for the same reason a count sheet is one call:
     * a request that lost the network halfway through would leave one venue
     * short of three products and the other expecting five, and nobody would be
     * able to tell which three.
     *
     * `unit_cost_tiyin` is frozen from the ingredient as the line is written,
     * not read at display time. What one venue charged another in August must
     * not be restated by November's price.
     */
    public function store(StoreStockTransferRequest $request): StockTransferResource
    {
        $data = $request->validated();
        /** @var array<int, array{ingredient_id: int, quantity: int}> $lines */
        $lines = $data['lines'];

        $ingredients = Ingredient::query()
            ->whereIn('id', array_column($lines, 'ingredient_id'))
            ->get()
            ->keyBy('id');

        foreach ($lines as $line) {
            /** @var Ingredient|null $ingredient */
            $ingredient = $ingredients->get($line['ingredient_id']);

            // An id this restaurant does not have. Refused rather than skipped:
            // a transfer is a list somebody wrote down, and silently dropping a
            // line from it is how a venue waits all afternoon for rice that was
            // never sent.
            if ($ingredient === null) {
                throw ApiException::of('request.validation_failed', field: 'lines');
            }
        }

        $transfer = DB::transaction(function () use ($data, $lines, $ingredients, $request): StockTransfer {
            $transfer = StockTransfer::query()->create([
                'tenant_id' => $this->tenants->id(),
                // Taken last, next to the write it numbers: the counter's row
                // lock is held until this transaction commits. See BranchCounters.
                'number' => StockTransfer::nextNumber(),
                'from_branch_id' => $data['from_branch_id'],
                'to_branch_id' => $data['to_branch_id'],
                'status' => 'draft',
                'note' => $data['note'] ?? null,
                'created_by' => $request->user()?->getAuthIdentifier(),
            ]);

            foreach ($lines as $line) {
                /** @var Ingredient $ingredient */
                $ingredient = $ingredients->get($line['ingredient_id']);

                $transfer->lines()->create([
                    'tenant_id' => $this->tenants->id(),
                    'ingredient_id' => $ingredient->id,
                    'quantity' => $line['quantity'],
                    'unit_cost_tiyin' => $ingredient->cost_per_unit,
                ]);
            }

            if ($data['send'] ?? true) {
                $transfer->load('lines.ingredient')->send();
            }

            return $transfer;
        });

        return new StockTransferResource(
            $transfer->refresh()->load(['lines.ingredient', 'fromBranch', 'toBranch']),
        );
    }

    /** A draft leaves the building. */
    public function send(StockTransfer $transfer): StockTransferResource
    {
        if ($transfer->status !== 'draft') {
            throw ApiException::of('stock.transfer_not_pending');
        }

        $transfer->load('lines.ingredient')->send();

        return new StockTransferResource(
            $transfer->refresh()->load(['lines.ingredient', 'fromBranch', 'toBranch']),
        );
    }

    /**
     * The boxes were counted at the far end.
     *
     * Refused for anything but `sent`, and that refusal is the whole reason the
     * status exists: receiving twice would raise the destination's shelf twice
     * off one van, and a stock-take three weeks later is where anybody would
     * find out — the same argument `Receiving::confirm()` makes for a delivery.
     */
    public function receive(StockTransfer $transfer): StockTransferResource
    {
        if ($transfer->status !== 'sent') {
            throw ApiException::of('stock.transfer_not_in_transit');
        }

        $transfer->load('lines.ingredient')->receive();

        return new StockTransferResource(
            $transfer->refresh()->load(['lines.ingredient', 'fromBranch', 'toBranch']),
        );
    }
}
