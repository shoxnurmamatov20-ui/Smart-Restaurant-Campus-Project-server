<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Controllers;

use App\Contracts\Crm\PromoQuote;
use App\Contracts\Crm\Promotions;
use App\Contracts\Kitchen\KitchenLoad;
use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\StopList;
use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillLine;
use App\Contracts\Orders\BillRegistry;
use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Branch;
use App\Support\Auth\GuestIdentity;
use App\Support\Errors\ApiException;
use App\Support\Events\EventBus;
use App\Support\Orders\GuestBasket;
use App\Support\Orders\OrderChannel;
use App\Support\Orders\OrderState;
use App\Support\Tenancy\BranchContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Orders\Events\OrderPlaced;
use Modules\Orders\Http\Requests\PublicOrderRequest;
use Modules\Orders\Models\ChannelSetting;
use Modules\Orders\Models\IntakePolicy;
use Modules\Orders\Models\Order;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

/**
 * A guest ordering food, and then watching it come.
 *
 * The first end-to-end path on this platform that starts outside the building:
 * a stranger with a phone puts food on a real kitchen's pass and a real
 * cashier's screen, with no account, no terminal and nobody at the restaurant
 * typing anything. Everything below is about making that safe enough to leave
 * on the open internet.
 *
 * ---------------------------------------------------------------------------
 * The belts, from outermost in
 *
 * **Ten a minute per address**, at the route. Ten is more than a person
 * ordering dinner needs and far fewer than a script wants.
 *
 * **An idempotency key**, because this sits inside the `tenant` group. A guest
 * on a lift's worth of signal taps "Buyurtma berish" twice and gets one order
 * — the second request replays the first one's answer rather than sending the
 * kitchen a second dinner.
 *
 * **Three open orders per phone.** Past that the number is refused until one of
 * them finishes. Somebody filling a kitchen with orders has to bring a new
 * number for each fourth one, and a guest who genuinely wants a fourth dinner
 * before the third arrived can ring.
 *
 * **A minimum basket**, per branch. Not a belt against abuse — a belt against
 * a delivery that costs more to carry than it sells.
 *
 * **Every price from the catalogue.** The request carries ids and quantities
 * and nothing else that is money. See `PublicOrderRequest` for the whole list
 * of what a guest may not say.
 *
 * ---------------------------------------------------------------------------
 * Paid online means not yet cooked
 *
 * Cash and card-on-delivery orders are fired the moment they are accepted: the
 * food is made and the money arrives at the door, which is how every delivery
 * in the country has always worked.
 *
 * An online order is not. It waits at `draft` with `payment_state = 'pending'`,
 * which means no docket, no pass, no station — because a kitchen that cooks
 * before the money lands is a kitchen paying for every abandoned checkout. The
 * payment rail is Finance's, and it is built: when a provider settles,
 * `OnlinePaymentLedger` calls `BillRegistry::markPrepaid()`, which moves that
 * one column and fires the dockets. Nothing on this path waits any more.
 *
 * That is a second axis rather than a fourteenth rung on the state ladder. See
 * the migration for why adding one would have changed what four surfaces render
 * for every order ever placed.
 */
final class PublicOrderController extends Controller
{
    /** How many live orders one phone number may have at once. */
    private const OPEN_ORDERS_PER_PHONE = 3;

    /**
     * How far back the history screen reaches in one call.
     *
     * Not paginated, and that is a decision rather than an omission: the design
     * draws a list a thumb scrolls to the end of, and a guest who has ordered
     * more than fifty times from one restaurant is looking for last Tuesday's
     * kebab rather than for 2024. A cursor would be a second shape for a screen
     * that has no "load more" on it.
     */
    private const HISTORY_PAGE = 50;

    /** Minutes, when a dish does not say how long it takes. */
    private const DEFAULT_COOK_MINUTES = 15;

    /**
     * Nothing is ever promised sooner than this.
     *
     * A basket of cold drinks computes to about four minutes, and four minutes
     * is a promise no kitchen keeps — somebody still has to see the docket,
     * pick it up and hand it over. A floor is more honest than an arithmetic
     * that happens to be small.
     */
    private const MINIMUM_ETA_MINUTES = 15;

    /**
     * The rungs a guest watches, in order.
     *
     * Filtered per channel by the ladder's own `appliesTo()` rather than by a
     * second list here: a dine-in bill never goes `enroute` and a delivery never
     * reaches `served`, and `App\Support\Orders\OrderState` is where that is
     * already written down.
     *
     * @var list<string>
     */
    private const FULFILMENT_LADDER = [
        OrderState::Placed->value,
        OrderState::Accepted->value,
        OrderState::Cooking->value,
        OrderState::Ready->value,
        OrderState::Enroute->value,
        OrderState::Served->value,
        OrderState::Handed->value,
    ];

