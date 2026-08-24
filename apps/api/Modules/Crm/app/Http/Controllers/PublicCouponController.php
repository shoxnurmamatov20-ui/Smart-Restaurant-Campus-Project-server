<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Modules\Crm\Http\Middleware\RequireCustomerToken;
use Modules\Crm\Http\Resources\CouponReservationResource;
use Modules\Crm\Http\Resources\CouponResource;
use Modules\Crm\Models\Coupon;
use Modules\Crm\Models\CouponReservation;
use Modules\Crm\Models\Customer;

/**
 * The loyalty shelf, and spending points on it.
 *
 * `apps/mobile/app/(customer)/customer/loyalty.tsx` carried the `TODO(api)`
 * against `POST /api/v1/public/coupons/{id}/reserve`: the screen listed three
 * fixture coupons and the button did nothing, so a balance of 2 480 points was
 * a number with no verb attached to it.
 *
 * ---------------------------------------------------------------------------
 * Points leave in the same transaction the coupon arrives in
 *
 * Both writes or neither. The failure this prevents is not theoretical — it is
 * the one every loyalty programme gets wrong once: points deducted, coupon row
 * not written, and a guest who paid for something they do not have. There is no
 * apology that fixes that, because the guest cannot prove it and the restaurant
 * cannot see it.
 *
 * `adjustPoints('redeem', ...)` is the only thing that moves a balance, and it
 * writes a `crm.loyalty_transactions` line as it goes — so the deduction has a
 * reason beside it rather than being a number that changed.
 *
 * ---------------------------------------------------------------------------
 * The double tap
 *
 * A button on a phone on one bar is pressed twice. Idempotency middleware
 * catches most of it, and the partial unique index on
 * `(tenant_id, coupon_id, customer_id) where redeemed_at is null` catches the
 * rest — including a retry that arrived with a fresh key. The refusal is
 * translated into `crm.coupon_already_held` rather than surfacing as a 500,
 * because from the guest's side "you already have this one" is the true answer.
 */
final class PublicCouponController extends Controller
{
    /** How long a reserved coupon stays usable before it goes back to nothing. */
    private const HOLD_DAYS = 30;

    /** GET /api/v1/public/coupons — the shelf, plus what this guest already holds. */
    public function index(Request $request): AnonymousResourceCollection
    {
        $guest = RequireCustomerToken::of($request);

        $held = $guest->couponReservations()
            ->whereNull('redeemed_at')
            ->pluck('coupon_id')
            ->all();

        $coupons = Coupon::query()->onShelf()->orderBy('sort_order')->orderBy('id')->get();

        return CouponResource::collection($coupons)->additional([
            'meta' => [
                'points' => $guest->points,
                /*
                 * Which of these the guest is already holding, as ids rather
                 * than as a flag on each row. The screen draws the same card
                 * either way and only changes the button, and a flag would mean
                 * the coupon resource's shape depended on who was reading it.
                 */
                'held_coupon_ids' => $held,
            ],
        ]);
    }

    /** POST /api/v1/public/coupons/{coupon}/reserve */
    public function reserve(Request $request, int $coupon): JsonResponse
    {
        $guest = RequireCustomerToken::of($request);

        $offer = Coupon::query()->onShelf()->whereKey($coupon)->first();

        if ($offer === null) {
            // Another restaurant's coupon, a withdrawn one and a mistyped id
            // are one answer: from this request none of them exists.
            throw ApiException::of('crm.coupon_not_found', field: 'coupon');
        }

        if ($guest->points < $offer->points_cost) {
            throw ApiException::of('crm.not_enough_points', meta: [
                'points' => $guest->points,
                'points_cost' => $offer->points_cost,
                'short_by' => $offer->points_cost - $guest->points,
            ]);
        }

        try {
            $reservation = DB::transaction(function () use ($guest, $offer): CouponReservation {
                /*
                 * The guest row is locked for the length of this transaction.
                 *
                 * Two taps arriving at two php-fpm workers would otherwise each
                 * read 2 480 points, each check they can afford a 1 200-point
                 * coupon, and each deduct — leaving 1 280 and two coupons paid
                 * for once. The unique index catches the second coupon; only
                 * the lock catches the second deduction.
                 */
                $locked = Customer::query()->whereKey($guest->getKey())->lockForUpdate()->firstOrFail();

                if ($locked->points < $offer->points_cost) {
                    throw ApiException::of('crm.not_enough_points', meta: [
                        'points' => $locked->points,
                        'points_cost' => $offer->points_cost,
                        'short_by' => $offer->points_cost - $locked->points,
                    ]);
                }

                if ($offer->points_cost > 0) {
                    $locked->adjustPoints(
                        kind: 'redeem',
                        points: $offer->points_cost,
                        note: 'coupon:'.$offer->key,
                    );
                }

                $reservation = CouponReservation::create([
                    'coupon_id' => $offer->getKey(),
                    'customer_id' => $locked->getKey(),
                    'code' => CouponReservation::mintCode(),
                    'points_spent' => $offer->points_cost,
                    /*
                     * The coupon's own end date wins when it is sooner. A hold
                     * that outlived the campaign would be a code the cart
                     * refuses with no explanation the guest can act on.
                     */
                    'expires_at' => $this->holdUntil($offer),
                ]);

                return $reservation;
            });
        } catch (QueryException $collision) {
            /*
             * The partial unique index refused a second live hold. Translated
             * rather than re-thrown: from the guest's side this is not a
             * failure, it is "you already have this one", and the reservation
             * they already hold is what the screen should show.
             */
            $existing = CouponReservation::query()
                ->where('customer_id', $guest->getKey())
                ->where('coupon_id', $offer->getKey())
                ->whereNull('redeemed_at')
                ->first();

            if ($existing === null) {
                throw $collision;
            }

            /*
             * `coupon_code`, not `code`. The envelope merges meta alongside its
             * four fixed keys, so a meta key called `code` overwrites the error
             * code itself — the client then branches on a coupon string it has
             * never heard of. Found by a test asserting the refusal and reading
             * back `SRH9AEGGDN`.
             */
            throw ApiException::of('crm.coupon_already_held', meta: ['coupon_code' => $existing->code]);
        }

        return response()->json([
            'data' => (new CouponReservationResource($reservation->load('coupon')))->resolve($request),
            'meta' => ['points' => $guest->refresh()->points],
        ], 201);
    }

    private function holdUntil(Coupon $offer): \DateTimeInterface
    {
        $default = now()->addDays(self::HOLD_DAYS);

        return $offer->ends_at !== null && $offer->ends_at->isBefore($default)
            ? $offer->ends_at
            : $default;
    }
}
