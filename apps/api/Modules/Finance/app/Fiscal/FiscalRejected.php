<?php

declare(strict_types=1);

namespace Modules\Finance\Fiscal;

use RuntimeException;

/**
 * Not this document: a total the authority will not accept, a classification
 * code it does not know.
 *
 * Retrying cannot help, and retrying anyway is worse than useless — it burns
 * the window that a fixed document would have needed, and buries the one error
 * message somebody could have acted on under a thousand copies of itself. So a
 * rejected document stops, loudly, and waits for a person.
 */
final class FiscalRejected extends RuntimeException {}
