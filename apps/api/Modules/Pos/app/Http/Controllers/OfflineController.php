<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Contracts\Finance\TillLedger;
use App\Contracts\Menu\Dish;
use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\StopList;
use App\Contracts\Menu\StoppedDish;
use App\Contracts\Orders\BillRegistry;
use App\Contracts\Tables\FloorBoard;
use App\Http\Controllers\Controller;
use App\Support\Orders\OrderChannel;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Pos\Http\Controllers\Concerns\ResolvesTillContext;
use Modules\Pos\Http\Requests\SyncBatchRequest;
use Modules\Pos\Sync\ConflictKind;
use Modules\Pos\Sync\SyncDispatcher;

/**
 * Everything a till needs to keep selling with the router unplugged, in one call.
 *
 * Taken once when a person signs in and again whenever the network comes back.
 * The test of whether it is complete is blunt: pull the cable straight after this
 * response arrives, and the tablet must still be able to open a bill, price a
 * line, take cash, and know what it is not allowed to do — without asking this
 * server anything.
 *
 * ---------------------------------------------------------------------------
 * The price book is why the dishes come down keyed by id
 *
 * `GET /pos/menu` answers a screen: sections with their dishes inside them,
 * because that is what a waiter taps through. This answers a STORE, and a store
 * that repeated every dish once per channel would send the same Manti three
 * times and then have three prices to keep in step. So a dish appears once, and
 * each channel holds the ids under each heading.
 *
 * That price book is also what closes the loop with the replay. A queued
 * `bill.line.add` sends back the `unit_price` the guest was actually told, and
 * `SyncDispatcher` compares it against the catalogue's price now — which is the
 * whole `price_moved` conflict. A till with no local price to quote cannot raise
 * it, and a happy hour that ended during the outage silently reprices a meal
 * somebody already paid for.
 *
 * ---------------------------------------------------------------------------
 * Two things a till still cannot do offline, said out loud rather than faked
 *
 * There is no floor plan here, only the room's two counts. `FloorBoard` answers
 * a tally and nothing else on purpose, and a cashier holds no `tables.view`, so
 * the platform has no read that would give a till the list of tables. Offline,
 * a bill can carry the table label the waiter typed and not a table id.
 *
 * There are no modifier questions either. `MenuCatalog::questionsFor()` answers
 * one dish at a time — deliberately, because a live till opens that sheet for
 * maybe one line in five — and asking it for two hundred dishes here would be
 * two hundred queries to build one bootstrap. Both gaps need a contract to grow
 * a bulk read before this endpoint can close them.
 */
final class OfflineController extends Controller
{
    use ResolvesTillContext;

    /**
     * The channels a person standing at a till can start a sale on.
     *
     * `aggregator` is left out rather than forgotten: those orders arrive from
     * somebody else's platform over a network that is up, and a till with no
     * network is not receiving any. Sending a fourth copy of the board for them
     * would be weight on a bootstrap that a shift change waits for.
     *
     * @var list<string>
     */
    private const DEFAULT_CHANNELS = ['dine_in', 'takeaway', 'delivery'];

