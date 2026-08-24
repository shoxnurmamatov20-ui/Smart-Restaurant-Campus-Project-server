<?php

declare(strict_types=1);

namespace App\Contracts\Printing;

/**
 * What happened when something was sent to a printer.
 *
 * A value rather than a nullable id, and the difference matters on exactly one
 * screen: the status strip a waiter reads. "No printer is configured for this
 * branch", "the printer has not answered in four minutes" and "the queue is full"
 * are three different things for them to do next — call the manager, check the
 * cable, or wait — and a `null` collapses all three into "something went wrong".
 *
 * The plan's own acceptance test for P8 is that a waiter learns a printer is dead
 * **from the status strip and not from the kitchen**. That is only possible if the
 * reason survives the call.
 */
final readonly class PrintOutcome
{
    private function __construct(
        /** The queue row, when one was written. */
        public ?int $jobId,
        /** Which device it is bound for, when one was resolved. */
        public ?int $printerId,
        public bool $queued,
        /**
         * Why not, in a machine-readable word. Null when it was queued.
         *
         *   `no_printer`      the branch has no printer configured
         *   `no_route`        no printer serves this station
         *   `queue_full`      the spool is backed up
         *   `disabled`        the printer exists and is switched off
         *   `nothing_to_print` the document came out empty — every line voided
         *   `already_queued`  this exact job is already waiting
         *
         * The last two are NOT faults and a status strip must not colour them as
         * one. `already_queued` is the correct answer to a replayed settlement —
         * the till's idempotency working — and painting it red would cry wolf on
         * every retry until the strip is the thing people learn to ignore.
         *
         * A code rather than a sentence, because this crosses a module boundary and
         * the sentence a waiter reads belongs to the language they set — the client
         * translates it. A message baked in here would be Uzbek on a Russian screen.
         */
        public ?string $reason,
    ) {}

    public static function queued(int $jobId, int $printerId): self
    {
        return new self($jobId, $printerId, true, null);
    }

    /**
     * Nothing was queued, and this is not necessarily a fault.
     *
     * A venue with no printers at all is a real configuration — a dark kitchen
     * printing nothing, a bar working from a screen — and it must not stop a sale.
     * That is why nothing here throws.
     */
    public static function skipped(string $reason, ?int $printerId = null): self
    {
        return new self(null, $printerId, false, $reason);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'job_id' => $this->jobId,
            'printer_id' => $this->printerId,
            'queued' => $this->queued,
            'reason' => $this->reason,
        ];
    }
}
