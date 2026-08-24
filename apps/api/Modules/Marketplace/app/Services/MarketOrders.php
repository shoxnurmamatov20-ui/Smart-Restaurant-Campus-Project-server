<?php

declare(strict_types=1);

namespace Modules\Marketplace\Services;

use App\Contracts\Orders\BillRegistry;
use App\Support\Errors\ApiException;
use Illuminate\Support\Facades\DB;
use Modules\Marketplace\Models\Consumer;
use Modules\Marketplace\Models\DeliveryZone;
use Modules\Marketplace\Models\MarketOrder;
use Modules\Marketplace\Models\MarketOrderLine;
use Modules\Marketplace\Models\Promotion;
use Modules\Marketplace\Models\Store;
use Modules\Marketplace\Support\MarketOrderState;
use RuntimeException;

/**
 * Placing a marketplace order, and moving it along the ladder.
 *
 * The whole of the module's write side, in one class, because every one of
 * these operations spans two modules and a transaction and none of them is safe
 * half-done.
 *
 * ---------------------------------------------------------------------------
 * The price is the server's, always
 *
 * The basket arrives as dish ids and quantities and nothing else. Not a price,
 * not a subtotal, not a total. This is the same rule `PublicOrderController`
 * follows for a restaurant's own guests and it matters more here: a marketplace
 * client is a web page a stranger can edit, and a client that names its own
 * price is a client that can eat for nothing.
 *
 * The promo code is treated the same way — the code is a string, the discount
 * is read from `marketplace.promotions`, and a code with no budget left is
 * refused rather than honoured.
 *
 * ---------------------------------------------------------------------------
 * When the restaurant hears about it
 *
 * Not when the guest presses the button — when the merchant ACCEPTS. Until then
 * the order exists on the marketplace only, and that is the ninety seconds the
 * merchant panel counts down. Opening a bill and firing a kitchen ticket for an
 * order the restaurant has not agreed to would put food on a pass for a table
 * that does not exist and takings in a Z-report for a sale that never happened.
 *
 * At acceptance three things happen inside one transaction: a bill is opened in
 * Orders on the `aggregator` channel, its lines are added at the market price,
 * and `send()` fires it — which is what writes the kitchen dockets, through
 * `TicketWriter`, inside the registry's own transaction. One transaction means
 * both or neither; a bill that reached the kitchen without dockets is an order
 * nobody heard about, and it has happened on this platform before.
 *
 * ---------------------------------------------------------------------------
 * `aggregator`, and why not a channel of its own
 *
 * From the restaurant's ledger a MyPOS order IS an aggregator order. Somebody
 * else's platform took it, somebody else's courier carries it, no table is
 * occupied, the 10% service charge does not apply, and the delivery fee belongs
 * to the platform rather than the till — `OrderChannel::Aggregator` documents
 * every one of those properties already, including the last one in as many
 * words. A fifth channel would have to re-state all of it and would change the
 * shared state ladder, `OrderStateLadderTest` and `packages/i18n` along with it.
 *
 * ---------------------------------------------------------------------------
 * No money moves through the till
 *
 * The guest paid the marketplace. The restaurant is paid weekly, through
 * `marketplace.settlements`. A `TillLedger` tender here would count the same
 * meal twice — once in a drawer that never opened, once in the payout — and the
 * cashier closing the day would be short by exactly the delivery takings.
 */