    public function __invoke(
        Request $request,
        MenuCatalog $menu,
        StopList $stops,
        FloorBoard $floor,
        TillLedger $till,
        BusinessDay $businessDay,
    ): JsonResponse {
        $validated = $request->validate([
            'channels' => ['sometimes', 'array', 'min:1', 'max:4'],
            'channels.*' => ['string', Rule::in(OrderChannel::values())],
        ]);

        /** @var list<string> $channels */
        $channels = array_values(array_unique($validated['channels'] ?? self::DEFAULT_CHANNELS));

        $terminal = $this->terminal($request);
        $session = $this->session($request);
        $tally = $floor->tally($terminal->branch_id);
        $branch = $terminal->branch;

        /*
         * The shift the queue will stamp its takings with.
         *
         * A cash sale rung up offline belongs to the drawer it was put in, and
         * the till has to name that drawer when it replays or the money lands in
         * whichever shift happens to be open when the network returns — which is
         * how the same notes get counted twice, once as last night's unexplained
         * surplus and once as today's revenue. This id is what a queued
         * `bill.tender` sends back as `shift_id`, and what raises the
         * `shift_closed` conflict when the two disagree.
         */
        $shiftId = $session->cash_shift_id ?? $till->openShiftFor((int) $session->user_id);

        return response()->json([
            'terminal' => [
                'code' => $terminal->code,
                'name' => $terminal->name,
                'mode' => $terminal->mode,
                // Not the whole settings blob: printer routing and the fiscal
                // serial are the server's business, and a till that does not hold
                // them cannot leak them off a stolen tablet.
                'cash_rounding_step' => $terminal->cashRoundingStep(),
                'discount_limits' => $terminal->settings['discount_limits'] ?? [],
            ],
            'restaurant' => [
                'name' => $terminal->tenant?->name,
                'slug' => $terminal->tenant?->slug,
            ],
            'branch' => $branch === null ? null : [
                'id' => $branch->id,
                'name' => $branch->name,
                'city' => $branch->city,
            ],
            'person' => [
                'user_id' => (int) $session->user_id,
                'name' => $session->user->name,
            ],
            'shift' => [
                'id' => $shiftId === null ? null : (int) $shiftId,
                'is_open' => $shiftId !== null,
            ],
            'menu' => $this->priceBook($menu, $channels),
            /*
             * The 86 sheet in full, not just the ids the board already flags.
             *
             * A waiter who cannot reach the server still has to answer "do you
             * have Manti", and "off since 19:40, back tomorrow" is a different
             * sentence from "off". The board carries `is_stopped` for drawing the
             * tile; this carries the reason for saying it out loud.
             *
             * Empty when the terminal is not pinned to a branch, because a stop
             * list is a fact about one kitchen and there is no restaurant-wide
             * answer to what is off tonight.
             */
            'stop_list' => array_map(
                static fn (StoppedDish $dish): array => $dish->toArray(),
                $stops->current(),
            ),
            'floor' => [
                'occupied_tables' => $tally->occupied,
                'free_tables' => $tally->free,
            ],
            'payment_methods' => $till->methods(),
            'sync' => [
                'endpoint' => url('/api/v1/pos/sync/batch'),
                'actions' => SyncDispatcher::ACTIONS,
                'max_batch' => SyncBatchRequest::maxBatch(),
                /*
                 * The six conflict screens, described rather than hard-coded.
                 *
                 * The ORDER of `options` is the contract: the first is what the
                 * screen should default to, and two of them are deliberately
                 * against the reflex — a stopped dish defaults to `keep` because
                 * the food was already cooked and carried out, and a closed shift
                 * defaults to `amend_closed` because the notes are in the drawer
                 * that has already been counted. A client that hard-codes its own
                 * order is a client that quietly gets both of those backwards.
                 */
                'conflicts' => array_map(static fn (ConflictKind $kind): array => [
                    'kind' => $kind->value,
                    'code' => $kind->code(),
                    'options' => $kind->options(),
                ], ConflictKind::cases()),
            ],
            'limits' => [
                'bills_per_table' => BillRegistry::BILLS_PER_TABLE,
            ],
            // Both stamped by the server so the queue is dated by the restaurant's
            // trading day rather than by a tablet whose clock nobody has checked
            // since it was unboxed.
            'business_date' => $businessDay->dateFor(),
            'server_time' => now()->toIso8601String(),
        ]);
    }

    /**
     * Every sellable dish once, and which heading it sits under on each channel.
     *
     * `board()` and not `sellable()`, the same choice `PosMenuController` makes:
     * a dish the kitchen has run out of comes down flagged rather than missing,
     * because a waiter shown a crossed-out tile knows the answer without walking
     * to the pass, where a silently absent one makes them think they misremembered
     * the menu.
     *
     * @param  list<string>  $channels
     * @return array<string, mixed>
     */
    private function priceBook(MenuCatalog $menu, array $channels): array
    {
        /** @var array<int, array<string, mixed>> $items */
        $items = [];
        $byChannel = [];

        foreach ($channels as $channel) {
            $sections = [];

            foreach ($menu->board($channel) as $section) {
                $ids = array_map(static fn (Dish $dish): int => $dish->id, $section->dishes);

                foreach ($section->dishes as $dish) {
                    $items[$dish->id] ??= $dish->toArray();
                }

                $sections[] = [
                    'id' => $section->id,
                    'slug' => $section->slug,
                    'title' => $section->title,
                    'item_ids' => $ids,
                ];
            }

            $byChannel[$channel] = $sections;
        }

        return [
            'items' => array_values($items),
            'channels' => $byChannel,
            // What a till would otherwise count itself, and get wrong the first
            // time a section is empty.
            'meta' => [
                'items' => count($items),
                'sections' => array_sum(array_map(
                    static fn (array $sections): int => count($sections),
                    $byChannel,
                )),
            ],
        ];
    }
}
