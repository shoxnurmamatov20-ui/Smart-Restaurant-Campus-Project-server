<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Kitchen\Http\Requests\StoreKitchenTicketRequest;
use Modules\Kitchen\Http\Requests\UpdateKitchenTicketRequest;
use Modules\Kitchen\Http\Resources\KitchenTicketResource;
use Modules\Kitchen\Models\KitchenTicket;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for kitchen tickets.
 *
 * Mounted under /api/v1/kitchen/tickets and gated by Spatie permission
 * middleware on the route definition (Modules/Kitchen/routes/api.php).
 */
final class KitchenTicketController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        // Eager on the query rather than on the builder chain: one query for
        // the whole board instead of one per card, and the KDS reloads every
        // few seconds with every card naming its waiter.
        $records = QueryBuilder::for(KitchenTicket::query()->with('waiter'))
            ->allowedFilters([
                AllowedFilter::exact('station'),
                AllowedFilter::exact('status'),
                AllowedFilter::exact('order', 'order_id'),
                AllowedFilter::exact('order_number'),
                AllowedFilter::callback('active', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->active();
                    }
                }),
            ])
            ->allowedSorts(['created_at', 'station', 'status'])
            ->defaultSort('created_at')
            ->paginate($perPage)
            ->withQueryString();

        return KitchenTicketResource::collection($records);
    }

    public function store(StoreKitchenTicketRequest $request): KitchenTicketResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = KitchenTicket::create($request->validated())->refresh();

        return new KitchenTicketResource($record);
    }

    public function show(KitchenTicket $ticket): KitchenTicketResource
    {
        return new KitchenTicketResource($ticket);
    }

    public function update(UpdateKitchenTicketRequest $request, KitchenTicket $ticket): KitchenTicketResource
    {
        $ticket->update($request->validated());

        return new KitchenTicketResource($ticket->refresh());
    }

    public function destroy(KitchenTicket $ticket): Response
    {
        $ticket->delete();

        return response()->noContent();
    }

    /**
     * A cook takes the ticket off the rail.
     *
     * Separate from starting it because a kitchen is: the ticket is claimed
     * first and the pan goes on when there is room. It is also the button the
     * plan's acceptance test presses — the waiter's chip turns amber the moment
     * this lands, without their tablet asking anybody.
     */
    public function accept(KitchenTicket $ticket): KitchenTicketResource
    {
        abort_unless($ticket->accept(), 422, "Bu chiptani qabul qilib bo'lmaydi.");

        return new KitchenTicketResource($ticket->refresh());
    }

    public function start(KitchenTicket $ticket): KitchenTicketResource
    {
        abort_unless($ticket->start(), 422, "Bu chiptani boshlab bo'lmaydi.");

        return new KitchenTicketResource($ticket->refresh());
    }

    public function ready(KitchenTicket $ticket): KitchenTicketResource
    {
        abort_unless($ticket->markReady(), 422, "Bu chiptani tayyor deb belgilab bo'lmaydi.");

        return new KitchenTicketResource($ticket->refresh());
    }

    public function serve(KitchenTicket $ticket): KitchenTicketResource
    {
        abort_unless($ticket->markServed(), 422, 'Faqat tayyor chiptani berish mumkin.');

        return new KitchenTicketResource($ticket->refresh());
    }

    public function recall(KitchenTicket $ticket): KitchenTicketResource
    {
        abort_unless($ticket->recall(), 422, "Bu chiptani qaytarib bo'lmaydi.");

        return new KitchenTicketResource($ticket->refresh());
    }

    /**
     * Turn an order into station tickets.
     *
     * One ticket per station, because the grill and the bar work in parallel and
     * a single combined ticket makes both wait for the slower one.
     */
}
