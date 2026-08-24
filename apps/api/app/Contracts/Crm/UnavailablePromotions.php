<?php

declare(strict_types=1);

namespace App\Contracts\Crm;

use RuntimeException;

/**
 * What promotions look like when CRM is not installed.
 *
 * Reads answer "worth nothing" and the write refuses, and the asymmetry is the
 * same one `UnavailableGuestAccounts` makes: a cart that cannot reach the
 * campaign table should charge full price and let the guest eat, while a bill
 * that recorded a discount into a module that is not running would be money off
 * a till with no campaign behind it and nothing to reconcile against.
 */
final class UnavailablePromotions implements Promotions
{
    public function quote(string $code, ?int $customerId, int $subtotalTiyin): ?PromoQuote
    {
        return null;
    }

    public function redeem(string $code, ?int $customerId, int $orderId, int $discountTiyin): void
    {
        throw new RuntimeException('Aksiyalar moduli o\'chirilgan — promo kodni qo\'llab bo\'lmaydi.');
    }
}
