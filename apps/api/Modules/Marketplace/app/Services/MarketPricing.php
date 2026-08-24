<?php

declare(strict_types=1);

namespace Modules\Marketplace\Services;

/**
 * What a marketplace order comes to, and who each number belongs to.
 *
 * A pure calculator — integers in, integers out, no database and no request —
 * for the same reason `App\Support\Orders\BillTotals` is one: these figures are
 * printed on a guest's screen, itemised on a merchant's settlement, argued over
 * in a dispute and reconciled by an accountant. Four readers, one arithmetic,
 * and the only way they agree is for there to be one place it happens.
 *
 * ---------------------------------------------------------------------------
 * Two percentages, and they are not the same percentage
 *
 *   **3% service** — what the platform charges the GUEST. It is a separate line
 *   on the summary and it is NOT the restaurant's 10% service charge, which is
 *   dine-in only and never appears on a delivery. A guest who sees one "xizmat
 *   haqi" line and knows their restaurant does not charge for delivery service
 *   concludes they are being billed twice.
 *
 *   **9% commission** — what the platform keeps from the MERCHANT. It never
 *   appears on the guest's screen at all; it is the difference between what the
 *   food sold for and what the settlement pays out. Nine is the platform's own
 *   sales pitch — "Komissiya 9%, 27% emas".
 *
 * Both are stored on the order rather than looked up when a statement is drawn.
 * A rate change must never rewrite what somebody was already owed.
 *
 * ---------------------------------------------------------------------------
 * Order of operations, stated once
 *
 *   1. subtotal — the lines, at market prices
 *   2. discount comes off it, clamped to the subtotal
 *   3. service is 3% of what is left
 *   4. delivery is added last, outside the percentage — a Plus subscriber pays
 *      nothing, which is the whole subscription
 *   5. commission is 9% of the subtotal BEFORE the discount
 *
 * Step 5 is the one worth arguing about. The promo is the platform's marketing:
 * it funded the five thousand so'm, so the restaurant is paid on the full price
 * of the food it cooked and the commission is taken on the same figure. Taking
 * the commission after the discount would make the merchant co-fund a campaign
 * they never agreed to, and taking it before while paying them after would have
 * them fund it twice.
 *
 * Rounding is half-up on integers throughout, matching `percentOf()` in
 * `packages/surfaces/src/money/pricing.ts` — the function the cart screen uses
 * to show the guest the same numbers before they press the button. A tiyin of
 * disagreement between the two is a guest who was quoted one figure and charged
 * another.
 */
final readonly class MarketPricing
{
    /**
     * @param  int  $subtotal  Tiyin — the lines, at market prices.
     * @param  int  $discount  Tiyin, positive; it is subtracted.
     * @param  int  $serviceFee  Tiyin — the platform's cut from the guest.
     * @param  int  $deliveryFee  Tiyin — zero for a Plus subscriber.
     * @param  int  $total  Tiyin — what leaves the guest's card.
     * @param  int  $commission  Tiyin — the platform's cut from the merchant.
     * @param  int  $merchantDue  Tiyin — what the settlement pays out.
     */
    private function __construct(
        public int $subtotal,
        public int $discount,
        public int $serviceFee,
        public int $deliveryFee,
        public int $total,
        public int $commission,
        public int $merchantDue,
        public int $servicePercent,
        public int $commissionPercent,
    ) {}

    public static function of(
        int $subtotal,
        int $discount = 0,
        int $deliveryFee = 0,
        int $servicePercent = 3,
        int $commissionPercent = 9,
    ): self {
        /*
         * A discount cannot exceed the food. Clamped rather than refused: by
         * the time a total is being added up, zero is the only sane answer
         * left, and a negative total is a refund the platform never agreed to.
         */
        $applied = max(0, min($discount, $subtotal));
        $base = $subtotal - $applied;

        $serviceFee = $servicePercent > 0 ? self::percentOf($base, $servicePercent) : 0;

        // Commission on the undiscounted food — see the docblock.
        $commission = $commissionPercent > 0 ? self::percentOf($subtotal, $commissionPercent) : 0;

        return new self(
            subtotal: $subtotal,
            discount: $applied,
            serviceFee: $serviceFee,
            deliveryFee: max(0, $deliveryFee),
            total: $base + $serviceFee + max(0, $deliveryFee),
            commission: $commission,
            merchantDue: $subtotal - $commission,
            servicePercent: $servicePercent,
            commissionPercent: $commissionPercent,
        );
    }

    /**
     * A percentage of an amount, in whole tiyin, rounded half up.
     *
     * `intdiv($x * $p + 50, 100)` rather than `round($x * $p / 100)`: the second
     * goes through a float, and a float is the one thing this platform's money
     * rules forbid. The two agree for every figure a restaurant will ever see,
     * and the integer version agrees for every figure it will not.
     */
    public static function percentOf(int $amount, int $percent): int
    {
        return intdiv($amount * $percent + 50, 100);
    }

    /**
     * @return array<string, int>
     */
    public function toArray(): array
    {
        return [
            'subtotal_tiyin' => $this->subtotal,
            'discount_tiyin' => $this->discount,
            'service_fee_tiyin' => $this->serviceFee,
            'delivery_fee_tiyin' => $this->deliveryFee,
            'total_tiyin' => $this->total,
            'commission_tiyin' => $this->commission,
            'merchant_due_tiyin' => $this->merchantDue,
            'service_percent' => $this->servicePercent,
            'commission_percent' => $this->commissionPercent,
        ];
    }
}