    /**
     * Take an order.
     *
     * One transaction from the first line to the docket: a bill that reached
     * the kitchen without its lines, or lines with no bill, is not a state
     * anybody can clean up at seven on a Friday.
     */
    public function store(
        PublicOrderRequest $request,
        BillRegistry $bills,
        MenuCatalog $menu,
        StopList $stops,
        BranchContext $branches,
        EventBus $events,
        Promotions $promotions,
    ): JsonResponse {
        $phone = self::normalisePhone((string) data_get($request->validated(), 'customer.phone', ''));
        $channel = self::channelFrom((string) $request->string('channel'));
        $branch = $this->branchOrFail($request->input('branch_id'));
        $scheduledFor = $this->scheduledForOrFail($request->input('scheduled_for'), $branch);
        /*
         * Who is ordering, when anybody is.
         *
         * Optional and stays optional: ordering dinner works signed out, and it
         * has to — the whole point of this endpoint is a stranger with a phone.
         * A guest who IS signed in gets three things a stranger does not: their
         * personal coupons are visible, a per-customer campaign limit can be
         * counted against them, and the bill lands on their own order history
         * rather than beside it.
         *
         * Read through the core rather than CRM's middleware, because Orders may
         * not import CRM. See App\Support\Auth\GuestIdentity.
         */
        $customerId = GuestIdentity::of($request);

        /*
         * Is this door even open?
         *
         * Checked before anything is written and before the basket is priced,
         * because a guest whose website order is refused should be told so
         * while the basket is still on their screen — not after a rolled-back
         * transaction. `ChannelSetting::resolve()` falls the venue's own row
         * through to the restaurant's, so "Chilonzor is not taking web orders
         * for the next hour" refuses without touching the other four venues.
         *
         * A door with no mapping — a guest at a table with a QR code, a cashier
         * at a till — is never refused here. See `ChannelSetting::keyForSource`.
         */
        $this->refuseAClosedDoor((string) ($request->input('source') ?? 'web'), $branch->id);
        $this->refuseAPackedKitchen($branch->id);

        /*
         * Counted before the branch context is set, and that ordering is the
         * point: the limit is per NUMBER, not per venue. A guest with three
         * orders running at three branches of the same chain is still one guest
         * with three dinners in flight, and scoping the count to one branch
         * would multiply the ceiling by the size of the estate.
         */
        $this->refuseAFourthOpenOrder($phone);

        /*
         * Checked before the transaction opens, so a guest is told "Manti hozir
         * mavjud emas" by name rather than being handed a rolled-back order.
         * See App\Support\Orders\GuestBasket — the QR endpoint in Tables reads
         * a basket the same way, and the rule may only exist once.
         */
        $basket = GuestBasket::read($request->validated()['items'], $menu, $stops);

        /*
         * Branch context, set by hand.
         *
         * `ResolveBranch` fills this from `X-Branch`, which is what a signed-in
         * console sends. A guest's phone has no such header — it has a venue the
         * person tapped on a list — so the id comes up in the body and is turned
         * into context here, before the first row is written.
         *
         * It has to happen before, not after: `BelongsToBranch` stamps
         * `branch_id` on `creating`, and that is how the order AND the kitchen
         * dockets it fires end up at the same address. Without it both land with
         * a null branch and the KDS in the building — which filters by branch —
         * never sees the ticket.
         */
        $branches->set($branch);

        try {
            [$order, $bill, $quote] = DB::transaction(function () use (
                $bills, $basket, $request, $phone, $channel, $branch, $customerId, $promotions, $scheduledFor
            ): array {
                $bill = $bills->open($channel->value, customerId: $customerId);

                foreach ($basket->lines as $line) {
                    try {
                        $bill = $bills->addLine(
                            billId: $bill->id,
                            menuItemId: $line->dish->id,
                            quantity: $line->quantity,
                            note: $line->note,
                            modifierChoiceIds: $line->choiceIds,
                        );
                    } catch (RuntimeException $refusal) {
                        /*
                         * The catalogue refused a modifier choice — one that is
                         * not offered for this dish, or that breaks its group's
                         * min/max. A stale menu bundle on a phone that has been
                         * in a pocket since Tuesday is the ordinary cause.
                         *
                         * Refused rather than dropped, which is the contract's
                         * own rule: a ticket that quietly lost "no onion"
                         * reaches the kitchen looking correct.
                         */
                        throw ApiException::of('order.modifier_invalid', field: 'items', meta: [
                            'menu_item_id' => $line->dish->id,
                        ], previous: $refusal);
                    }
                }

                /** @var Order $order */
                $order = Order::query()->findOrFail($bill->id);

                $typedCode = $this->trimmedOrNull($request->input('promo_code'));

                /*
                 * The promo, priced by CRM and applied here.
                 *
                 * `PublicOrderRequest` used to say this field was "recorded,
                 * never trusted … there is no contract Orders could call to
                 * ask", and it was true: the cart subtracted fifteen percent in
                 * the browser and the bill charged full price. There is a
                 * contract now — `App\Contracts\Crm\Promotions` — and the
                 * arithmetic it returns is the only discount that reaches a row.
                 *
                 * Quoted against the FOOD, before the delivery fee. A percentage
                 * applied to a total that includes carriage is a campaign paying
                 * part of the courier, which is not what a restaurant signed up
                 * to when it wrote "15% off".
                 */
                $quote = $typedCode === null
                    ? null
                    : $promotions->quote($typedCode, $customerId, (int) $bill->subtotal);

                $discount = $quote->discountTiyin ?? 0;
                $food = (int) $bill->subtotal - $discount;

                /*
                 * A free-delivery coupon is worth nothing off the food and
                 * everything off the carriage, so it lands on the fee rather
                 * than on `discount_total`. Folding it into the discount would
                 * show the guest money off their kebab and then charge them for
                 * the courier anyway — and would break the branch minimum,
                 * which is measured on food.
                 */
                $fee = $quote?->freeDelivery === true
                    ? 0
                    : $this->deliveryFee($branch, $channel, $food);

                $online = (string) $request->string('payment_method') === 'online';

                $order->forceFill([
                    'customer_name' => trim((string) data_get($request->validated(), 'customer.name')),
                    'customer_phone' => $phone,
                    'delivery_address' => $channel === OrderChannel::Delivery
                        ? trim((string) data_get($request->validated(), 'address.line'))
                        : null,
                    'delivery_note' => $this->trimmedOrNull(data_get($request->validated(), 'address.note')),
                    'delivery_lat' => data_get($request->validated(), 'address.lat'),
                    'delivery_lng' => data_get($request->validated(), 'address.lng'),
                    'delivery_fee' => $fee,
                    'discount_total' => $discount,
                    'payment_method' => (string) $request->string('payment_method'),
                    // See the class note: an unpaid online order is not cooked.
                    'payment_state' => $online ? 'pending' : 'due',
                    /*
                     * The code as CRM stores it once one was honoured, and as
                     * the guest typed it when none was. Keeping the typed
                     * version on a refused code is what lets somebody answer
                     * "why did OSH15 not work" six weeks later.
                     */
                    'promo_code' => $quote->code ?? $typedCode,
                    'source' => (string) ($request->input('source') ?? 'web'),
                    /*
                     * Which conversation, as against which app.
                     *
                     * Derived rather than accepted: a guest's phone can be
                     * trusted to say which build it is (`source`), but the lane
                     * an order is BILLED against is a commercial fact and the
                     * client has no business naming it. The mini app is its own
                     * lane because Telegram is its own contract; everything
                     * else that reaches this endpoint came through the
                     * restaurant's own site or app, which is one lane called
                     * `site`. The three aggregators never arrive here at all —
                     * they come through their own integrations.
                     */
                    'intake_channel' => (string) $request->input('source') === 'telegram' ? 'telegram' : 'site',
                    'scheduled_for' => $scheduledFor,
                    'note' => $this->trimmedOrNull($request->input('note')),
                ])->save();

                // Re-derived with the fee in place: `addLine` recalculated after
                // every line, and at that point the fee was still zero.
                $order->recalculateTotals();

                /*
                 * Spent in the same transaction the discount is written in.
                 *
                 * Not after the response, and not on payment. A redemption that
                 * lands later is a campaign with no budget: a single-use coupon
                 * would pay for as many dinners as a guest could place before
                 * the first one settled, and a `max_uses` of fifty would be
                 * spent five hundred times on a busy Friday. If the redemption
                 * cannot be written the whole order rolls back, which is the
                 * correct direction to fail — a guest re-taps and gets one
                 * dinner at one price.
                 */
                if ($quote instanceof PromoQuote) {
                    $promotions->redeem($quote->code, $customerId, (int) $order->getKey(), $discount);
                }

                $this->refuseABasketBelowTheMinimum($branch, (int) $order->subtotal - (int) $order->discount_total);

                $order->forceFill([
                    'promised_at' => now()->addMinutes($this->etaMinutes($branch, $channel, $basket)),
                ])->save();

                /*
                 * Fired here, inside the same transaction, or not at all.
                 *
                 * `send()` writes the dockets through `TicketWriter` in its own
                 * nested transaction, so an order that rolls back below this
                 * line takes its tickets with it. A pass holding a docket for a
                 * bill that does not exist is a cook plating food nobody
                 * ordered, with no way to find out.
                 */
                if (! $online) {
                    $bill = $bills->send($bill->id);
                }

                return [$order->refresh(), $bill, $quote];
            });
        } finally {
            /*
             * Cleared however this ends.
             *
             * The context was set by hand rather than by middleware, so nothing
             * else will clear it — and under php-fpm a worker that kept this
             * request's branch would stamp the next request's rows with it. The
             * failure that produces is silent and belongs to a different guest.
             */
            $branches->clear();
        }

        $events->publish(new OrderPlaced($order));

        return response()->json([
            'data' => $this->placementPayload($order, $bill, $branch, $quote),
        ], Response::HTTP_CREATED);
    }

