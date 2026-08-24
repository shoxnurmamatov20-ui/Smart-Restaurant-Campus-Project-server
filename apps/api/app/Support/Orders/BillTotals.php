<?php

declare(strict_types=1);

namespace App\Support\Orders;

/**
 * What a bill adds up to, and the three rules that decide it.
 *
 * A pure calculator: integers in, integers out, no database and no request. It
 * is here rather than on the Eloquent model because these are the numbers a
 * receipt prints, a fiscal driver registers, a Z report reconciles and a
 * customer disputes — four callers, one arithmetic, and the only way to be sure
 * they agree is for there to be one place it happens.
 *
 * ---------------------------------------------------------------------------
 * The three rules, and why each is the way it is
 *
 * **VAT is extracted, never added** (Q1). Uzbek menu prices are what the guest
 * pays; 12% is already inside them. So a 45 000 dish is 45 000 on the receipt
 * with 4 821 of VAT *shown within it* — `total × 12 ÷ 112`, not `× 0.12`. Doing
 * it the other way inflates every price on the menu by 12% and the first guest
 * to add up their own bill finds it.
 *
 * **Service charge is dine-in only** (Q2). It pays for the table, the waiter
 * and the room. A takeaway has none of those and a delivery is already paying a
 * courier, so charging it there is charging for nothing — and it is the kind of
 * line a guest photographs.
 *
 * **The delivery fee sits outside VAT.** It is a transport service billed on,
 * not part of the food supply, so it joins the total after the tax is worked out
 * rather than being taxed again inside it.
 *
 * Order of operations matters and is stated once here: discount comes off the
 * subtotal first, service is charged on what is left, VAT is read out of that
 * sum, and the delivery fee is added last. Charging service on a pre-discount
 * subtotal quietly makes a 10% discount worth 9%.
 */
final readonly class BillTotals
{
    /**
     * DECISIONS Q1 — 12%, and it is already inside every price on the menu.
     *
     * A constant rather than only a default parameter, because a second caller
     * turned up needing the same number and had nowhere to read it from:
     * `FiscalRegistrar` has to state the VAT inside a tender when it cannot ask
     * the order, and it was about to reach for a config key nobody had written.
     * Two literal twelves in two modules is how a rate change becomes a tax
     * problem rather than an edit.
     */
    public const VAT_PERCENT = 12;

    /** DECISIONS Q2 — 10% of the discounted subtotal, dine-in only. */
    public const SERVICE_PERCENT = 10;

    /**
     * @param int $subtotal Sum of the lines, tiyin.
     * @param int $discount What came off, tiyin, as a positive number.
     * @param int $serviceCharge 10% of (subtotal − discount) on dine-in, else 0.
     * @param int $deliveryFee Tiyin. Outside VAT.
     * @param int $vat The tax already inside `total`, tiyin. Not added to it.
     * @param int $total What the guest pays, tiyin.
     */
    public function __construct(
        public int $subtotal,
        public int $discount,
        public int $serviceCharge,
        public int $deliveryFee,
        public int $vat,
        public int $total,
    ) {}

    /**
     * Work out a bill from its lines and its channel.
     *
     * @param int $subtotal Sum of the lines, tiyin.
     * @param int $discount Positive tiyin to take off.
     * @param int $servicePercent Whole percent, e.g. 10. Ignored off dine-in.
     * @param int $vatPercent Whole percent, e.g. 12. Already inside prices.
     */
    public static function of(
        int $subtotal,
        OrderChannel $channel,
        int $discount = 0,
        int $deliveryFee = 0,
        int $servicePercent = self::SERVICE_PERCENT,
        int $vatPercent = self::VAT_PERCENT,
    ): self {
        // A discount cannot exceed the food. Clamped rather than refused,
        // because the refusal belongs where the discount is applied — by the
        // time totals are being added up, the only sane answer is zero.
        $discount = max(0, min($discount, $subtotal));
        $taxableBase = $subtotal - $discount;

        /*
         * Service on the discounted base, and only where the channel charges it.
         *
         * `intdiv` rather than round: a service charge is money the restaurant
         * keeps, and rounding it up by a tiyin on every bill is a rounding
         * nobody can explain to a guest reading a receipt. Down is the side that
         * needs no explanation.
         */
        $serviceCharge = $channel->chargesService() && $servicePercent > 0
            ? intdiv($taxableBase * $servicePercent, 100)
            : 0;

        $taxable = $taxableBase + $serviceCharge;

        /*
         * VAT read out of the inclusive sum: total × p ÷ (100 + p).
         *
         * Rounded to the nearest tiyin, and this one rounds rather than
         * truncating because it is not money moving — it is a statement about
         * money that already moved, and the fiscal receipt has to reconcile
         * against the amount charged rather than against a floor of it.
         */
        $vat = $vatPercent > 0
            ? (int) round($taxable * $vatPercent / (100 + $vatPercent))
            : 0;

        return new self(
            subtotal: $subtotal,
            discount: $discount,
            serviceCharge: $serviceCharge,
            deliveryFee: $deliveryFee,
            // Outside the tax base — see the class note.
            vat: $vat,
            total: $taxable + $deliveryFee,
        );
    }

    /**
     * What a percentage off this bill comes to, in tiyin.
     *
     * Here rather than at the two call sites that need it, because they are a
     * screen and a receipt a guest reads side by side: a cashier taps "10%", the
     * till records so'm because that is what a manager signs for, and the
     * printer prints so'm. One conversion, in the class that owns the
     * arithmetic.
     *
     * Measured against the SUBTOTAL, never the total: the discount comes off
     * before the service charge goes on — see the order of operations above — so
     * a percentage of the total would quietly be worth more than it says.
     *
     * Floored, and {@see self::percentOf()} floors too, so the round trip is
     * honest: a 5% pick can never come back measuring more than 5%, and a role's
     * ceiling cannot be crossed by a rounding artefact.
     */
    public static function discountForPercent(int $subtotal, int $percent): int
    {
        if ($subtotal <= 0 || $percent <= 0) {
            return 0;
        }

        return intdiv($subtotal * min($percent, 100), 100);
    }

    /** What share of a bill an amount in tiyin represents, as whole percent. */
    public static function percentOf(int $subtotal, int $amount): int
    {
        return $subtotal <= 0 ? 100 : intdiv($amount * 100, $subtotal);
    }

    /**
     * @return array<string, int>
     */
    public function toArray(): array
    {
        return [
            'subtotal' => $this->subtotal,
            'discount' => $this->discount,
            'service_charge' => $this->serviceCharge,
            'delivery_fee' => $this->deliveryFee,
            // Named for what it is: tax already inside the total, not a line
            // added to it. A client that renders this as "+ VAT" is wrong, and
            // the key is what tells it so.
            'vat_included' => $this->vat,
            'total' => $this->total,
        ];
    }
}
