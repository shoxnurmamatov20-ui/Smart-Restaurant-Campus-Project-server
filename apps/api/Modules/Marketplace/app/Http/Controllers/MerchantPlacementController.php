<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\DatabaseTenancy;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Marketplace\Http\Requests\StorePlacementRequest;
use Modules\Marketplace\Http\Resources\PlacementResource;
use Modules\Marketplace\Models\Placement;
use Modules\Marketplace\Models\Store;

/**
 * Buying the banner at the top of the marketplace.
 *
 * The only thing this platform sells by the DAY. A promotion spends a budget as
 * guests use a code; a placement holds a slot on a date whether or not anybody
 * taps it, is queued behind whoever booked it first, and is billed inside the
 * weekly statement — `marketplace:settle` subtracts it from the payout, which is
 * why `Placement::unbilled()` exists and why a banner cancelled on Wednesday
 * costs three days rather than seven.
 *
 * ---------------------------------------------------------------------------
 * The queue is counted, not stored
 *
 * "You are fourth in line for Friday" is a fact about the bookings other
 * restaurants hold, and it changes when one of them cancels. Storing it on this
 * row would freeze somebody else's answer here; so it is counted, and counting
 * it is the one place in this controller that has to look across tenants — a
 * merchant cannot see another restaurant's booking, and must still be told that
 * the date is taken.
 */
final class MerchantPlacementController extends Controller
{
    public function __construct(private readonly DatabaseTenancy $database) {}

    /** GET /api/v1/marketplace/placements — what this shop has bought. */
    public function index(Request $request): JsonResponse
    {
        $placements = Placement::query()
            ->orderByDesc('starts_on')
            ->limit(60)
            ->get();

        return response()->json([
            'data' => $placements->map(
                fn (Placement $placement): array => (new PlacementResource(
                    $placement,
                    $this->queuePosition($placement->slot, $placement->starts_on->toImmutable(), $placement->id),
                ))->resolve($request),
            )->all(),
            'meta' => [
                /*
                 * The price list, sent with the list rather than hard-coded in
                 * the client. A merchant panel that printed its own day rate
                 * would quote yesterday's price to somebody about to buy.
                 */
                'slots' => array_map(static fn (string $slot): array => [
                    'slot' => $slot,
                    'day_rate_tiyin' => Placement::DAY_RATE_TIYIN[$slot],
                ], Placement::SLOTS),
                'max_days' => Placement::MAX_DAYS,
            ],
        ]);
    }

    /** POST /api/v1/marketplace/placements — book one. */
    public function store(StorePlacementRequest $request): JsonResponse
    {
        $store = Store::query()->first();

        if ($store === null) {
            throw ApiException::of('marketplace.no_storefront');
        }

        $slot = (string) $request->string('slot');
        $starts = CarbonImmutable::parse((string) $request->string('starts_on'))->startOfDay();
        $days = $request->integer('days');
        $ends = $starts->addDays($days - 1);

        /*
         * The same shop cannot hold the same slot from the same date twice. The
         * unique index says so too; this catches it before the 500 and answers
         * the merchant in their own language.
         */
        $already = Placement::query()
            ->where('store_id', $store->id)
            ->where('slot', $slot)
            ->where('starts_on', $starts->toDateString())
            ->live()
            ->exists();

        if ($already) {
            throw ApiException::of('marketplace.placement_already_booked', field: 'starts_on');
        }

        $rate = Placement::DAY_RATE_TIYIN[$slot];

        $placement = Placement::create([
            'store_id' => $store->id,
            'slot' => $slot,
            'starts_on' => $starts->toDateString(),
            'ends_on' => $ends->toDateString(),
            'days' => $days,
            // Snapshotted, like a store's commission is snapshotted on an
            // order: a price raised in March must not change February's bill.
            'day_rate_tiyin' => $rate,
            'total_tiyin' => $rate * $days,
            'state' => 'booked',
        ]);

        return response()->json([
            'data' => (new PlacementResource(
                $placement,
                $this->queuePosition($slot, $starts, $placement->id),
            ))->resolve($request),
        ], 201);
    }

    /**
     * DELETE /api/v1/marketplace/placements/{placement} — release it.
     *
     * Cancelled and not deleted. The days that have already run are owed, and
     * `marketplace:settle` reads `unbilled()` off this row to charge for them —
     * a deleted booking would be a banner shown for three days and billed for
     * none, and the merchant screen's own copy promises the opposite.
     */
    public function destroy(Request $request, Placement $placement): JsonResponse
    {
        if ($placement->state === 'cancelled') {
            throw ApiException::of('marketplace.placement_not_live', meta: ['state' => $placement->state]);
        }

        /*
         * Billed to yesterday, not to the end of the run. A merchant who
         * releases a banner on the third of seven days pays for the days it was
         * on air; the rest is given back by rewriting `total_tiyin` down before
         * the settlement ever reads it.
         */
        $today = CarbonImmutable::now()->startOfDay();
        $ran = $placement->starts_on->toImmutable()->startOfDay()->greaterThan($today)
            ? 0
            : min($placement->days, $placement->starts_on->toImmutable()->startOfDay()->diffInDays($today) + 1);

        $placement->forceFill([
            'state' => 'cancelled',
            'days' => $ran,
            'total_tiyin' => $placement->day_rate_tiyin * $ran,
            'ends_on' => $ran === 0
                ? $placement->starts_on->toDateString()
                : $placement->starts_on->toImmutable()->addDays($ran - 1)->toDateString(),
        ])->save();

        return response()->json(['data' => (new PlacementResource($placement, null))->resolve($request)]);
    }

    /**
     * How many other restaurants already hold this slot on this date.
     *
     * The one cross-tenant read in the merchant panel, and it is deliberately
     * the narrowest one possible: a COUNT of overlapping bookings, never a row,
     * never a name. A merchant learns that Friday is busy and nothing about who
     * is on it — which is the same thing a hoarding company tells a customer.
     *
     * `withoutTenancy()` is what `StorefrontDirectory` guards for the consumer
     * side; used here directly because the answer is a scalar and wrapping a
     * count in a service that returns models would be more indirection than the
     * question deserves.
     */
    private function queuePosition(string $slot, CarbonImmutable $starts, int $exceptId): int
    {
        return $this->database->withoutTenancy(static fn (): int => Placement::query()
            ->withoutGlobalScopes()
            ->where('slot', $slot)
            ->live()
            ->whereKeyNot($exceptId)
            ->where('starts_on', '<=', $starts->toDateString())
            ->where('ends_on', '>=', $starts->toDateString())
            ->count());
    }
}