    /**
     * Where is my order.
     *
     * Two credentials, and neither is a session: the bill number, and the last
     * four digits of the number that placed it. The bill number alone is not
     * enough — they are sequential per restaurant, so `A-0041` is one keystroke
     * from `A-0042`, and an endpoint that answered on the number alone would
     * hand a stranger somebody's address and dinner.
     *
     * Four digits rather than the whole number because the guest is reading a
     * screen, not a database, and because the whole number in a query string is
     * a phone number in a proxy log.
     */
    public function show(Request $request, string $number): JsonResponse
    {
        /*
         * Without the branch scope, on purpose.
         *
         * A bill number is unique per RESTAURANT — `orders.orders` has the
         * unique index on `(tenant_id, number)` — and a guest's phone does not
         * know which venue cooked their food. With the scope on, a client that
         * happened to send `X-Branch` for one venue could not track an order
         * from another, and the failure would read as "your order does not
         * exist".
         */
        /** @var Order|null $order */
        $order = Order::query()
            ->withoutGlobalScope('branch')
            // The rider comes along for the ride: without it the tracking
            // payload would issue two more queries per render, on the one
            // endpoint that is open to the internet and polled every few
            // seconds by every guest waiting for dinner.
            ->with(['items', 'branch', 'delivery.courier'])
            ->where('number', $number)
            ->first();

        /*
         * A dine-in bill is not trackable and does not say so.
         *
         * `customer_phone` is null on every order a waiter opened, so there is
         * nothing to check a caller against — and answering "this exists but you
         * cannot see it" would turn this endpoint into a way to count a
         * restaurant's covers. One 404 for all three cases: no such number, not
         * a guest's order, wrong phone.
         */
        if ($order === null || $order->customer_phone === null || ! $this->phoneMatches($request, $order)) {
            throw ApiException::of('request.not_found', field: 'number');
        }

        return response()->json([
            'data' => [
                /*
                 * The id, and it is here for exactly one button: "pay again" on
                 * an unpaid online order. `POST /api/v1/public/payments/invoice`
                 * is keyed by `order_id` AND `order_number` together, and a
                 * tracking screen holding only the number cannot open a second
                 * attempt after a card is declined — it would have to send the
                 * guest back to a checkout that no longer has their basket.
                 *
                 * On THIS response only, and not inside `trackingPayload()`
                 * where the history list would inherit it. Reaching this payload
                 * needs the bill number and the last four digits of the phone it
                 * was placed with, so the id goes to somebody who has already
                 * proved the order is theirs; a list is a different credential
                 * and does not need it.
                 */
                'id' => (int) $order->id,
                ...$this->trackingPayload($order),
            ],
        ]);
    }

