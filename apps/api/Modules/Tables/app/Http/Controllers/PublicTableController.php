<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Controllers;

use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\StopList;
use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillLine;
use App\Contracts\Orders\BillRegistry;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Support\Errors\ApiException;
use App\Support\Orders\GuestBasket;
use App\Support\Orders\OrderChannel;
use App\Support\Tenancy\BranchContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Modules\Tables\Events\GuestCalled;
use Modules\Tables\Http\Requests\PublicTableCallRequest;
use Modules\Tables\Http\Requests\PublicTableOrderRequest;
use Modules\Tables\Http\Requests\PublicTablePayRequest;
use Modules\Tables\Models\RestaurantTable;
use Modules\Tables\Models\WaiterCall;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

/**
 * The four things a guest can do from the QR code stuck to their table.
 *
 * Order food, read the bill so far, ask for a waiter, ask to pay. No login and
 * no account: the credential is the token printed on the sticker, which is a
 * bearer credential in the most literal sense — whoever is sitting at the table
 * can see it, and nobody else can guess it.
 *
 * ---------------------------------------------------------------------------
 * Why the token and not the id
 *
 * `/public/tables/7/order` would be an endpoint where typing `8` puts forty
 * kebabs on the next table's bill, from the car park. The token is 22 random
 * characters, unique across the platform, and minted once when the table is
 * created — see `RestaurantTable::newQrToken()`.
 *
 * ---------------------------------------------------------------------------
 * Why it lives in Tables and not in Orders
 *
 * Everything here starts with "which table is this", and the table, its token
 * and its branch belong to this module. The BILL is Orders' and is reached the
 * way every other module reaches it: `App\Contracts\Orders\BillRegistry`.
 * Nothing below imports an Orders class, which is what lets the guest-facing
 * table endpoints and the bill ledger be reasoned about apart.
 *
 * ---------------------------------------------------------------------------
 * One open bill, joined rather than opened
 *
 * A table with a bill already running gets its lines added to that bill. Opening
 * a second would give a table of four two cheques nobody asked to split, and the
 * waiter would find out at the end of the meal. A table with nothing open gets a
 * bill opened for it — which is the ordinary case for a guest who scanned the
 * code before anyone came over.
 */
final class PublicTableController extends Controller
{
    /**
     * Add food to this table's bill.
     *
     * One transaction: the bill, its lines and the kitchen dockets are written
     * together or not at all. A bill that reached `placed` with no docket is an
     * order the kitchen never heard about, and the guest finds out by waiting.
     */
    public function order(
        PublicTableOrderRequest $request,
        string $table,
        BillRegistry $bills,
        MenuCatalog $menu,
        StopList $stops,
        BranchContext $branches,
    ): JsonResponse {
        $seat = $this->seatOrFail($table);

        /*
         * Checked before the transaction opens, so a guest reading a stale menu
         * is told "Manti hozir mavjud emas" by name rather than being handed a
         * rolled-back order. The customer app's endpoint reads a basket the same
         * way — see App\Support\Orders\GuestBasket.
         */
        $basket = GuestBasket::read($request->validated()['items'], $menu, $stops);

        $default = (int) ($request->input('seat_no') ?? 1);

        /*
         * Branch context, from the table rather than from a header.
         *
         * A guest's phone sends no `X-Branch`; the furniture knows which
         * building it is in. Set before the first write, because
         * `BelongsToBranch` stamps `branch_id` on `creating` — and that is what
         * puts the bill AND the dockets it fires in front of the right kitchen.
         */
        $branches->set($this->branchOf($seat));

        try {
            $bill = DB::transaction(function () use ($bills, $basket, $seat, $default): Bill {
                $bill = $this->openBillFor($bills, $seat);

                foreach ($basket->lines as $line) {
                    try {
                        $bill = $bills->addLine(
                            billId: $bill->id,
                            menuItemId: $line->dish->id,
                            quantity: $line->quantity,
                            note: $line->note,
                            // The guest's own chair, per line where the screen
                            // says so and once for the whole basket otherwise.
                            // Q4 put the seat on the line so splitting at the
                            // end of the meal is arithmetic rather than memory.
                            seatNo: $line->seatNo > 1 ? $line->seatNo : $default,
                            modifierChoiceIds: $line->choiceIds,
                        );
                    } catch (RuntimeException $refusal) {
                        // A stale menu bundle offering a choice the catalogue no
                        // longer allows. Refused rather than dropped: a ticket
                        // that quietly lost "no onion" reaches the pass looking
                        // correct.
                        throw ApiException::of('order.modifier_invalid', field: 'items', meta: [
                            'menu_item_id' => $line->dish->id,
                        ], previous: $refusal);
                    }
                }

                return $bills->send($bill->id);
            });
        } finally {
            // Cleared however this ends: the context was set by hand, so nothing
            // else will, and a php-fpm worker holding it would stamp the next
            // request's rows with this table's branch.
            $branches->clear();
        }

        return response()->json([
            'data' => $this->billPayload($seat, $bill),
        ], Response::HTTP_CREATED);
    }

