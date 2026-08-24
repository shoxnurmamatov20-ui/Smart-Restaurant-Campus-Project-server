<?php

declare(strict_types=1);

namespace App\Contracts\Suppliers;

/**
 * An invoice the restaurant still owes money on.
 *
 * `dueAt` is the supplier's own terms applied to the delivery — `payment_terms_days`
 * counted from the day the van arrived — rather than a column somebody typed.
 * Terms of zero means paid at the door, so the deadline is the delivery itself
 * and not "no deadline".
 *
 * Null while the order has not arrived: there is nothing to count from, and
 * inventing a date would put a red row on an accountant's screen for a debt
 * whose clock has not started.
 *
 * `amountTiyin` is what is LEFT, not the order's total. Part payments are real
 * on this platform (`purchase_orders.paid_amount`), and an ageing list that
 * showed the full invoice after half of it had been settled would overstate
 * what the business owes by exactly the amount already paid.
 */
final readonly class Payable
{
    public function __construct(
        public int $id,
        public string $number,
        /** A supplier's trading name. A proper noun; never translated. */
        public string $supplier,
        /** Still owed, in tiyin (1 UZS = 100 tiyin). */
        public int $amountTiyin,
        /** ISO-8601, or null when nothing sets a deadline. */
        public ?string $dueAt,
    ) {}
}