    /**
     * Everything I have ordered here — GET /api/v1/public/orders.
     *
     * The profile screen's history, which drew a fixture until now. `GET
     * /public/me` already reports `orders_count` and `total_spent`, so the
     * screen could say "eleven orders" and then list three invented ones; this
     * is the list behind the figure.
     *
     * ---------------------------------------------------------------------
     * Why the token is the filter and a phone number is not
     *
     * `show()` above takes a bill number plus the last four digits of the phone,
     * and that pair is right there: it is the credential a guest has after
     * ordering as a stranger, with no account at all. A LIST is different. A
     * phone number in a query string would be an endpoint that hands somebody's
     * whole ordering history to anybody who knows their number, which in this
     * country is most of a receipt. So this one is signed in, and "mine" means
     * the token's own `customer_id` rather than anything the request claims.
     *
     * Not behind CRM's `customer.token` middleware, deliberately: Orders may not
     * depend on CRM, and a venue running no loyalty scheme still takes orders.
     * The core reads the same token and answers with an id.
     */
    public function index(Request $request): JsonResponse
    {
        $customerId = GuestIdentity::of($request);

        if ($customerId === null) {
            throw ApiException::of('order.sign_in_required');
        }

        /*
         * Without the branch scope, for `show()`'s reason: a guest's history is
         * their history across every venue of the chain, and a client that
         * happened to send `X-Branch` would silently lose the other four.
         */
        $orders = Order::query()
            ->withoutGlobalScope('branch')
            ->with(['items', 'branch'])
            ->where('customer_id', $customerId)
            // `customer_id` alone would include bills a cashier put on this
            // person's tab at the counter. Those are real orders and the guest
            // may well want them, but they carry no phone, no tracking ladder
            // and no channel this screen can draw — see `show()`.
            ->whereNotNull('customer_phone')
            ->orderByDesc('id')
            ->limit(self::HISTORY_PAGE)
            ->get();

        return response()->json([
            'data' => $orders->map(fn (Order $order): array => $this->trackingPayload($order))->all(),
        ]);
    }

    // ============ Reading the request ============

