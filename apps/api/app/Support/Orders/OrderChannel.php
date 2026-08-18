<?php

declare(strict_types=1);

namespace App\Support\Orders;

/**
 * How the guest is served, which decides which states a bill can reach and
 * whether the 10% service charge applies at all.
 *
 * DECISIONS Q2: the charge is dine-in only. The design file says so in its own
 * copy on the order-type screen — "olib ketishda xizmat haqi olinmaydi" — and
 * then adds it unconditionally in cartTotals() anyway. The copy is right.
 */
enum OrderChannel: string
{
    case DineIn = 'dine';
    case Delivery = 'delivery';
    case Pickup = 'pickup';

    /** DECISIONS Q2 — dine-in only, never on takeaway or delivery. */
    public function chargesService(): bool
    {
        return $this === self::DineIn;
    }

    /**
     * A delivery fee is a separate line and is outside the VAT base, which is
     * the design file's own note on the delivery form.
     */
    public function chargesDeliveryFee(): bool
    {
        return $this === self::Delivery;
    }
}
