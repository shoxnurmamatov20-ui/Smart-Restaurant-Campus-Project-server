<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\Idempotency\IdempotencyStore;
use Illuminate\Console\Command;

/**
 * Forget keys older than the replay window.
 *
 * Without this the table grows by one row per write forever — at 50 000
 * receipts a day that is 18 million rows a year, on a table every write reads
 * before it does anything.
 */
final class PruneIdempotencyKeys extends Command
{
    protected $signature = 'idempotency:prune';

    protected $description = 'Remove idempotency keys past the 48-hour replay window';

    public function handle(IdempotencyStore $store): int
    {
        $removed = $store->prune();

        $this->info("Pruned {$removed} idempotency key(s) older than ".IdempotencyStore::RETENTION_HOURS.' hours.');

        return self::SUCCESS;
    }
}