    /**
     * The venue that is going to cook this.
     *
     * Looked up through the model rather than an `exists:` rule, because the
     * question is not "is there a branch 7" — it is "does THIS restaurant have
     * a branch 7, and is it open". `BelongsToTenant` answers the first half; a
     * rule in a form request cannot.
     *
     * ---------------------------------------------------------------------
     * When the guest named none
     *
     * A restaurant with exactly one open venue has no choice to make, and that
     * is most restaurants. Requiring the id there would mean a guest app must
     * discover a number before it can order — and there is no public endpoint
     * that publishes one, because `GET /api/v1/branches` needs a session.
     *
     * With two or more it refuses, and "the first one" is deliberately not the
     * answer: a guest in Yunusobod whose dinner is cooked in Termiz has been
     * given somebody's guess rather than their own choice. The refusal names
     * the field, so the app knows what it failed to send.
     */
    /**
     * The sitting a guest asked for, checked against the venue's own day.
     *
     * Two things have to be true and only one of them is a format. The first is
     * that the instant parses and is not in the past, which
     * `PublicOrderRequest` has already established. The second is that the
     * kitchen is lit: an order for 04:30 is not a pre-order, it is a guest who
     * mistyped and will be waiting outside a dark building.
     *
     * ------------------------------------------------------------------------
     * Why the branch's `hours` and not the diary's booking windows
     *
     * The design's sign asks for this to be checked against
     * `tables.booking_windows`, and it cannot be: that table belongs to Tables,
     * Orders may not import another module, and a slot in a booking diary is
     * about a TABLE being free — which has nothing to say about whether the
     * kitchen can cook a delivery. `hours.opens`/`hours.closes` is the venue's
     * own setting, lives in `public.branches`, is already what
     * `GET /public/branches` publishes to the very screen that draws this
     * chooser, and is the right question: is anybody there.
     *
     * A venue that has not set its hours accepts any time inside the seven-day
     * window. That is the safe direction to be wrong in — refusing every
     * pre-order at a restaurant that never filled in a settings page would be a
     * feature that appears broken rather than strict.
     *
     * ------------------------------------------------------------------------
     * The clock is read as sent, and never re-zoned
     *
     * `19:00` on a restaurant's own site means seven in the evening AT THAT
     * RESTAURANT. The checkout sends the wall clock the guest picked, and the
     * booking form next door states the same rule in its own comment:
     * *"Stamping the browser's offset onto it would book a guest in London a
     * table at midnight."*
     *
     * Converting it here is the same mistake read backwards, and it was
     * measured: with the application on UTC and the venue five hours ahead, a
     * 19:00 pre-order became midnight and was refused, while 04:30 became 09:30
     * and was accepted. So the hour and minute come off the value as it arrived.
     */
    private function scheduledForOrFail(mixed $scheduledFor, Branch $branch): ?Carbon
    {
        if ($scheduledFor === null || $scheduledFor === '') {
            return null;
        }

        $at = Carbon::parse((string) $scheduledFor);

        $opens = $branch->setting('hours.opens');
        $closes = $branch->setting('hours.closes');

        if (! is_string($opens) || ! is_string($closes)) {
            return $at;
        }

        $minutes = $at->hour * 60 + $at->minute;

        $from = self::minutesOfDay($opens);
        $until = self::minutesOfDay($closes);

        /*
         * A venue that closes after midnight — 10:00 to 02:00 — is the ordinary
         * case for a bar, and the naive `>= from && <= until` refuses every hour
         * it is actually open. When the closing time is the smaller number the
         * day wraps, and the test inverts with it.
         */
        $open = $until > $from
            ? $minutes >= $from && $minutes <= $until
            : $minutes >= $from || $minutes <= $until;

        if (! $open) {
            throw ApiException::of('order.outside_hours', field: 'scheduled_for', meta: [
                'opens' => $opens,
                'closes' => $closes,
            ]);
        }

        return $at;
    }

    /** `"09:30"` as 570. Anything unparseable is midnight, which fails open. */
    private static function minutesOfDay(string $clock): int
    {
        [$hour, $minute] = array_pad(explode(':', $clock, 2), 2, '0');

        return ((int) $hour) * 60 + (int) $minute;
    }

    private function branchOrFail(mixed $branchId): Branch
    {
        if ($branchId === null || $branchId === '') {
            $venues = Branch::query()->where('status', 'active')->take(2)->get();

            if ($venues->count() !== 1) {
                throw ApiException::of('order.branch_unavailable', field: 'branch_id', meta: [
                    'venues' => $venues->count(),
                ]);
            }

            /** @var Branch $only */
            $only = $venues->first();

            return $only;
        }

        /** @var Branch|null $branch */
        $branch = Branch::query()->whereKey((int) $branchId)->first();

        if ($branch === null || ! $branch->isActive()) {
            throw ApiException::of('order.branch_unavailable', field: 'branch_id');
        }

        return $branch;
    }

    /**
     * Refuse an order that arrived through a door the restaurant has shut.
     *
     * The refusal carries the reason the operator typed — "fryer is down" — and
     * when the door reopens, because both are what stop a guest trying four
     * more times. `until` rides on the envelope beside the code rather than
     * only in the message, so a client can say "in 40 minutes" in the reader's
     * own language rather than reprinting somebody's Uzbek note in Russian.
     */
    private function refuseAClosedDoor(string $source, int $branchId): void
    {
        $key = ChannelSetting::keyForSource($source);

        if ($key === null) {
            return;
        }

        $door = ChannelSetting::resolve($key, $branchId);

        if ($door->accepts) {
            return;
        }

        throw ApiException::of('order.channel_paused', field: 'source', meta: [
            'channel' => $key,
            'reason' => $door->pause_reason,
            'until' => $door->paused_until?->toIso8601String(),
        ]);
    }

    /**
     * Refuse a stranger's order while the line is buried.
     *
     * The intake desk's "band soatlarda onlayn buyurtmani to'xtatish" switch,
     * enforced. It is the one of the four automation rules that could be, and
     * leaving it as a stored intention would have been the same defect the
     * switch already had in the browser: a manager who has switched it on
     * stops watching the queue.
     *
     * Only for a stranger. This method is on the public controller and nowhere
     * else — a cashier at a till and a guest at a table are already in the
     * building, and refusing them would be telling somebody in the dining room
     * that the kitchen is closed.
     *
     * Through `KitchenLoad` rather than a query, because Orders may not read
     * Kitchen's tables (`ModuleBoundaryTest`), and the same count the status
     * strip shows is the one this refuses on — so the number an operator is
     * looking at is the number that shut the door.
     *
     * The ceiling rides on the envelope so the site can say "we are catching
     * up, try again in a few minutes" with the figure in it, rather than
     * reprinting a refusal a guest cannot act on.
     */
    private function refuseAPackedKitchen(int $branchId): void
    {
        $rules = IntakePolicy::resolve($branchId);

        if (! $rules->pause_at_peak) {
            return;
        }

        $open = app(KitchenLoad::class)->pressure($branchId)->open;

        if ($open < $rules->peak_ticket_limit) {
            return;
        }

        throw ApiException::of('order.kitchen_at_capacity', meta: [
            'open_tickets' => $open,
            'limit' => $rules->peak_ticket_limit,
        ]);
    }

