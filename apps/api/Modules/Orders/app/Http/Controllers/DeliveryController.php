<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Errors\ApiException;
use App\Support\Orders\OrderChannel;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Orders\Models\Delivery;
use Modules\Orders\Models\Order;

/**
 * Dispatch, at the size a guest and a dispatcher actually need.
 *
 * Two doors. `board()` answers the console's "Yetkazish" tab — who is out and
 * what is waiting for somebody — and `assign()` puts one order on one rider.
 * Between them they are the whole of what `PublicOrderController` was missing
 * when it wrote `'courier' => null` and explained that "a dispatch module does
 * not exist".
 *
 * ---------------------------------------------------------------------------
 * A courier is a platform user, not a Staff row
 *
 * `RolesAndPermissionsSeeder` has seeded a `courier` role since it was written
 * — "faqat o'z yetkazmalari" — and roles live in `public.*`, which Orders may
 * read. `staff.staff_members` is the module Orders may not touch, and reaching
 * for it to get a job title would have been a boundary crossing for a word this
 * platform already stores somewhere legal.
 *
 * It also happens to be the more correct model: a rider who carries for three
 * restaurants signs in as themselves, and what makes them a courier here is the
 * role this restaurant granted them, not a personnel file.
 */
final class DeliveryController extends Controller
{
    /**
     * How long a rider's last ping stays interesting.
     *
     * Past it the board shows them as `free` rather than `onway`: a scooter
     * that has not reported in twenty minutes is a phone that lost signal or a
     * shift that ended, and drawing them as mid-delivery is how a dispatcher
     * waits for somebody who went home.
     */
    private const STALE_PING_MINUTES = 20;

    /**
     * Who is out, and what nobody has picked up.
     *
     * One request rather than two, because the answer is one screen and the two
     * halves are read against each other: three unassigned orders matter only
     * beside the number of riders standing free.
     */
    public function board(BranchContext $branches): JsonResponse
    {
        $branchId = $branches->id();

        return response()->json([
            'data' => [
                'couriers' => $this->couriers(),
                'unassigned' => $this->unassigned($branchId),
            ],
        ]);
    }

    /**
     * One rider's round: what they are carrying, in the order they should drop it.
     *
     * The courier app's home screen, and the one endpoint on this controller
     * whose answer is about the caller. `courier_user_id` is taken from the
     * token and never from the request — a rider who could name an id could read
     * another rider's evening, and there is no reason they would ever need to.
     *
     * ------------------------------------------------------------------------
     * What a rider sees of the guest, and what they do not
     *
     * The full phone number, deliberately. A courier standing outside a block of
     * flats with no doorbell has to ring the guest, and `phone_masked` — which is
     * what the GUEST is shown of the RIDER — would leave them knocking. The
     * masking rule runs the other way: a guest may not have a courier's personal
     * number, because the delivery ends and the number does not.
     *
     * The address, the landmark and the money owed. Not the guest's order
     * history, not their name in CRM, not their other addresses: a phone that
     * gets left on a scooter seat carries exactly one evening's worth of
     * somebody's data.
     *
     * ------------------------------------------------------------------------
     * Why `payment_state` rather than `payment_method` alone
     *
     * "Cash on delivery" and "cash on delivery, already paid online because the
     * guest changed their mind" look identical on a method column, and the
     * difference is a rider asking a guest for money they have already handed
     * over. `collect_tiyin` is the figure to ask for, and it is zero when the
     * bill is settled.
     */
    public function mine(Request $request): JsonResponse
    {
        /** @var User $rider */
        $rider = $request->user();

        $round = Delivery::query()
            ->live()
            ->where('courier_user_id', $rider->getKey())
            ->with('order')
            /*
             * Oldest first, which is the order to drop them in.
             *
             * Not by distance — this platform has no routing engine and
             * pretending otherwise would have a rider trusting an ordering that
             * is really just the id sequence. Assignment order at least matches
             * what the dispatcher was thinking.
             */
            ->orderBy('assigned_at')
            ->limit(50)
            ->get();

        return response()->json([
            'data' => $round->map(function (Delivery $delivery): array {
                $order = $delivery->order;

                return [
                    'id' => (int) $delivery->getKey(),
                    'status' => (string) $delivery->status,
                    'assigned_at' => $delivery->assigned_at?->toIso8601String(),
                    'picked_at' => $delivery->picked_at?->toIso8601String(),
                    'order' => $order === null ? null : [
                        'id' => (int) $order->getKey(),
                        'number' => (string) $order->number,
                        'placed_at' => $order->placed_at?->toIso8601String(),
                        'promised_at' => $order->promised_at?->toIso8601String(),
                        'customer_name' => $order->customer_name,
                        'customer_phone' => $order->customer_phone,
                        'address' => $order->delivery_address,
                        'address_note' => $order->delivery_note,
                        'lat' => $order->delivery_lat,
                        'lng' => $order->delivery_lng,
                        'total_tiyin' => (int) $order->total,
                        'payment_method' => $order->payment_method,
                        'payment_state' => $order->payment_state,
                        // What to ask for at the door, and nothing to ask for
                        // when the money already arrived.
                        'collect_tiyin' => $order->payment_state === 'paid' ? 0 : (int) $order->total,
                    ],
                ];
            })->all(),
        ]);
    }

