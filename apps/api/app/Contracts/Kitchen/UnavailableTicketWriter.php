<?php

declare(strict_types=1);

namespace App\Contracts\Kitchen;

use App\Contracts\Orders\Bill;
use RuntimeException;

/**
 * What firing does when the Kitchen module is not installed.
 *
 * It refuses, and the asymmetry with the read-only fallbacks elsewhere is
 * deliberate. A missing catalogue can honestly answer "no dishes"; a missing
 * kitchen cannot honestly answer "sent". A bill that reports itself fired into
 * a module that is not running is a guest waiting for food nobody is cooking,
 * and the failure surfaces twenty minutes later at the table rather than
 * immediately on the tablet.
 *
 * A restaurant that genuinely runs without a kitchen module — a bar selling
 * only bottles — switches the module off and never calls `send()`, because
 * there is nothing to send.
 */
final class UnavailableTicketWriter implements TicketWriter
{
    /**
     * @return array<int, int>
     */
    public function fire(Bill $bill): array
    {
        throw new RuntimeException('Oshxona moduli yoqilmagan — buyurtmani yuborib bo\'lmaydi.');
    }
}