    private function refuseAFourthOpenOrder(string $phone): void
    {
        $open = Order::query()
            ->withoutGlobalScope('branch')
            ->where('customer_phone', $phone)
            ->whereIn('status', Order::OPEN_STATUSES)
            ->count();

        if ($open >= self::OPEN_ORDERS_PER_PHONE) {
            throw ApiException::of('order.too_many_open', field: 'customer.phone', meta: [
                'open' => $open,
                'limit' => self::OPEN_ORDERS_PER_PHONE,
            ]);
        }
    }

    private function refuseABasketBelowTheMinimum(Branch $branch, int $food): void
    {
        $minimum = (int) $branch->setting('min_order_tiyin', 0);

        if ($minimum > 0 && $food < $minimum) {
            throw ApiException::of('order.below_minimum', field: 'items', meta: [
                'minimum' => $minimum,
                'subtotal' => $food,
            ]);
        }
    }

    // ============ Money and time ============

    /**
     * What carrying it costs, and when it stops costing anything.
     *
     * Off the branch rather than a constant, because it is a commercial
     * decision that differs by venue: a city-centre café charges nothing within
     * two streets and a suburb charges for the petrol. Zero when unset, which is
     * the default that cannot surprise a guest.
     *
     * Delivery only — `OrderChannel::chargesDeliveryFee()` says so, and says why:
     * on an aggregator order the fee is the aggregator's and billing it here
     * charges the guest twice.
     */
    private function deliveryFee(Branch $branch, OrderChannel $channel, int $food): int
    {
        if (! $channel->chargesDeliveryFee()) {
            return 0;
        }

        $fee = max(0, (int) $branch->setting('delivery_fee_tiyin', 0));
        $freeOver = max(0, (int) $branch->setting('free_delivery_over_tiyin', 0));

        return $freeOver > 0 && $food >= $freeOver ? 0 : $fee;
    }

    /**
     * How long to promise, in minutes.
     *
     * The slowest dish, not the sum: a kitchen with a grill and a salad station
     * cooks them at the same time, and adding the two would quote an hour for a
     * plate that is ready in twenty. Plus whatever the venue says its pass is
     * running behind, plus the trip.
     *
     * Every part of it is a branch setting with a default, because the honest
     * answer differs by kitchen and nobody at this layer knows it. What is not
     * negotiable is the floor — see MINIMUM_ETA_MINUTES.
     */
    private function etaMinutes(Branch $branch, OrderChannel $channel, GuestBasket $basket): int
    {
        $slowest = $basket->slowestCookMinutes(self::DEFAULT_COOK_MINUTES);

        $queue = max(0, (int) $branch->setting('kitchen_queue_minutes', 10));
        $travel = $channel === OrderChannel::Delivery
            ? max(0, (int) $branch->setting('delivery_travel_minutes', 25))
            : max(0, (int) $branch->setting('pickup_wait_minutes', 5));

        return max(self::MINIMUM_ETA_MINUTES, $slowest + $queue + $travel);
    }

    // ============ Answers ============

