<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Modules\Crm\Http\Middleware\RequireCustomerToken;
use Modules\Crm\Http\Requests\CheckPromoCodeRequest;
use Modules\Crm\Models\Coupon;
use Modules\Crm\Models\CouponReservation;
use Modules\Crm\Services\PromoCodes;

/**
 * "OSH15" typed into a cart — POST public/promo-codes/check.
 *
 * A check, not a redemption. Nothing is spent here and nothing is written: the
 * cart asks on every keystroke of the promo field, and an endpoint that
 * consumed a campaign's budget per keystroke would empty it before anybody
 * ordered. The redemption happens when the bill is settled, against the same
 * rules, in the transaction that takes the money.
 *
 * ---------------------------------------------------------------------------
 * Two kinds of string arrive in the same box
 *
 * A guest cannot tell a campaign code from a loyalty coupon, and should not
 * have to: both are words on a screen that make the total go down. So this
 * looks for a coupon reservation first — those are minted with an `SR` prefix
 * and are personal — and falls through to the campaign table. One field, one
 * endpoint, and the difference stays the server's problem.
 */
final class PublicPromoCodeController extends Controller
{
    public function __invoke(CheckPromoCodeRequest $request, PromoCodes $promos): JsonResponse
    {
        $guest = RequireCustomerToken::optional($request);
        $typed = trim((string) $request->string('code'));
        $subtotal = $request->integer('subtotal_tiyin');

        $reserved = $this->reservationFor($typed, $guest?->getKey());

        if ($reserved !== null) {
            return $this->answerForCoupon($reserved, $subtotal);
        }

        $result = $promos->evaluate($typed, $subtotal, $guest);

        return response()->json([
            'data' => [
                'code' => $result['promo']->code,
                'kind' => $result['promo']->kind,
                'value' => $result['promo']->value,
                'title' => $result['promo']->translate('title'),
                'discount_tiyin' => $result['discount'],
            ],
        ]);
    }

    /**
     * A coupon this guest is holding, if that is what they typed.
     *
     * Scoped to the guest and not merely to the code. A reservation code is
     * personal and single-use; looking it up by code alone would let anybody
     * who saw one over a shoulder spend somebody else's points.
     */
    private function reservationFor(string $typed, ?int $customerId): ?CouponReservation
    {
        if ($customerId === null) {
            return null;
        }

        return CouponReservation::query()
            ->where('code', mb_strtoupper($typed))
            ->where('customer_id', $customerId)
            ->whereNull('redeemed_at')
            ->with('coupon')
            ->first();
    }

    private function answerForCoupon(CouponReservation $reservation, int $subtotal): JsonResponse
    {
        $coupon = $reservation->coupon;

        if ($coupon === null || $reservation->expires_at?->isPast() === true) {
            throw ApiException::of('promo.expired', field: 'code');
        }

        if ($subtotal < $coupon->min_tiyin) {
            throw ApiException::of('promo.min_not_met', field: 'code', meta: [
                'min_tiyin' => $coupon->min_tiyin,
                'short_by_tiyin' => $coupon->min_tiyin - $subtotal,
            ]);
        }

        /*
         * `free_delivery` is worth nothing off the food line and everything off
         * the delivery line, so it answers zero here and says what it is. A
         * coupon that reported the delivery fee as a discount on the food would
         * be double-counted the moment the cart added the fee back.
         */
        $discount = match ($coupon->kind) {
            'fixed' => min($coupon->value, $subtotal),
            'percent' => min(intdiv($subtotal * $coupon->value, 100), $subtotal),
            default => 0,
        };

        return response()->json([
            'data' => [
                'code' => $reservation->code,
                'kind' => $coupon->kind,
                'value' => $coupon->value,
                'title' => $coupon->translate('name'),
                'discount_tiyin' => $discount,
                'free_delivery' => $coupon->kind === 'free_delivery',
            ],
        ]);
    }
}
