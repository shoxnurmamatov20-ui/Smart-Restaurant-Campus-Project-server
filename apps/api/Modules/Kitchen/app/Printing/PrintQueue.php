<?php

declare(strict_types=1);

namespace Modules\Kitchen\Printing;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Modules\Kitchen\Models\Printer;
use Modules\Kitchen\Models\PrintJob;

/**
 * The other end of the spool: handing work out, and taking answers back.
 *
 * Everything here is written for the case where the agent is unreliable, because
 * it is — it runs on a Windows box under a counter, it gets closed by whoever is
 * cleaning, the machine reboots for updates mid-service. So a job is never given
 * away: it is *lent*, with a deadline, and an agent that vanishes holding one
 * simply loses it back to the queue.
 *
 * The deadline is what makes that safe, and its direction is a deliberate
 * choice. Too short and a slow printer's docket prints twice; too long and a
 * crashed agent's docket never prints at all. Two pieces of paper is the cheaper
 * mistake in a kitchen, so the window is short — see `kitchen.printing.claim_seconds`.
 */
final class PrintQueue
{
    /**
     * Lend the next few jobs to an agent.
     *
     * `for update skip locked` is the whole implementation. Two agents polling
     * the same venue at the same moment — which happens the second somebody
     * installs a spare — would otherwise either deadlock or hand the same docket
     * to both. With it, the second agent steps over the rows the first is
     * holding and takes the next ones instead.
     *
     * @return Collection<int, PrintJob>
     */
    public function claim(?int $branchId, string $agent, ?int $limit = null): Collection
    {
        $limit = max(1, $limit ?? (int) config('kitchen.printing.claim_limit', 10));

        return DB::transaction(function () use ($branchId, $agent, $limit): Collection {
            $ids = $this->scope($branchId)
                ->due()
                // Oldest first, always. A pass that printed the newest docket
                // first would cook the table that just sat down before the one
                // that has been waiting, which is the one thing a queue exists
                // to prevent.
                ->orderBy('available_at')
                ->orderBy('id')
                ->limit($limit)
                ->lock('for update skip locked')
                ->pluck('id');

            if ($ids->isEmpty()) {
                return new Collection;
            }

            PrintJob::query()
                ->withoutGlobalScope('branch')
                ->whereIn('id', $ids)
                ->update([
                    'status' => 'claimed',
                    'claimed_at' => now(),
                    'claimed_by' => mb_substr($agent, 0, 64),
                    'updated_at' => now(),
                ]);

            return PrintJob::query()
                ->withoutGlobalScope('branch')
                ->with('printer')
                ->whereIn('id', $ids)
                ->orderBy('id')
                ->get();
        });
    }

    /**
     * It came out of the printer.
     *
     * Clearing the printer's failure state happens here and nowhere else — a
     * heartbeat must not do it. An agent whose printer is jammed keeps checking
     * in perfectly happily, so a status strip that went green on a heartbeat
     * would clear the warning while the paper was still stuck.
     */
    public function acknowledge(PrintJob $job): void
    {
        $job->succeeded();
        $job->printer->printedSomething();
    }

    /** It did not. The row survives, the printer is marked, the queue retries. */
    public function reject(PrintJob $job, string $error): void
    {
        $job->failed($error);
        $job->printer->failedWith($error);
    }

    /**
     * What the status strip draws.
     *
     * One query for the devices and one for the counts, never one per device:
     * this is polled from every till in the building, several times a minute,
     * for the whole of service.
     *
     * @return array{state: string, queued: int, failed: int, printers: array<int, array<string, mixed>>}
     */
    public function health(?int $branchId): array
    {
        $printers = Printer::query()
            ->withoutGlobalScope('branch')
            ->when($branchId !== null, fn (Builder $q): Builder => $q->where('branch_id', $branchId))
            ->orderByDesc('is_active')
            ->orderBy('role')
            ->orderBy('id')
            ->get();

        $counts = PrintJob::query()
            ->withoutGlobalScope('branch')
            ->when($branchId !== null, fn (Builder $q): Builder => $q->where('branch_id', $branchId))
            ->whereIn('status', ['queued', 'claimed', 'failed'])
            ->selectRaw('printer_id, status, count(*) as total')
            ->groupBy('printer_id', 'status')
            ->get();

        $rows = [];
        $queued = 0;
        $failed = 0;
        $live = 0;
        $sick = 0;

        foreach ($printers as $printer) {
            $mine = $counts->where('printer_id', $printer->id);
            $outstanding = (int) $mine->whereIn('status', ['queued', 'claimed'])->sum('total');
            $lost = (int) $mine->where('status', 'failed')->sum('total');

            $state = $printer->stateGiven($outstanding);

            $queued += $outstanding;
            $failed += $lost;

            if ($printer->is_active) {
                in_array($state, ['ready', 'busy'], true) ? $live++ : $sick++;
            }

            $rows[] = [
                'id' => (int) $printer->id,
                'code' => $printer->code,
                'name' => $printer->name,
                'role' => $printer->role,
                'branch_id' => $printer->branch_id,
                'state' => $state,
                'is_active' => $printer->is_active,
                'queued' => $outstanding,
                'failed' => $lost,
                'last_seen_at' => $printer->last_seen_at?->toIso8601String(),
                'failing_since' => $printer->failing_since?->toIso8601String(),
                'last_error' => $printer->last_error,
            ];
        }

        return [
            /*
             * Four words, because the four situations need four different
             * things from the person reading them: nothing installed is a job
             * for whoever fits the hardware, everything down is a job for
             * whoever is standing next to it right now, one of three down is
             * worth knowing and not worth stopping for, and `ok` is silence.
             */
            'state' => match (true) {
                $live === 0 && $sick === 0 => 'none',
                $live === 0 => 'down',
                $sick > 0 => 'degraded',
                default => 'ok',
            },
            'queued' => $queued,
            'failed' => $failed,
            'printers' => $rows,
        ];
    }

    /** @return Builder<PrintJob> */
    private function scope(?int $branchId): Builder
    {
        return PrintJob::query()
            // The agent names its venue explicitly, so the ambient branch scope
            // could only narrow it further — and wrongly, for an agent whose
            // request carries no X-Branch at all.
            ->withoutGlobalScope('branch')
            ->when($branchId !== null, fn (Builder $q): Builder => $q->where('branch_id', $branchId));
    }
}
