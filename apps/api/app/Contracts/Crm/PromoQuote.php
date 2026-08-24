<?php

declare(strict_types=1);

namespace App\Contracts\Crm;

/**
 * What a word typed into a cart is worth, priced by the module that owns it.
 *
 * A quote and not a redemption: nothing has been spent when one of these is
 * made. It carries the arithmetic already done — `discountTiyin` is the figure
 * to take off the bill — because a caller that had to work the discount out for
 * itself would be a second place the percentage rounds, and two roundings of one
 * campaign disagree by a tiyin on about half of all baskets.
 *
 * `freeDelivery` is its own field rather than a `kind` a caller must branch on.
 * A free-delivery coupon is worth zero off the food and everything off the
 * carriage, and a caller that folded it into `discountTiyin` would show the
 * guest a discount on their kebab and then charge them for the courier anyway.
 */
final readonly class PromoQuote
{
    /**
     * @param string $code The code as stored — normalised, never as typed.
     * @param string $kind percent|fixed|free_delivery.
     * @param int $value Percent points for `percent`, tiyin for `fixed`.
     * @param int $discountTiyin Tiyin to take off the food, already capped at the basket.
     * @param bool $freeDelivery Whether the carriage is waived.
     * @param bool $personal True for a loyalty coupon this guest is holding,
     *                       false for a campaign anybody may type. The two are
     *                       spent differently and only the module knows which
     *                       table the row came from.
     */
    public function __construct(
        public string $code,
        public string $kind,
        public int $value,
        public int $discountTiyin,
        public bool $freeDelivery = false,
        public bool $personal = false,
        public ?string $title = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'code' => $this->code,
            'kind' => $this->kind,
            'value' => $this->value,
            'discount_tiyin' => $this->discountTiyin,
            'free_delivery' => $this->freeDelivery,
            'personal' => $this->personal,
            'title' => $this->title,
        ];
    }
}
