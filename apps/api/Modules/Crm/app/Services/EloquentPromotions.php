<?php

declare(strict_types=1);

namespace Modules\Crm\Services;

use App\Contracts\Crm\PromoQuote;
use App\Contracts\Crm\Promotions;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use Modules\Crm\Models\Coupon;
use Modules\Crm\Models\CouponReservation;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\PromoCode;
use Modules\Crm\Models\PromoRedemption;
use RuntimeException;

/**
 * CRM's answer to `App\Contracts\Crm\Promotions`.
 *
 * The two tables behind one field, joined here so that no caller has to know
 * there are two. A personal loyalty coupon is looked for first — those are
 * minted with an `SR` prefix, belong to one guest and are single-use — and the
 * campaign table answers everything else. `PublicPromoCodeController` reads the
 * same pair in the same order; the rule may only exist once, so both roads lead
 * through {@see PromoCodes} and through the coupon arithmetic below.
 *
 * ---------------------------------------------------------------------------
 * Why `quote()` swallows the refusals that `check` publishes
 *
 * `PromoCodes::evaluate()` throws five different `promo.*` refusals, each with a
 * sentence in three languages, and the cart's check button wants every one of
 * them. The ordering path wants none: it is asking "may I take this off", not
 * "why not", and a dinner refused at the last tap because a campaign expired
 * ninety seconds ago is a guest who eats somewhere else. So the exception is
 * caught here and turned into "worth nothing", and the caller charges full
 * price and reports what it charged.
 *
 * Only `ApiException` is caught. A database that is down must not read as a
 * discount of zero — that is a bug wearing a business rule's clothes.
 */
final class EloquentPromotions implements Promotions
{
    public function __construct(
        private readonly PromoCodes $promos,
        private readonly TenantContext $tenants,
    ) {}

    public function quote(string $code, ?int $customerId, int $subtotalTiyin): ?PromoQuote
    {
        $typed = trim($code);

        if ($typed === '' || $subtotalTiyin <= 0) {
            return null;
        }

        $reservation = $this->reservationFor($typed, $customerId);

        if ($reservation !== null) {
            return $this->quoteForCoupon($reservation, $subtotalTiyin);
        }

        try {
            $result = $this->promos->evaluate($typed, $subtotalTiyin, $this->guest($customerId));
        } catch (ApiException) {
            return null;
        }

        return new PromoQuote(
            code: $result['promo']->code,
            kind: $result['promo']->kind,
            value: (int) $result['promo']->value,
            discountTiyin: $result['discount'],
            title: $result['promo']->translate('title'),
        );
    }

    public function redeem(string $code, ?int $customerId, int $orderId, int $discountTiyin): void
    {
        $typed = trim($code);

        if ($typed === '') {
            throw new RuntimeException('Promo kod bo\'sh.');
        }

        $reservation = $this->reservationFor($typed, $customerId);

        if ($reservation !== null) {
            $this->spendCoupon($reservation, $orderId);

            return;
        }

        $promo = PromoCode::query()->where('code', PromoCode::normalise($typed))->first();

        if ($promo === null) {
            throw new RuntimeException("Promo kod topilmadi: {$typed}");
        }

        DB::transaction(function () use ($promo, $customerId, $orderId, $discountTiyin): void {
            /*
             * The redemption first, the counter second, and the order is what
             * makes the retry safe: the unique index on
             * `(tenant_id, promo_code_id, order_id)` fires before `used_count`
             * has moved, so a second attempt against the same bill leaves the
             * budget where it was. Bumping the counter first and inserting after
             * would spend one campaign twice on one dinner.
             */
            $already = PromoRedemption::query()
                ->where('promo_code_id', $promo->getKey())
                ->where('order_id', $orderId)
                ->exists();

            if ($already) {
                return;
            }

            PromoRedemption::create([
                'tenant_id' => $this->tenants->tenant()?->getKey(),
                'promo_code_id' => $promo->getKey(),
                'customer_id' => $customerId,
                'order_id' => $orderId,
                'discount_tiyin' => max(0, $discountTiyin),
            ]);

            // `increment` rather than a read-modify-write: two guests typing the
            // same code in the same second must not both read 41 and both write
            // 42, which is how a campaign with a budget of 50 gets used 90 times.
            $promo->newQuery()->whereKey($promo->getKey())->increment('used_count');
        });
    }

    // ============ Internals ============

    /**
     * A coupon this guest is holding, if that is what they typed.
     *
     * Scoped to the guest and not merely to the code, exactly as the check
     * endpoint scopes it: a reservation code is personal and single-use, and
     * looking it up by code alone would let anybody who read one over a shoulder
     * spend somebody else's points.
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

    private function quoteForCoupon(CouponReservation $reservation, int $subtotal): ?PromoQuote
    {
        $coupon = $reservation->coupon;

        if (! $coupon instanceof Coupon || $reservation->expires_at?->isPast() === true) {
            return null;
        }

        if ($subtotal < $coupon->min_tiyin) {
            return null;
        }

        return new PromoQuote(
            code: $reservation->code,
            kind: $coupon->kind,
            value: (int) $coupon->value,
            // Same arithmetic as `PublicPromoCodeController::answerForCoupon()`,
            // and `free_delivery` answers zero here for the reason stated there:
            // it is worth nothing off the food and everything off the carriage,
            // and reporting the fee as a food discount double-counts it the
            // moment the cart adds the fee back.
            discountTiyin: match ($coupon->kind) {
                'fixed' => min((int) $coupon->value, $subtotal),
                'percent' => min(intdiv($subtotal * (int) $coupon->value, 100), $subtotal),
                default => 0,
            },
            freeDelivery: $coupon->kind === 'free_delivery',
            personal: true,
            title: $coupon->translate('name'),
        );
    }

    /**
     * Stamp a personal coupon used, and say which bill used it.
     *
     * Conditional on `redeemed_at` still being null rather than on the read
     * above: between the lookup and the write a second request may have spent
     * it, and an unconditional update would let one coupon pay for two dinners.
     * The affected-row count is the lock.
     */
    private function spendCoupon(CouponReservation $reservation, int $orderId): void
    {
        $claimed = CouponReservation::query()
            ->whereKey($reservation->getKey())
            ->whereNull('redeemed_at')
            ->update(['redeemed_at' => now(), 'order_id' => $orderId]);

        if ($claimed === 0) {
            throw new RuntimeException('Bu kupon allaqachon ishlatilgan.');
        }
    }

    private function guest(?int $customerId): ?Customer
    {
        if ($customerId === null) {
            return null;
        }

        return Customer::query()->whereKey($customerId)->first();
    }
}