final readonly class MarketOrders
{
    public function __construct(
        private StorefrontDirectory $storefronts,
        private StoreCatalogue $catalogue,
        private BillRegistry $bills,
        private DeliveryReach $reach,
    ) {}

    /**
     * Take an order.
     *
     * @param  array<int, array{menu_item_id: int, quantity: int, note?: string|null}>  $basket
     * @param  array{address: string, address_note?: string|null, pay_rail?: string, promo_code?: string|null, client_reference?: string|null, latitude_e6?: int|null, longitude_e6?: int|null}  $details
     */
    public function place(Consumer $consumer, Store $store, array $basket, array $details): MarketOrder
    {
        /*
         * The replay check comes first and it comes OUTSIDE the store's
         * tenancy, because a consumer's own orders cross tenants and the
         * reference is theirs rather than the restaurant's. A second POST with
         * the same reference gets the first order back — see the migration for
         * why this index does the job `Idempotency-Key` cannot here.
         */
        $reference = $details['client_reference'] ?? null;

        if ($reference !== null) {
            $existing = $this->storefronts->orderByReference($consumer->id, $reference);

            if ($existing instanceof MarketOrder) {
                return $existing;
            }
        }

        if (! $store->is_open) {
            throw ApiException::of('marketplace.store_closed');
        }

        return $this->storefronts->asStore($store, function () use ($consumer, $store, $basket, $details, $reference): MarketOrder {
            $priced = [];
            $subtotal = 0;

            foreach ($basket as $line) {
                $found = $this->catalogue->priceFor($store, (int) $line['menu_item_id']);

                if ($found === null) {
                    // Named, because "something in your basket is unavailable"
                    // makes a guest empty the whole thing and start again.
                    throw ApiException::of('marketplace.dish_unavailable', field: 'lines', meta: [
                        'menu_item_id' => (int) $line['menu_item_id'],
                    ]);
                }

                $quantity = max(1, (int) $line['quantity']);
                $lineTotal = $found['price'] * $quantity;
                $subtotal += $lineTotal;

                $priced[] = [
                    'menu_item_id' => (int) $line['menu_item_id'],
                    'name' => ['uz' => $found['dish']->title, 'ru' => $found['dish']->title, 'en' => $found['dish']->title],
                    'unit_price_tiyin' => $found['price'],
                    'quantity' => $quantity,
                    'line_total_tiyin' => $lineTotal,
                    'note' => $line['note'] ?? null,
                ];
            }

            if ($priced === []) {
                throw ApiException::of('marketplace.basket_empty', field: 'lines');
            }

            /*
             * Will anybody actually ride there.
             *
             * Enforced here and answered EARLY by the client from the same
             * zones — `GET /mp/stores/{store}` publishes them and
             * `packages/surfaces/src/mp/geo.ts` holds the same arithmetic. Both
             * halves exist because a rule that lived only on the client is a
             * rule a page a stranger can edit gets to decide, and one that
             * lived only here is a refusal that arrives after twenty minutes of
             * shopping.
             *
             * `unknown` is allowed through and is NOT the same as `outside`. An
             * address with no coordinates — every one saved before the app
             * could ask for a fix — is not outside the zone; nobody knows, and
             * refusing it loses an order that would have been fine.
             */
            $reach = $this->reach->reachOf(
                $store,
                $details['latitude_e6'] ?? null,
                $details['longitude_e6'] ?? null,
            );

            if ($reach['status'] === 'outside') {
                throw ApiException::of('marketplace.outside_delivery_zone', field: 'address', meta: [
                    'metres' => $reach['metres'],
                ]);
            }

            /*
             * The minimum basket, from the zone when it names one.
             *
             * A ring three kilometres out costs more to serve than the block
             * outside the door, so a storefront may ask for a bigger basket
             * there. Null falls back to the shop's own figure, which is what
             * every storefront starts with.
             */
            $zone = $reach['zone'];

            $minimum = $zone instanceof DeliveryZone && $zone->min_order_tiyin !== null
                ? $zone->min_order_tiyin
                : $store->min_order_tiyin;

            if ($subtotal < $minimum) {
                throw ApiException::of('marketplace.below_minimum', meta: [
                    'minimum_tiyin' => $minimum,
                    'subtotal_tiyin' => $subtotal,
                ]);
            }

            $promotion = $this->promotionFor($store, $details['promo_code'] ?? null);

            /*
             * Delivery is free for a Plus subscriber, and that is the entire
             * subscription — `PLUS_ROWS` says "Bepul · har qanday summada", with
             * no basket minimum attached. Read from the account rather than
             * accepted from the client, because a boolean in a request body is
             * a free delivery anybody can claim.
             */
            // The zone's own fee when it sets one, the shop's otherwise.
            $zoneFee = $zone instanceof DeliveryZone && $zone->fee_tiyin !== null
                ? $zone->fee_tiyin
                : $store->delivery_fee_tiyin;

            $deliveryFee = $consumer->hasPlus() ? 0 : $zoneFee;

            $totals = MarketPricing::of(
                subtotal: $subtotal,
                discount: $promotion instanceof Promotion ? $promotion->discount_tiyin : 0,
                deliveryFee: $deliveryFee,
                servicePercent: MarketOrder::DEFAULT_SERVICE_PERCENT,
                commissionPercent: $store->commission_percent,
            );

            $cookMinutes = $this->catalogue->prepMinutes(array_column($priced, 'menu_item_id'));

            return DB::transaction(function () use (
                $consumer, $store, $priced, $details, $reference, $totals, $promotion, $cookMinutes
            ): MarketOrder {
                $order = MarketOrder::create([
                    'number' => MarketOrder::nextNumber(),
                    'consumer_id' => $consumer->id,
                    'store_id' => $store->id,
                    'branch_id' => $store->branch_id,
                    'client_reference' => $reference,
                    'state' => MarketOrderState::Placed->value,
                    'promo_code' => $promotion?->code,
                    'pay_rail' => $details['pay_rail'] ?? 'cash',
                    'address' => $details['address'],
                    'address_note' => $details['address_note'] ?? null,
                    'latitude_e6' => $details['latitude_e6'] ?? null,
                    'longitude_e6' => $details['longitude_e6'] ?? null,
                    // The kitchen plus the road. Quoted from the store's own
                    // window rather than a platform average: a shop four
                    // kilometres out is honest about it on its own card.
                    'eta_minutes' => $cookMinutes + $store->minutes_to,
                    'placed_at' => now(),
                    ...$totals->toArray(),
                ]);

                foreach ($priced as $line) {
                    $order->lines()->create($line);
                }

                if ($promotion instanceof Promotion) {
                    // Spent as it is used, not derived from the orders that used
                    // it — a budget that moves when an old order is refunded is
                    // a budget nobody can plan against.
                    $promotion->increment('spent_tiyin', $totals->discount);
                }

                /*
                 * Loaded inside the window, not by the caller afterwards.
                 *
                 * Once `asStore()` returns, the connection is back where it was
                 * — fail-closed for a consumer request — and a lazy load reads
                 * nothing. Not an error: an empty `lines` array and a null
                 * store, in a 201 that says the order was placed.
                 */
                return $order->load(['lines', 'store']);
            });
        });
    }

    /**
     * A longer wait, promised to the guest who is watching the clock.
     *
     * Not a rung. Nothing about the order has moved — it was cooking before and
     * it is cooking now — so `canBecome()` has nothing to say about it and
     * asking would refuse the write for being a move to where the order already
     * is. What changes is `eta_minutes`, which is the only number the tracking
     * screen counts down from.
     *
     * Refused once the food has left: the merchant no longer owns the estimate
     * at that point, the courier does, and a kitchen quietly adding ten minutes
     * to a delivery already on a bicycle would move a promise nobody there can
     * keep.
     */
    public function reviseEta(MarketOrder $order, int $minutes): MarketOrder
    {
        if (! in_array($order->state, [
            MarketOrderState::Accepted->value,
            MarketOrderState::Cooking->value,
            MarketOrderState::Ready->value,
        ], true)) {
            throw ApiException::of('marketplace.invalid_transition', field: 'eta_minutes', meta: [
                'from' => $order->state,
                'to' => $order->state,
            ]);
        }

        $store = $order->store;

        if ($store === null) {
            throw new RuntimeException("Buyurtma #{$order->number} hech qaysi do'konga tegishli emas.");
        }

        return $this->storefronts->asStore($store, static function () use ($order, $minutes): MarketOrder {
            $order->forceFill(['eta_minutes' => $minutes])->save();

            return $order;
        });
    }

    /**
     * Move an order one rung, doing whatever that rung means.
     *
     * The ladder itself is `MarketOrderState::canBecome()`; this adds the side
     * effects, and they are what make each move more than a column update.
     *
     * @param  array{reason?: string|null, courier_id?: int|null}  $context
     */
    public function advance(MarketOrder $order, MarketOrderState $target, array $context = []): MarketOrder
    {
        $from = $order->state();

        if (! $from->canBecome($target)) {
            throw ApiException::of('marketplace.invalid_transition', meta: [
                'from' => $from->value,
                'to' => $target->value,
            ]);
        }

        $store = $order->store;

        if ($store === null) {
            throw new RuntimeException("Buyurtma #{$order->number} hech qaysi do'konga tegishli emas.");
        }

        return $this->storefronts->asStore($store, fn (): MarketOrder => DB::transaction(function () use ($order, $target, $context): MarketOrder {
            $changes = ['state' => $target->value];

            $changes[$target->stampColumn()] = now();

            match ($target) {
                MarketOrderState::Accepted => $changes['bill_id'] = $this->fireAtTheKitchen($order),
                MarketOrderState::Rejected => $changes['reject_reason'] = $context['reason'] ?? null,
                MarketOrderState::Cancelled => $changes['cancel_reason'] = $context['reason'] ?? null,
                MarketOrderState::CourierAssigned => $changes['courier_id'] = $context['courier_id'] ?? null,
                default => null,
            };

            $order->forceFill($changes)->save();

            /*
             * The bill follows the order out of the door.
             *
             * `close()` marks it paid, which is true — the guest paid the
             * marketplace before the courier left. What did not happen is a
             * tender at the till, and that is deliberate: see the class
             * docblock. A cancelled order voids its bill instead, so the
             * kitchen's stock and the day's revenue both stop counting it.
             */
            if ($order->bill_id !== null) {
                match ($target) {
                    MarketOrderState::Delivered => $this->bills->close($order->bill_id),
                    MarketOrderState::Cancelled, MarketOrderState::Rejected => $this->bills->cancel(
                        $order->bill_id,
                        $context['reason'] ?? 'Bozor buyurtmasi bekor qilindi',
                    ),
                    default => null,
                };
            }

            // Refreshed and reloaded here for the same reason `place()` is:
            // outside this closure the connection cannot see the row at all,
            // and `refresh()` would raise ModelNotFound on a write that
            // succeeded.
            return $order->refresh()->load(['lines', 'store']);
        }));
    }

    /**
     * Open the restaurant's own bill and send it to the pass.
     *
     * Runs inside the store's tenancy and inside `advance()`'s transaction, so
     * a kitchen ticket and an accepted order are one event. `send()` is what
     * calls `TicketWriter` — the module never touches Kitchen directly.
     *
     * The unit price is overridden with the MARKET price rather than letting
     * the catalogue price the line. That is the one legitimate use of the
     * override and it is why the parameter exists: what the restaurant is owed
     * for this plate is what the guest paid for it here, not what the dining
     * room charges.
     */
    private function fireAtTheKitchen(MarketOrder $order): int
    {
        $bill = $this->bills->open(
            channel: 'aggregator',
            tableLabel: 'MyPOS · '.$order->number,
            guests: 1,
        );

        foreach ($order->lines as $line) {
            /** @var MarketOrderLine $line */
            $bill = $this->bills->addLine(
                billId: $bill->id,
                menuItemId: $line->menu_item_id,
                quantity: $line->quantity,
                unitPriceOverride: $line->unit_price_tiyin,
                note: $line->note,
            );
        }

        $this->bills->send($bill->id);

        return $bill->id;
    }

    /**
     * The offer behind a code, or null when there is none to apply.
     *
     * Null rather than an exception for a code that does not exist: a guest who
     * typed one wrong should be able to press the button and eat, with the
     * screen saying the code did nothing. A refusal here is a checkout that
     * fails on a field nobody has to fill in.
     *
     * A code from a DIFFERENT storefront is also null, and that is the case
     * worth naming — codes are unique across the marketplace, so one exists and
     * belongs to somebody else's restaurant.
     */
    private function promotionFor(Store $store, ?string $code): ?Promotion
    {
        if ($code === null || trim($code) === '') {
            return null;
        }

        /** @var Promotion|null $promotion */
        $promotion = Promotion::query()
            ->spendable()
            ->where('store_id', $store->id)
            ->whereRaw('upper(code) = ?', [mb_strtoupper(trim($code))])
            ->first();

        return $promotion;
    }
}
