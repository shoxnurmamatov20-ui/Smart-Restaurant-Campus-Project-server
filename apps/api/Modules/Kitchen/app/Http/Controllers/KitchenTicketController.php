<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Kitchen\Http\Requests\StoreKitchenTicketRequest;
use Modules\Kitchen\Http\Requests\UpdateKitchenTicketRequest;
use Modules\Kitchen\Http\Resources\KitchenTicketResource;
use Modules\Kitchen\Models\KitchenStation;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Orders\Models\Order;
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

        $records = QueryBuilder::for(KitchenTicket::class)
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
    public function dispatchOrder(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'order_id' => ['required', 'integer', 'exists:orders,id'],
        ]);

        /** @var Order $order */
        $order = Order::query()->with('items')->findOrFail($validated['order_id']);

        $slaByStation = KitchenStation::query()->pluck('sla_minutes', 'code');
        $created = [];

        foreach ($order->items->groupBy('station') as $station => $lines) {
            $existing = KitchenTicket::query()
                ->where('order_id', $order->id)
                ->where('station', $station)
                ->first();

            $payload = [
                'order_id' => $order->id,
                'order_number' => $order->number,
                'station' => (string) $station,
                'table_label' => $order->table_label,
                'channel' => $order->channel,
                'sla_minutes' => (int) ($slaByStation[$station] ?? 20),
                'lines' => $lines->map(fn ($line): array => [
                    'sku' => $line->sku,
                    'title' => $line->title,
                    'quantity' => $line->quantity,
                    'note' => $line->note,
                ])->values()->all(),
            ];

            // Re-dispatching an edited order updates the ticket in place rather
            // than printing a second one the cook has to reconcile by hand.
            $created[] = $existing
                ? tap($existing)->update($payload)
                : KitchenTicket::create($payload + ['status' => 'new']);
        }

        return response()->json([
            'order_id' => $order->id,
            'tickets' => KitchenTicketResource::collection(collect($created)),
        ], 201);
    }
}
