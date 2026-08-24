<?php

declare(strict_types=1);

namespace Modules\Finance\Fiscal;

use RuntimeException;

/**
 * Not now: the network, the OFD, a timeout.
 *
 * The document is fine and will be filed on a later attempt, so it goes back in
 * the queue with a longer backoff. This is the failure that must never reach a
 * cashier — a guest is waiting, and the sale is already recorded.
 */
final class FiscalUnavailable extends RuntimeException {}