    /**
     * Put this order on that rider.
     *
     * Reassignment is the same call: a rider who broke down hands the bag over,
     * and the row is updated rather than duplicated — see the migration for why
     * a handover lives in the activity log rather than in a second row.
     *
     * `orders.manage` rather than `orders.update`: adding a dish to a bill and
     * deciding whose evening carries it are different powers, and every waiter
     * and cashier on the floor holds the first one.
     */
    public function assign(Request $request, Order $order): JsonResponse
    {
        $validated = $request->validate([
            'courier_user_id' => ['required', 'integer', 'min:1'],
        ]);

        /*
         * A delivery is a delivery. Assigning a rider to a dine-in bill is a
         * request that cannot mean anything — the food is going to a table
         * twelve metres away — and quietly accepting it would put a phantom row
         * on the dispatch board that never resolves.
         */
        $channel = OrderChannel::tryFrom((string) $order->channel);

        if ($channel === null || ! $channel->isDelivered()) {
            throw ApiException::of('delivery.not_deliverable', field: 'order');
        }

        if (! $order->is_open) {
            throw ApiException::of('delivery.order_closed', field: 'order');
        }

        $courier = $this->courierOrFail((int) $validated['courier_user_id']);

        $delivery = DB::transaction(function () use ($order, $courier): Delivery {
            /** @var Delivery|null $existing */
            $existing = Delivery::query()->live()->lockForUpdate()
                ->where('order_id', $order->getKey())
                ->first();

            if ($existing !== null) {
                // A handover, not a new trip. `assigned_at` is left where it
                // was: the clock a late-delivery argument runs on started when
                // the first rider took it, not when the second one did.
                $existing->forceFill(['courier_user_id' => $courier->getKey()])->save();

                return $existing;
            }

            return Delivery::create([
                'branch_id' => $order->branch_id,
                'order_id' => $order->getKey(),
                'courier_user_id' => $courier->getKey(),
                'status' => 'assigned',
                'assigned_at' => now(),
            ]);
        });

        return response()->json(['data' => $this->payload($delivery->refresh(), $courier)], 201);
    }

    // ============ Reading ============

    /**
     * This restaurant's riders, with what each is carrying.
     *
     * Two queries and no N+1: the people, then one grouped count over the live
     * rows and one over today's finished ones. A dispatcher's board is refreshed
     * every few seconds and a query per rider is what makes that expensive.
     *
     * @return array<int, array<string, mixed>>
     */
    private function couriers(): array
    {
        /*
         * Scoped by hand — `public.users` carries no global tenant scope, for
         * the reason its own docblock gives: identity is what discovers the
         * tenant. Every other read on this controller is scoped for free.
         */
        /** @var Collection<int, User> $people */
        $people = User::query()
            ->where('tenant_id', app(TenantContext::class)->id())
            ->where('is_active', true)
            ->whereHas('roles', fn ($query) => $query->where('name', 'courier'))
            ->orderBy('name')
            ->get();

        if ($people->isEmpty()) {
            return [];
        }

        $ids = $people->modelKeys();

        /*
         * Two figures from one scan, and the second one is why the scan is not
         * filtered to live rows.
         *
         * `carrying` counts only what a rider still has; `seen_at` is their last
         * ping on ANY delivery, which is what tells a rider heading back to the
         * kitchen apart from one who has gone home. Filtering the whole query to
         * live rows would make `returning` unreachable — a rider with nothing
         * live has no live row to have pinged from.
         */
        $live = Delivery::query()
            ->whereIn('courier_user_id', $ids)
            ->toBase()
            ->selectRaw('courier_user_id')
            ->selectRaw(sprintf(
                "count(*) filter (where status in ('%s'))::bigint as carrying",
                implode("', '", Delivery::LIVE_STATUSES),
            ))
            ->selectRaw('max(last_seen_at) as seen_at')
            ->groupBy('courier_user_id')
            ->get()
            ->keyBy('courier_user_id');

        $done = Delivery::query()
            ->where('status', 'delivered')
            ->whereIn('courier_user_id', $ids)
            // Ranged rather than `whereDate` — see ModuleBoundaryTest, which
            // refuses that function by name for killing the index.
            ->where('delivered_at', '>=', now()->startOfDay())
            ->toBase()
            ->selectRaw('courier_user_id')
            ->selectRaw('count(*)::bigint as dropped')
            ->groupBy('courier_user_id')
            ->get()
            ->keyBy('courier_user_id');

        return $people->map(function (User $person) use ($live, $done): array {
            $carrying = (int) ($live[$person->getKey()]->carrying ?? 0);
            $seenAt = $live[$person->getKey()]->seen_at ?? null;

            return [
                'user_id' => (int) $person->getKey(),
                'name' => (string) $person->name,
                'phone' => $person->phone,
                'state' => $this->stateOf($carrying, $seenAt),
                'active' => $carrying,
                'delivered_today' => (int) ($done[$person->getKey()]->dropped ?? 0),
            ];
        })->all();
    }