    /**
     * @return array<string, mixed>
     */
    private function placementPayload(Order $order, Bill $bill, Branch $branch, ?PromoQuote $quote = null): array
    {
        return [
            /*
             * The bill's own id, on the placement answer and nowhere else.
             *
             * `POST /public/payments/invoice` needs it — it takes the id AND
             * the number and refuses unless they name the same bill, which is
             * what stops an invoice being raised against somebody else's
             * dinner. The tracking answer does not carry it: that endpoint is
             * reachable with a number and four digits, and an internal id is
             * not something a screen drawing a progress bar has any use for.
             */
            'id' => (int) $order->getKey(),
            'number' => $order->number,
            'status' => $order->status,
            'channel' => $order->channel,
            'is_open' => $order->is_open,
            'branch' => ['id' => $branch->id, 'name' => $branch->name],
            'payment' => [
                'method' => $order->payment_method,
                'state' => $order->payment_state,
            ],
            'subtotal' => (int) $order->subtotal,
            'discount_total' => (int) $order->discount_total,
            'service_charge' => (int) $order->service_charge,
            'delivery_fee' => (int) $order->delivery_fee,
            // Named for what it is, so no client renders it as "+ VAT".
            'vat_included' => (int) $order->vat_included,
            'total' => (int) $order->total,
            'currency' => 'UZS',
            /*
             * What the promo actually did, beside the code that was typed.
             *
             * Null means "nothing" — an unknown code, an expired campaign, a
             * basket under the floor. The screen needs to be able to say so:
             * the alternative is a cart that showed −15%, a bill that charged
             * full price, and a guest reading a total nobody explained. The
             * order still carries the string either way; this is the verdict.
             */
            'promo' => $quote?->toArray(),
            'eta_minutes' => $this->minutesUntil($order->promised_at),
            'promised_at' => $order->promised_at?->toIso8601String(),
            'placed_at' => $order->placed_at?->toIso8601String(),
            'lines' => array_map(self::linePayload(...), $bill->lines),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function trackingPayload(Order $order): array
    {
        $channel = OrderChannel::tryFrom((string) $order->channel) ?? OrderChannel::Delivery;
        $ladder = $this->ladderFor($channel);
        $reached = $this->reachedAt($order);

        return [
            'number' => $order->number,
            'status' => $order->status,
            'channel' => $order->channel,
            'is_open' => $order->is_open,
            /*
             * Which venue is cooking it.
             *
             * The name as well as the id, because the tracking screen prints
             * "№4471 · Chilonzor" and a client that had only the id would have
             * to look it up through an endpoint a guest cannot reach.
             */
            'branch' => $order->branch === null ? null : [
                'id' => (int) $order->branch->id,
                'name' => (string) $order->branch->name,
            ],
            /*
             * Which rung, as an index into the ladder above.
             *
             * Null rather than a number for a bill that is not on the ladder at
             * all — a draft waiting on an online payment, or one that was voided
             * — because a screen drawing "step 0 of 6" for an order that will
             * never be cooked is worse than a screen drawing nothing.
             */
            'stage' => $this->stageOf($order, $ladder),
            'ladder' => $ladder,
            'reached_at' => $reached,
            'payment' => [
                'method' => $order->payment_method,
                'state' => $order->payment_state,
            ],
            'eta_minutes' => $this->minutesUntil($order->promised_at),
            'promised_at' => $order->promised_at?->toIso8601String(),
            'placed_at' => $order->placed_at?->toIso8601String(),
            'closed_at' => $order->closed_at?->toIso8601String(),
            /*
             * Who has it, once somebody does.
             *
             * Null until a dispatcher assigns a rider, and null forever for a
             * takeaway — the key is always present because the guest screens
             * draw a courier card off it, and a key that appears later is a
             * client change while a key that is always there is not.
             *
             * The phone is MASKED and the surname is dropped. A tracking link
             * is guarded by a bill number and four digits, which is enough to
             * stop a stranger reading somebody's address and nowhere near
             * enough to justify publishing an employee's mobile number to
             * whoever holds it. What a guest needs is "Bekzod is bringing it"
             * and a number the app can dial through the platform later; what
             * they do not need is a rider's personal contact card.
             */
            'courier' => $this->courierPayload($order),
            'delivery' => [
                'address' => $order->delivery_address,
                'note' => $order->delivery_note,
            ],
            'subtotal' => (int) $order->subtotal,
            'discount_total' => (int) $order->discount_total,
            'service_charge' => (int) $order->service_charge,
            'delivery_fee' => (int) $order->delivery_fee,
            'vat_included' => (int) $order->vat_included,
            'total' => (int) $order->total,
            'currency' => 'UZS',
            'lines' => $order->items->map(static fn ($item): array => [
                'id' => (int) $item->id,
                'menu_item_id' => $item->menu_item_id === null ? null : (int) $item->menu_item_id,
                'title' => (string) $item->title,
                'quantity' => (int) $item->quantity,
                'unit_price' => (int) $item->unit_price,
                'total_price' => (int) $item->total_price,
                'status' => (string) $item->status,
                'note' => $item->note,
            ])->all(),
        ];
    }

    /**
     * The rider on the guest's screen, or nothing at all.
     *
     * Three fields and no more. `eta_minutes` is repeated from the order rather
     * than recomputed per courier, because this platform makes one promise per
     * order and a second estimate beside the first is two numbers a guest will
     * read as a disagreement.
     *
     * @return array<string, mixed>|null
     */
    private function courierPayload(Order $order): ?array
    {
        $delivery = $order->delivery;

        if ($delivery === null || $delivery->courier_user_id === null) {
            return null;
        }

        $courier = $delivery->courier;

        if ($courier === null) {
            return null;
        }

        return [
            // The first name only. A rider knocking on a door introduces
            // themselves by it, and a surname on a public URL is personal data
            // the guest never asked for.
            'name' => self::firstNameOf((string) $courier->name),
            'phone_masked' => self::maskPhone($courier->phone),
            'status' => $delivery->status,
            'picked_at' => $delivery->picked_at?->toIso8601String(),
            'eta_minutes' => $this->minutesUntil($order->promised_at),
        ];
    }

    /** "Bekzod Alimov" → "Bekzod". Whitespace-only names answer an em dash. */
    private static function firstNameOf(string $name): string
    {
        $first = trim(explode(' ', trim($name))[0]);

        return $first === '' ? '—' : $first;
    }

    /**
     * `998901234567` → `+998 •• ••• 45 67`.
     *
     * The design's own mask — `calls-data.ts` prints exactly this shape — and
     * the last four digits are kept because they are what a guest checks a
     * missed call against. Anything shorter than four digits is dropped
     * entirely rather than half-masked: a two-digit "number" is a data-entry
     * mistake, and printing it teaches nobody anything.
     */
    private static function maskPhone(?string $phone): ?string
    {
        if ($phone === null) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $phone) ?? '';

        if (strlen($digits) < 4) {
            return null;
        }

        return '+'.substr($digits, 0, 3).' •• ••• '
            .substr($digits, -4, 2).' '.substr($digits, -2);
    }

    /**
     * @return array<string, mixed>
     */
    private static function linePayload(BillLine $line): array
    {
        return [
            'id' => $line->id,
            'menu_item_id' => $line->menuItemId,
            'title' => $line->title,
            'quantity' => $line->quantity,
            'unit_price' => $line->unitPrice,
            'total_price' => $line->totalPrice,
            'note' => $line->note,
            'modifiers' => array_map(
                static fn ($modifier): array => $modifier->toArray(),
                $line->modifiers,
            ),
        ];
    }

    /**
     * Which rung the order is on, as an index into the ladder.
     *
     * Null for a status the ladder does not contain — a `draft` waiting on an
     * online payment, a `voided` bill, a `paid` one. The status itself is always
     * in the payload, so a client that cares can say more; this is only the
     * progress bar's argument.
     *
     * @param  list<string>  $ladder
     */
    private function stageOf(Order $order, array $ladder): ?int
    {
        $position = array_search((string) $order->status, $ladder, true);

        return $position === false ? null : (int) $position;
    }

    /**
     * The rungs this channel actually has.
     *
     * @return list<string>
     */
    private function ladderFor(OrderChannel $channel): array
    {
        return array_values(array_filter(
            self::FULFILMENT_LADDER,
            static fn (string $state): bool => OrderState::from($state)->appliesTo($channel),
        ));
    }

    /**
     * When each rung was reached, read from the audit trail.
     *
     * The order carries `placed_at` and `closed_at` and nothing in between, and
     * the guest screens draw a timeline. The times exist already: `Order` logs
     * `status` through Spatie's activity log, so every transition wrote a row
     * saying which state and when.
     *
     * Read from there rather than stamped onto eleven new columns, and rather
     * than projected into a second table, because a second record of the same
     * fact is the thing this codebase argues against everywhere else — and the
     * two would disagree the first time somebody moved a bill by hand.
     *
     * One extra query per tracking request, on an indexed morph key, for a
     * screen one guest polls. Absent rungs are simply absent: a partial map is
     * what the client type already says it is.
     *
     * @return array<string, string>
     */
    private function reachedAt(Order $order): array
    {
        $reached = [];

        if ($order->placed_at !== null) {
            $reached[OrderState::Placed->value] = $order->placed_at->toIso8601String();
        }

        $rows = Activity::query()
            ->where('subject_type', $order->getMorphClass())
            ->where('subject_id', $order->getKey())
            ->where('log_name', 'orders.order')
            ->orderBy('id')
            ->get(['properties', 'created_at']);

        foreach ($rows as $row) {
            $status = data_get($row->properties, 'attributes.status');

            // The first time a state was reached, not the last: a bill dragged
            // back and forth by a manager still says when the food was ready.
            if (is_string($status) && ! array_key_exists($status, $reached)) {
                $reached[$status] = $row->created_at?->toIso8601String() ?? '';
            }
        }

        return $reached;
    }

    // ============ Small conversions ============

    /**
     * The guest's word for the channel, in the column's vocabulary.
     *
     * `pickup` is what every guest surface says and `takeaway` is what the
     * column has always stored. Mapped rather than renamed: `channel` is a
     * public API field with live rows behind it, and `OrderChannel` already
     * carries the whole argument.
     */
    private static function channelFrom(string $requested): OrderChannel
    {
        return $requested === 'delivery' ? OrderChannel::Delivery : OrderChannel::Takeaway;
    }

    /**
     * Digits, and nothing else — not even the plus.
     *
     * `+998 90 123 45 67`, `998901234567`, `+998-90-123-45-67` and
     * `(998) 90 123 45 67` are one guest ringing one number, and stored as
     * written they are four rows that the open-order count above cannot see as
     * one. Normalising is what makes that count mean anything.
     *
     * The plus goes too, and that is the part worth stating: keeping it makes
     * `+998901234567` and `998901234567` two different guests, which is
     * precisely the pair a phone keyboard produces on two different days. What
     * is lost is the E.164 marker, and nothing here needs it — a courier dials
     * the digits, and the tracking check reads the last four of them.
     */
    private static function normalisePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? '';
    }

