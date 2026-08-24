<?php

declare(strict_types=1);

namespace App\Support\Orders;

/**
 * How the guest is served, which decides which states a bill can reach and
 * whether the 10% service charge applies at all.
 *
 * The values are the DATABASE's, and that took a correction. This enum was
 * written from the design file's own vocabulary — `dine`, `delivery`, `pickup`
 * — while `orders.channel` has always stored `dine_in`, `takeaway`, `delivery`,
 * `aggregator`. Two names for one concept, in two places, with nothing
 * reconciling them: exactly the fault the state ladder was unified to remove,
 * one column over. It surfaced the moment something tried
 * `OrderChannel::from($order->channel)` and found that no real order could
 * construct one.
 *
 * Storage wins here rather than the file, and for once that is not a
 * concession: `channel` is a public API field with live rows behind it, the
 * file's list has no word for an aggregator order at all, and renaming the data
 * would buy nothing. `aggregator` reaches the same states as `delivery` —
 * somebody else's courier is still a courier — which is why the ladder needed
 * no new states for it.
 *
 * DECISIONS Q2: the service charge is dine-in only. The design file says so in
 * its own copy on the order-type screen — "olib ketishda xizmat haqi olinmaydi"
 * — and then adds it unconditionally in cartTotals() anyway. The copy is right.
 */
enum OrderChannel: string
{
    case DineIn = 'dine_in';
    case Takeaway = 'takeaway';
    case Delivery = 'delivery';
    case Aggregator = 'aggregator';

    /** DECISIONS Q2 — dine-in only, never on takeaway or delivery. */
    public function chargesService(): bool
    {
        return $this === self::DineIn;
    }

    /**
     * A delivery fee is a separate line and is outside the VAT base, which is
     * the design file's own note on the delivery form.
     *
     * Delivery only, not aggregator: on an aggregator order the fee is the
     * aggregator's, charged to the guest by them and never seen by this till.
     * Billing it here would charge the guest twice.
     */
    public function chargesDeliveryFee(): bool
    {
        return $this === self::Delivery;
    }

    /**
     * The four values, for a validation rule or a column comment.
     *
     * Three places carried this list by hand — two models and a form request —
     * which is three chances for a fifth channel to be added to some of them.
     * Any list two things must agree on belongs to whichever of them owns the
     * concept, and a channel is what this enum is.
     *
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $channel): string => $channel->value, self::cases());
    }

    /** Whether the food leaves the building, which is what a courier state means. */
    public function isDelivered(): bool
    {
        return $this === self::Delivery || $this === self::Aggregator;
    }
}