    /**
     * Three words, from two facts.
     *
     * `returning` is the one worth explaining: a rider with nothing left to
     * carry who pinged recently is on their way back to the kitchen, and a
     * dispatcher holding an order for ninety seconds rather than sending it to
     * somebody standing outside is the whole reason the distinction is drawn.
     */
    private function stateOf(int $carrying, mixed $seenAt): string
    {
        if ($carrying > 0) {
            return 'onway';
        }

        if ($seenAt === null) {
            return 'free';
        }

        $recent = now()->subMinutes(self::STALE_PING_MINUTES);

        return Carbon::parse((string) $seenAt)->greaterThan($recent)
            ? 'returning'
            : 'free';
    }

    /**
     * Orders that are going somewhere and have nobody to take them.
     *
     * A left join rather than `whereNotExists` with a subquery per row, and
     * ordered oldest first for the same reason the waiter-call board is: the
     * order that has been waiting longest is the one a dispatcher must place,
     * and any other sort teaches them to serve whoever ordered most recently.
     *
     * @return array<int, array<string, mixed>>
     */
    private function unassigned(?int $branchId): array
    {
        $now = now();

        return Order::query()
            ->where('channel', OrderChannel::Delivery->value)
            ->whereNotIn('status', ['paid', 'voided', 'refunded', 'comped', 'draft'])
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->whereDoesntHave('deliveries', fn ($query) => $query->whereIn('status', Delivery::LIVE_STATUSES))
            ->orderBy('placed_at')
            ->limit(50)
            ->get()
            ->map(fn (Order $order): array => [
                'order_id' => (int) $order->getKey(),
                'number' => (string) $order->number,
                'address' => $order->delivery_address,
                'total_tiyin' => (int) $order->total,
                'waiting_minutes' => $order->placed_at === null
                    ? 0
                    : max(0, (int) $order->placed_at->diffInMinutes($now)),
            ])
            ->all();
    }

    /**
     * The rider named in the request, or a refusal a dispatcher can read.
     *
     * The role is checked here rather than by an `exists:` rule, because the
     * question is not "is there a user 41" — it is "does THIS restaurant have a
     * courier 41, and are they still active". A rule in a form request cannot
     * ask either half.
     */
    private function courierOrFail(int $userId): User
    {
        /*
         * Scoped by hand, because `public.users` is the one table with no
         * global tenant scope: identity is what DISCOVERS the tenant, so
         * scoping it would make signing in impossible (see the User model's own
         * note). Every other read on this controller is scoped for free; this
         * one has to say so, and forgetting it would let a dispatcher hand an
         * order to a rider at another restaurant.
         */
        /** @var User|null $courier */
        $courier = User::query()
            ->where('tenant_id', app(TenantContext::class)->id())
            ->where('is_active', true)
            ->whereHas('roles', fn ($query) => $query->where('name', 'courier'))
            ->find($userId);

        if ($courier === null) {
            throw ApiException::of('delivery.courier_unknown', field: 'courier_user_id');
        }

        return $courier;
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(Delivery $delivery, User $courier): array
    {
        return [
            'id' => (int) $delivery->getKey(),
            'order_id' => (int) $delivery->order_id,
            'status' => $delivery->status,
            'courier' => [
                'user_id' => (int) $courier->getKey(),
                'name' => (string) $courier->name,
                'phone' => $courier->phone,
            ],
            'assigned_at' => $delivery->assigned_at?->toIso8601String(),
            'picked_at' => $delivery->picked_at?->toIso8601String(),
            'delivered_at' => $delivery->delivered_at?->toIso8601String(),
        ];
    }
}
