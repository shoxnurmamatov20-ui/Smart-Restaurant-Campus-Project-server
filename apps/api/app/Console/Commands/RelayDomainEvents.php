<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\StoredDomainEvent;
use App\Support\Events\EventBus;
use Illuminate\Console\Command;

/**
 * Delivers whatever the outbox is still holding.
 *
 * `EventBus::publish()` already tries to deliver straight after commit, so on a
 * healthy system this command finds nothing. It exists for the unhealthy ones:
 * a subscriber that was throwing, a worker killed mid-request, a database that
 * committed while the app was being redeployed. Without it the outbox would be
 * a log rather than a guarantee.
 *
 * Scheduled every minute in routes/console.php.
 */
final class RelayDomainEvents extends Command
{
    protected $signature = 'events:relay
                            {--limit=200 : How many events to deliver in one pass}';

    protected $description = 'Deliver pending domain events from the outbox to their subscribers';

    public function handle(EventBus $bus): int
    {
        $limit = max(1, (int) $this->option('limit'));

        $delivered = $bus->relayPending($limit);
        $abandoned = StoredDomainEvent::query()->abandoned()->count();

        if ($delivered > 0) {
            $this->info("Yetkazildi: {$delivered} ta hodisa.");
        }

        if ($abandoned > 0) {
            // Loud on purpose: these are silently un-happened side effects —
            // a paid order the kitchen never heard about.
            $this->warn("Diqqat: {$abandoned} ta hodisa yetkazilmadi va urinishlar tugadi.");

            $this->table(
                ['id', 'name', 'restoran', 'urinish', 'xato'],
                StoredDomainEvent::query()->abandoned()->orderBy('id')->limit(20)->get()
                    ->map(fn (StoredDomainEvent $e): array => [
                        $e->id, $e->name, $e->tenant_id ?? '—', $e->attempts,
                        mb_strimwidth((string) $e->last_error, 0, 60, '…'),
                    ])->all(),
            );

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