    /**
     * What is on this table's bill right now.
     *
     * `null` for a table with nothing open, and 200 rather than 404 — a guest
     * who has just sat down and scanned the code has no order yet, and that is
     * an answer rather than an error. A 404 here would have the screen draw
     * "something went wrong" at somebody who has done nothing wrong.
     */
    public function bill(string $table, BillRegistry $bills): JsonResponse
    {
        $seat = $this->seatOrFail($table);
        $open = $bills->openBillsOn((int) $seat->id);

        return response()->json([
            'data' => $open === [] ? null : $this->billPayload($seat, $open[0]),
        ]);
    }

    /**
     * A raised hand.
     *
     * Latched: a guest who taps four times because nobody came has asked once,
     * louder. The existing call comes back with 200 instead of a second row with
     * 201, which is also what the partial unique index in the migration enforces
     * when two taps race each other.
     */
    public function call(PublicTableCallRequest $request, string $table, BranchContext $branches): JsonResponse
    {
        $seat = $this->seatOrFail($table);
        $branches->set($this->branchOf($seat));

        try {
            [$call, $fresh] = $this->raise(
                $seat,
                kind: 'waiter',
                seatNo: $request->input('seat_no'),
                note: $this->trimmedOrNull($request->input('note')),
            );
        } finally {
            $branches->clear();
        }

        return response()->json([
            'data' => $this->callPayload($call, $fresh),
        ], $fresh ? Response::HTTP_CREATED : Response::HTTP_OK);
    }

    /**
     * "We would like to pay."
     *
     * Two things happen and they are deliberately separate. A call is raised, so
     * a person walks over with a terminal — that is the part the guest is
     * actually asking for. And the bill is moved to `topay`, so every screen in
     * the building draws the table as waiting rather than eating.
     *
     * The bill move is best-effort on purpose. `topay` is not reachable from
     * `draft` — a bill nobody has fired has no confirmed lines to present — and
     * the ladder says so by refusing. That refusal must not lose the call: the
     * guest still wants somebody to come over, and a waiter with a bill in front
     * of them can fire it themselves.
     *
     * No money moves here. See `PublicTablePayRequest` for why the tip and the
     * split are a preference rather than columns.
     */
    public function pay(
        PublicTablePayRequest $request,
        string $table,
        BillRegistry $bills,
        BranchContext $branches,
    ): JsonResponse {
        $seat = $this->seatOrFail($table);
        $open = $bills->openBillsOn((int) $seat->id);

        if ($open === []) {
            throw ApiException::of('tables.no_open_bill');
        }

        $bill = $open[0];
        $branches->set($this->branchOf($seat));

        try {
            [$call, $fresh] = $this->raise(
                $seat,
                kind: 'bill',
                seatNo: $request->input('seat_no'),
                note: $this->preference($request),
                orderId: $bill->id,
            );

            /*
             * Forgiving on purpose — see `BillRegistry::awaitPayment()`.
             *
             * A bill the ladder will not move comes back unchanged rather than
             * throwing, because the guest's request is real either way and a
             * waiter is already walking over.
             */
            $bill = $bills->awaitPayment($bill->id);
        } finally {
            $branches->clear();
        }

        return response()->json([
            'data' => [
                'call' => $this->callPayload($call, $fresh),
                'bill' => $this->billPayload($seat, $bill),
            ],
        ], $fresh ? Response::HTTP_CREATED : Response::HTTP_OK);
    }

    // ============ Internals ============

    /**
     * The table a scanned sticker names, or a refusal.
     *
     * Three different failures, one answer. A token that names nothing, a token
     * from another restaurant, and a table that has been retired are all "no
     * such table" — telling them apart would let somebody outside the building
     * work out which codes are real, which is the one thing a printed credential
     * cannot survive.
     */
    private function seatOrFail(string $token): RestaurantTable
    {
        $seat = RestaurantTable::findByQrToken($token);

        if ($seat === null || ! $seat->is_active) {
            throw ApiException::of('request.not_found', field: 'table');
        }

        return $seat;
    }

    /** The venue this piece of furniture stands in, when it names one. */
    private function branchOf(RestaurantTable $seat): ?Branch
    {
        return $seat->branch_id === null
            ? null
            : Branch::query()->whereKey($seat->branch_id)->first();
    }

    /**
     * The bill this table is already running, or a new one.
     *
     * `openBillsOn()` rather than a query, because Tables may not read Orders'
     * tables — and because the contract already answers "newest first", which is
     * the one a guest at an occupied table is joining.
     */
    private function openBillFor(BillRegistry $bills, RestaurantTable $seat): Bill
    {
        $open = $bills->openBillsOn((int) $seat->id);

        if ($open !== []) {
            return $open[0];
        }

        return $bills->open(
            channel: OrderChannel::DineIn->value,
            tableId: (int) $seat->id,
            // Snapshotted: renaming table A-7 next month must not rewrite where
            // tonight's bill was served.
            tableLabel: (string) $seat->label,
            guests: max(1, (int) $seat->seats),
        );
    }

