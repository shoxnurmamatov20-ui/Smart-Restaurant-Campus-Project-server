<?php

declare(strict_types=1);

namespace App\Contracts\Crm;

use RuntimeException;

/**
 * Applying a promo code to a bill, from outside CRM.
 *
 * The customer app has been able to CHECK a code since the cart screen was
 * built — `POST /api/v1/public/promo-codes/check` answers what "OSH15" is worth.
 * Nothing could ever SPEND one. `PublicOrderRequest` says so in its own words:
 * the code is "recorded, never trusted … there is no contract Orders could call
 * to ask". This is that contract.
 *
 * The gap it closes is not cosmetic. Until now a guest typed a code, watched the
 * cart subtract fifteen percent, pressed order — and was charged the full price,
 * because `orders.promo_code` was a string nobody read. The discount existed
 * only in the browser, which is the one place money must never be decided.
 *
 * ---------------------------------------------------------------------------
 * Why quote and redeem are two calls and not one
 *
 * Because they happen at different moments and only one of them costs anybody
 * anything. A cart asks `quote()` on every keystroke of the promo field; a
 * campaign whose budget fell by one on each of those would be empty before
 * dinner. `redeem()` is called once, inside the transaction that writes the
 * bill, and that placement is the guarantee: a discount applied with no
 * redemption beside it is a campaign that never runs out, and a redemption with
 * no discount is a guest charged for a coupon they did not get.
 *
 * ---------------------------------------------------------------------------
 * Two kinds of string, one door
 *
 * A guest cannot tell a campaign code from a loyalty coupon and should not have
 * to — both are words on a screen that make the total go down. So both arrive
 * here, and which table the row came from stays CRM's problem. `PromoQuote`
 * reports which it was as `personal`, for callers that must show the difference;
 * nobody has to branch on it to be correct.
 *
 * Implemented by CRM, resolved through the container. When CRM is switched off
 * the core binds {@see UnavailablePromotions}, which quotes nothing and refuses
 * to spend — a discount granted by a module that is not running is money off a
 * bill with no campaign behind it.
 */
interface Promotions
{
    /**
     * What this code takes off this basket, or null if it takes nothing.
     *
     * Null rather than an exception, and the choice is deliberate: this is
     * asked on the ordering path as well as on the cart's check button, and an
     * order refused because a campaign ended between the two would be a lost
     * dinner over a discount the guest would have shrugged at. The check
     * endpoint still explains itself — it calls CRM's own service directly and
     * gets the five refusals in three languages. This one answers "worth
     * nothing", and the caller charges full price and says what it charged.
     *
     * @param string $code As typed. Normalisation is the implementation's job —
     *                     a guest types lower case and a caller must not have to
     *                     know the storage convention.
     * @param int|null $customerId The signed-in guest, when there is one. A
     *                             personal coupon is invisible without it, and
     *                             a per-customer limit cannot be counted.
     * @param int $subtotalTiyin The food, after line discounts and before the
     *                           delivery fee. Tiyin.
     */
    public function quote(string $code, ?int $customerId, int $subtotalTiyin): ?PromoQuote;

    /**
     * Spend it against this bill.
     *
     * Called once per order, inside the transaction that writes the bill, with
     * the discount that was actually applied. Writes the redemption row, moves
     * the campaign's counter, and stamps a personal coupon as used.
     *
     * Idempotent by the unique index behind it — `(tenant_id, promo_code_id,
     * order_id)` — because the alternative is a retried request spending one
     * campaign twice against one dinner.
     *
     * @param int $discountTiyin What came off, not what was quoted. The two
     *                           differ whenever the basket changed between the
     *                           quote and the write, and the record must match
     *                           the bill rather than the browser.
     *
     * @throws RuntimeException when the code cannot be spent at all
     */
    public function redeem(string $code, ?int $customerId, int $orderId, int $discountTiyin): void;
}
