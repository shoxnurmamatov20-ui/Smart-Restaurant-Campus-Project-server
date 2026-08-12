<?php

declare(strict_types=1);

namespace App\Support\Events;

use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * Run a subscriber's work exactly once, however many times the event arrives.
 *
 *     public function handle(ReceivedEvent $event): void
 *     {
 *         $this->processed->once($event, self::class, function () use ($event) {
 *             // credit the guest, raise the stock, open the ticket…
 *         });
 *     }
 *
 * The claim is a unique-index insert rather than a select-then-insert, so two
 * workers racing on the same event cannot both decide they are first. The work
 * and the claim share a transaction: if the work throws, the claim rolls back
 * with it and the event stays eligible for retry.
 */
final class ProcessedEvents
{
    /**
     * @param Closure():void $work
     *
     * @return bool true if the work ran, false if this event was already handled
     */
    public function once(ReceivedEvent $event, string $listener, Closure $work): bool
    {
        if ($this->alreadyHandled($event->eventId, $listener)) {
            return false;
        }

        return DB::transaction(function () use ($event, $listener, $work): bool {
            try {
                DB::table('processed_domain_events')->insert([
                    'event_id' => $event->eventId,
                    'listener' => $listener,
                    'processed_at' => now(),
                ]);
            } catch (QueryException $e) {
                // Someone else claimed it between our check and this insert.
                // Losing that race is the correct outcome, not an error.
                if ($this->isDuplicate($e)) {
                    return false;
                }

                throw $e;
            }

            $work();

            return true;
        });
    }

    public function alreadyHandled(string $eventId, string $listener): bool
    {
        return DB::table('processed_domain_events')
            ->where('event_id', $eventId)
            ->where('listener', $listener)
            ->exists();
    }

    private function isDuplicate(QueryException $e): bool
    {
        // 23000/23505 is the SQL-standard integrity-constraint class; MySQL,
        // PostgreSQL and SQLite all report a unique violation under it.
        return in_array($e->getCode(), ['23000', '23505'], true);
    }
}
