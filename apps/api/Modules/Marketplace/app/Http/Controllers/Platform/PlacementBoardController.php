<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Marketplace\Models\Placement;

/**
 * Every banner sold on the marketplace, and what it earned.
 *
 * The operator's side of `MerchantPlacementController`: a merchant sees their
 * own bookings and a queue position; the platform sees the whole hoarding and
 * the revenue. Cross-tenant in the ordinary platform-console way — the operator
 * bypasses the policies, so no `withoutTenancy()` appears here.
 *
 * `revenue_tiyin` counts what has actually been BILLED rather than what was
 * booked. A week of banners sold on Friday is not revenue until
 * `marketplace:settle` has subtracted it from a payout, and a dashboard that
 * counted the booking would show money that a cancellation then takes away
 * again.
 */
final class PlacementBoardController extends Controller
{
    private const MAX_PER_PAGE = 100;

    /** GET /api/v1/platform/marketplace/placements */
    public function __invoke(Request $request): JsonResponse
    {
        $query = Placement::query()
            ->with('store')
            ->when(
                $request->filled('slot'),
                fn ($builder) => $builder->where('slot', (string) $request->string('slot')),
            )
            ->when(
                $request->filled('state'),
                fn ($builder) => $builder->where('state', (string) $request->string('state')),
            );

        $page = (clone $query)
            ->orderByDesc('starts_on')
            ->orderBy('id')
            ->paginate(min($request->integer('per_page', 25), self::MAX_PER_PAGE))
            ->withQueryString();

        return response()->json([
            'data' => array_map(static function (Placement $placement): array {
                $store = $placement->store;

                return [
                    'id' => $placement->id,
                    'slot' => $placement->slot,
                    'starts_on' => $placement->starts_on->toDateString(),
                    'ends_on' => $placement->ends_on->toDateString(),
                    'days' => $placement->days,
                    'day_rate_tiyin' => $placement->day_rate_tiyin,
                    'total_tiyin' => $placement->total_tiyin,
                    'billed_tiyin' => $placement->billed_tiyin,
                    'state' => $placement->state,
                    'store' => $store === null ? null : [
                        'id' => $store->id,
                        'name' => $store->name,
                        'slug' => $store->slug,
                    ],
                ];
            }, $page->items()),
            'meta' => [
                'total' => $page->total(),
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'revenue_tiyin' => (int) (clone $query)->sum('billed_tiyin'),
                'slots' => array_map(static fn (string $slot): array => [
                    'slot' => $slot,
                    'day_rate_tiyin' => Placement::DAY_RATE_TIYIN[$slot],
                ], Placement::SLOTS),
            ],
        ]);
    }
}
