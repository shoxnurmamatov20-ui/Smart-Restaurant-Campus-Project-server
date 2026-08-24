<?php

declare(strict_types=1);

namespace Modules\Crm\Services;

use App\Support\Errors\ApiException;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\PromoCode;

/**
 * Deciding whether a word typed into a cart is worth anything.
 *
 * The customer app has been answering this in the browser: `PROMO_CODES` maps
 * three strings to three percentages and `PROMO_MINIMUM` is the floor. Its own
 * docblock states why that is a fixture and not an implementation — "a client
 * that decides its own discount decides its own price".
 *
 * ---------------------------------------------------------------------------
 * Why every refusal is an error rather than a `{valid: false}` body
 *
 * Because the guest has to be told which one it is, in their own language, and
 * the platform already has exactly one mechanism for that: the error envelope
 * carries a stable code and three sentences. A boolean plus a reason string
 * would mean the cart holds its own copy of five refusals in three languages —
 * fifteen strings that drift the first time a campaign rule changes.
 *
 * The codes are `promo.*` rather than `crm.*` deliberately: a promo code is
 * redeemed at a till and in a cart and eventually in the marketplace, and the
 * word a client branches on should name the thing, not the module that happens
 * to own the table this month.
 *
 * ---------------------------------------------------------------------------
 * The order of the checks is the order a guest can act on
 *
 * Unknown, then switched off, then out of window, then spent, then already used
 * by this guest, and the basket floor LAST. The floor is the only refusal a
 * guest can do something about — add a drink and try again — so it must not be
 * hidden behind "this campaign ended last week".
 */
final class PromoCodes
{
    /**
     * What this code takes off this basket, or a refusal saying why not.
     *
     * @return array{promo: PromoCode, discount: int}
     */
    public function evaluate(string $code, int $subtotal, ?Customer $guest): array
    {
        $promo = PromoCode::query()
            ->where('code', PromoCode::normalise($code))
            ->first();

        if ($promo === null) {
            /*
             * Tenant isolation comes free here: `BelongsToTenant` scopes the
             * query and PostgreSQL's policy scopes it again, so another
             * restaurant's `OSH15` is not "forbidden" — from this request it
             * does not exist, which is also the only answer that does not turn
             * this endpoint into a way to enumerate other restaurants'
             * campaigns.
             */
            throw ApiException::of('promo.not_found', field: 'code');
        }

        if (! $promo->is_active) {
            throw ApiException::of('promo.inactive', field: 'code');
        }

        $now = now();

        if ($promo->starts_at !== null && $promo->starts_at->isAfter($now)) {
            throw ApiException::of('promo.not_started', field: 'code', meta: [
                'starts_at' => $promo->starts_at->toIso8601String(),
            ]);
        }

        if ($promo->ends_at !== null && $promo->ends_at->isBefore($now)) {
            throw ApiException::of('promo.expired', field: 'code', meta: [
                'ends_at' => $promo->ends_at->toIso8601String(),
            ]);
        }

        if ($promo->max_uses !== null && $promo->used_count >= $promo->max_uses) {
            throw ApiException::of('promo.exhausted', field: 'code');
        }

        if ($this->guestHasUsedItUp($promo, $guest)) {
            throw ApiException::of('promo.used', field: 'code');
        }

        if ($subtotal < $promo->min_tiyin) {
            /*
             * The floor, and the shortfall beside it. Both, because "you need
             * 50 000 so'm" and "you need 12 000 so'm more" are different
             * sentences and the screen picks whichever fits — computing the
             * second one on the client means computing money on the client.
             */
            throw ApiException::of('promo.min_not_met', field: 'code', meta: [
                'min_tiyin' => $promo->min_tiyin,
                'short_by_tiyin' => $promo->min_tiyin - $subtotal,
            ]);
        }

        return ['promo' => $promo, 'discount' => $promo->discountFor($subtotal)];
    }

    /**
     * Has this guest already had their allowance of this campaign?
     *
     * An anonymous check can never answer yes, and that is honest rather than
     * lenient: a per-customer limit is enforced when the code is actually
     * redeemed against a bill, where there is a customer to count against. A
     * check with no token is a cart asking "would this work", and answering
     * "you have used it" to somebody the server cannot identify would refuse
     * the code for every anonymous guest at once.
     */
    private function guestHasUsedItUp(PromoCode $promo, ?Customer $guest): bool
    {
        if ($guest === null || $promo->per_customer_limit <= 0) {
            return false;
        }

        return $promo->redemptions()
            ->where('customer_id', $guest->getKey())
            ->count() >= $promo->per_customer_limit;
    }
}
