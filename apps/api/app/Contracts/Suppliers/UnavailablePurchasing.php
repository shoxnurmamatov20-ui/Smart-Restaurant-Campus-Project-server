<?php

declare(strict_types=1);

namespace App\Contracts\Suppliers;

/**
 * Purchasing when the Suppliers module is not installed.
 *
 * Zeroes and empty lists rather than a refusal, unlike its sibling
 * {@see UnavailableReceiving}. The difference is which direction the data is
 * going: a confirmation that is refused stays in the phone's queue and can be
 * sent again, while a dashboard panel has nothing to keep. A restaurant with no
 * purchasing module has no deliveries and owes nothing through it, and the two
 * screens draw their own empty state — which is the truth about that business.
 */
final class UnavailablePurchasing implements Purchasing
{
    public function expectedBetween(string $from, string $to, int $limit = 10): array
    {
        return [];
    }

    public function outstanding(int $limit = 10): array
    {
        return [];
    }

    public function payablesSummary(): array
    {
        return ['unpaid' => 0, 'overdue' => 0, 'amount_tiyin' => 0];
    }
}