    /**
     * Raise a call, or hand back the one that is already open.
     *
     * @return array{0: WaiterCall, 1: bool} The call, and whether it is new.
     */
    private function raise(
        RestaurantTable $seat,
        string $kind,
        mixed $seatNo,
        ?string $note,
        ?int $orderId = null,
    ): array {
        /** @var WaiterCall|null $existing */
        $existing = WaiterCall::query()
            ->where('restaurant_table_id', $seat->id)
            ->where('kind', $kind)
            ->live()
            ->latest('id')
            ->first();

        if ($existing !== null) {
            /*
             * Not re-broadcast.
             *
             * The floor already has this call on screen; a second frame would
             * buzz a handset for something a waiter has already seen, and a
             * guest tapping impatiently would buzz it every time. The row's
             * `created_at` is what says how long they have been waiting, and it
             * deliberately does not move.
             */
            return [$existing, false];
        }

        $call = WaiterCall::create([
            'restaurant_table_id' => $seat->id,
            'kind' => $kind,
            'status' => 'open',
            'order_id' => $orderId,
            'seat_no' => $seatNo === null ? null : max(1, (int) $seatNo),
            'note' => $note,
        ]);

        // The handsets on this floor, now — see GuestCalled for why it is queued
        // rather than sent inline.
        GuestCalled::dispatch($call->refresh()->load('restaurantTable'));

        return [$call, true];
    }

    // ============ Answers ============

    /**
     * @return array<string, mixed>
     */
    private function billPayload(RestaurantTable $seat, Bill $bill): array
    {
        return [
            'number' => $bill->number,
            'status' => $bill->status,
            'is_open' => $bill->isOpen(),
            'table' => [
                'label' => $seat->label,
                'seats' => (int) $seat->seats,
                'zone' => $seat->hall?->name,
            ],
            'guests_count' => $bill->guestsCount,
            'subtotal' => $bill->subtotal,
            'discount_total' => $bill->discountTotal,
            'service_charge' => $bill->serviceCharge,
            // Named for what it is, so no client renders it as "+ VAT".
            'vat_included' => $bill->vatIncluded,
            'total' => $bill->total,
            'currency' => 'UZS',
            'lines' => array_map(static fn (BillLine $line): array => [
                'id' => $line->id,
                'menu_item_id' => $line->menuItemId,
                'title' => $line->title,
                'quantity' => $line->quantity,
                'unit_price' => $line->unitPrice,
                'total_price' => $line->totalPrice,
                // The LINE's state, not the bill's: a table's starters are
                // served while its mains are still cooking, and one number for
                // the whole cheque cannot say that.
                'status' => $line->status,
                'seat_no' => $line->seatNo,
                'note' => $line->note,
                'modifiers' => array_map(
                    static fn ($modifier): array => $modifier->toArray(),
                    $line->modifiers,
                ),
            ], $bill->lines),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function callPayload(WaiterCall $call, bool $fresh): array
    {
        return [
            'id' => (int) $call->id,
            'kind' => $call->kind,
            'status' => $call->status,
            'seat_no' => $call->seat_no,
            'note' => $call->note,
            'created_at' => $call->created_at?->toIso8601String(),
            /*
             * Says whether this tap raised the call or found one already open.
             *
             * The screen needs the difference: "Ofitsiant chaqirildi" for the
             * first tap and "Allaqachon chaqirilgan" for the fourth, so a guest
             * who is not being served learns that the message got through rather
             * than that nothing happened.
             */
            'already_open' => ! $fresh,
        ];
    }

    /**
     * How the guest said they would like to settle, as one readable line.
     *
     * Written into the call's note rather than into columns — see the request
     * class for why money does not live in this module. The format is stable and
     * language-neutral so a floor screen can parse it if it ever wants to, and
     * legible as-is to a waiter reading it on a handset.
     */
    private function preference(PublicTablePayRequest $request): ?string
    {
        $parts = [];

        if ($request->filled('method')) {
            $parts[] = 'method='.$request->string('method')->value();
        }

        if ($request->filled('tip_percent')) {
            $parts[] = 'tip='.$request->integer('tip_percent').'%';
        }

        if ($request->filled('split_between')) {
            $parts[] = 'split='.$request->integer('split_between');
        }

        $note = $this->trimmedOrNull($request->input('note'));

        if ($note !== null) {
            $parts[] = $note;
        }

        return $parts === [] ? null : implode(' · ', $parts);
    }

    private function trimmedOrNull(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        return trim($value) === '' ? null : trim($value);
    }
}