    /**
     * Does the caller know the last four digits of the number that ordered.
     *
     * Header first, query second. A phone number in a query string ends up in
     * nginx's access log and in every proxy between here and the guest; the
     * header is where a client that can choose should put it. The query string
     * stays because a tracking link in an SMS has nowhere else to carry it.
     *
     * `hash_equals`, because this is a secret being compared — four digits is a
     * small enough space that a timing signal is worth denying.
     */
    private function phoneMatches(Request $request, Order $order): bool
    {
        $offered = self::normalisePhone(
            trim((string) ($request->header('X-Guest-Phone') ?? $request->query('phone', ''))),
        );

        if (mb_strlen($offered) < 4) {
            return false;
        }

        return hash_equals(
            mb_substr((string) $order->customer_phone, -4),
            mb_substr($offered, -4),
        );
    }

    /**
     * Minutes from now until a promise, floored at zero.
     *
     * Negative would be arithmetically correct and useless: "ready in −6
     * minutes" is a screen telling a guest the restaurant is late, in the one
     * format nobody reads as an apology. Zero means "any moment", which is what
     * a late order looks like from the guest's side.
     */
    private function minutesUntil(?Carbon $moment): ?int
    {
        return $moment === null ? null : max(0, (int) ceil(now()->diffInMinutes($moment, false)));
    }

    private function trimmedOrNull(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        return trim($value) === '' ? null : trim($value);
    }
}
