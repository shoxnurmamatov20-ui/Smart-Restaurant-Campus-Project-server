<?php

declare(strict_types=1);

namespace Modules\Kitchen\Printing;

use App\Contracts\Finance\Tender;
use App\Contracts\Orders\Bill;
use App\Contracts\Printing\PrintOutcome;
use App\Contracts\Printing\PrintSpooler;
use App\Support\Finance\TenderPlan;
use App\Support\Tenancy\BranchContext;
use Illuminate\Database\QueryException;
use Modules\Kitchen\Models\KitchenStation;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Kitchen\Models\Printer;
use Modules\Kitchen\Models\PrintJob;

/**
 * Putting a document in the queue, and nothing else.
 *
 * The single most important property of this class is what it does *not* do: it
 * never opens a socket, never waits for a printer, never blocks. Every public
 * method here writes one row and returns.
 *
 * That is a hard requirement rather than a preference, and it comes from the
 * till. `TenderService::settle()` runs entirely inside `DB::transaction`, and a
 * card has already been charged on the terminal by the time it gets there. A
 * synchronous print inside that transaction means a printer that is out of paper
 * rolls back a payment the acquirer has already taken — the guest is charged,
 * the restaurant has no record, and the only symptom is a receipt that did not
 * come out. Writing a row cannot fail that way, and if the transaction does roll
 * back the queued job goes with it, which is also correct.
 *
 * Everything after the row is somebody else's problem, by design: the local
 * print agent drains the queue, and a printer that is dead simply means the row
 * waits. See `Modules/Kitchen/docs/print-agent-design.md`.
 */
final class EloquentPrintSpooler implements PrintSpooler
{
    /**
     * Two reason codes beyond the four the contract's docblock names.
     *
     * `no_printer`, `no_route`, `queue_full` and `disabled` cover the hardware
     * being absent. These two cover a request that was fine and simply did not
     * need paper, and both have to be distinguishable from a fault or the status
     * strip cries wolf: `already_queued` is the correct answer to a retried
     * settlement, and a strip that painted it red would go red on every
     * idempotent replay.
     */
    public const NOTHING_TO_PRINT = 'nothing_to_print';

    public const ALREADY_QUEUED = 'already_queued';

    public function __construct(
        private readonly PrinterRouter $router,
        private readonly DocketRenderer $dockets,
        private readonly ReceiptRenderer $receipts,
    ) {}

    /**
     * A station's docket, from a ticket that has just been written.
     *
     * Not on the platform contract: a kitchen firing its own tickets crosses no
     * module boundary, and a contract method exists to let *another* module in.
     */
    public function docket(KitchenTicket $ticket, bool $reprint = false): PrintOutcome
    {
        $printer = $this->router->forStation($ticket->station, $ticket->branch_id);

        if ($printer === null) {
            return $this->nowhereToPrint($ticket->branch_id);
        }

        $document = $this->dockets->render($ticket, $printer, $this->stationName($ticket), $reprint);

        return $this->spool(
            printer: $printer,
            kind: 'docket',
            document: $document,
            reference: 'ticket:'.$ticket->id,
            title: trim($ticket->order_number.' · '.$ticket->station),
            // Hashing the rendered paper is what makes a re-fire behave the way
            // a kitchen expects: an edited bill prints the change, an unchanged
            // one does not put a second identical docket on the rail. A manual
            // reprint carries the REPRINT banner, so it hashes differently and
            // is never swallowed as a duplicate.
            fingerprint: $this->fingerprint('docket:'.$ticket->id, $document),
        );
    }

    /**
     * The guest's receipt.
     *
     * @param  array<int, Tender>  $tenders
     */
    public function receipt(
        Bill $bill,
        ?TenderPlan $plan = null,
        array $tenders = [],
        ?int $printerId = null,
        ?string $idempotencyKey = null,
    ): PrintOutcome {
        return $this->spoolReceipt($bill, $plan, $tenders, $printerId, $idempotencyKey, copy: false);
    }

    /**
     * The same bill again, marked as a copy.
     *
     * A guest who lost the slip, an accountant reconciling, a manager checking a
     * disputed line. Marked because two unmarked identical receipts for one bill
     * is how the same refund gets claimed twice.
     *
     * @param  array<int, Tender>  $tenders
     */
    public function reprintReceipt(
        Bill $bill,
        ?TenderPlan $plan = null,
        array $tenders = [],
        ?int $printerId = null,
    ): PrintOutcome {
        // No fingerprint: asking for a copy twice is asking for two copies.
        return $this->spoolReceipt($bill, $plan, $tenders, $printerId, null, copy: true);
    }

    /**
     * `ESC p 0` — the drawer, and nothing on the paper.
     *
     * Queued like everything else rather than fired at the device, so a drawer
     * that would not open because the printer was unplugged opens when it is
     * plugged back in, instead of the cashier discovering at counting time that
     * it never did.
     */
    public function openDrawer(?int $printerId = null, ?string $idempotencyKey = null): PrintOutcome
    {
        $branchId = app(BranchContext::class)->id();
        $printer = $this->router->forDrawer($branchId, $printerId);

        if ($printer === null) {
            return $this->nowhereToPrint($branchId);
        }

        return $this->spool(
            printer: $printer,
            kind: 'drawer',
            document: (new Document($printer->columns))->pulse(),
            reference: null,
            title: null,
            // Only ever the caller's key. Two legitimate opens in a row are
            // identical documents, and hashing them would silently refuse the
            // second — a drawer that will not open for the next guest.
            fingerprint: $idempotencyKey === null ? null : 'drawer:'.$idempotencyKey,
        );
    }

    /** What a technician prints after wiring a printer to the wall. */
    public function selfTest(Printer $printer): PrintOutcome
    {
        $document = (new Document($printer->columns))
            ->rule('=')
            ->centre(__('kitchen::print.test.title'))
            ->rule('=')
            ->kv('Printer', $printer->name)
            ->kv('Code', $printer->code)
            ->kv('Columns', (string) $printer->columns)
            ->kv('Codepage', $printer->codepage)
            ->rule()
            // Deliberately full of the characters that break: if the codepage is
            // wrong, this is the line that says so instead of a receipt at the
            // worst possible moment.
            ->line('Oʻzbek: qoʻy shoʻrva, gʻoz, choʻp')
            ->line('Русский: кўк чой, шашлык')
            ->line('English: 0123456789 -+.,')
            ->rule()
            ->centre(__('kitchen::print.test.ok'))
            ->feed(1)
            ->cut();

        return $this->spool($printer, 'test', $document, null, __('kitchen::print.test.title'), null);
    }

    // ============ Internals ============

    /**
     * @param  array<int, Tender>  $tenders
     */
    private function spoolReceipt(
        Bill $bill,
        ?TenderPlan $plan,
        array $tenders,
        ?int $printerId,
        ?string $idempotencyKey,
        bool $copy,
    ): PrintOutcome {
        /*
         * The venue comes from the request, not from the bill.
         *
         * `Bill` carries no branch — it is the till's view of an order, and a
         * till already knows which room it is standing in. That holds for every
         * caller a receipt has: a settlement, a reprint at the counter, an
         * accountant re-sending one. Only the last can have no branch set, and
         * then the router falls back to the restaurant's default receipt
         * printer — the right answer for a single-venue business and the only
         * available one for a reader who has not said where they are.
         */
        $branchId = app(BranchContext::class)->id();
        $printer = $this->router->forReceipt($branchId, $printerId);

        if ($printer === null) {
            return $this->nowhereToPrint($branchId);
        }

        return $this->spool(
            printer: $printer,
            kind: 'receipt',
            document: $this->receipts->render($bill, $printer, $plan, $tenders, $copy),
            reference: 'order:'.$bill->id,
            title: $bill->number,
            // A receipt carries the time it was printed, so hashing it would
            // never collide and would never protect anything. Only an explicit
            // key from the caller can say "this is the same settlement".
            fingerprint: $idempotencyKey === null ? null : 'receipt:'.$idempotencyKey,
        );
    }

    private function spool(
        Printer $printer,
        string $kind,
        Document $document,
        ?string $reference,
        ?string $title,
        ?string $fingerprint,
    ): PrintOutcome {
        if ($document->isEmpty()) {
            return PrintOutcome::skipped(self::NOTHING_TO_PRINT, (int) $printer->id);
        }

        $attributes = [
            // Taken from the printer rather than from the request context. The
            // device is the thing that is physically in a venue, and a job
            // stamped with a reader's branch would drain onto the wrong agent.
            'tenant_id' => $printer->tenant_id,
            'branch_id' => $printer->branch_id,
            'printer_id' => $printer->id,
            'kind' => $kind,
            'reference' => $reference,
            'title' => $title === null ? null : mb_substr($title, 0, 120),
            'document' => $document->toArray(),
            'copies' => $printer->copies,
            'status' => 'queued',
            'attempts' => 0,
            'available_at' => now(),
            'fingerprint' => $fingerprint,
        ];

        if ($fingerprint !== null) {
            $existing = PrintJob::query()
                ->withoutGlobalScope('branch')
                ->where('fingerprint', $fingerprint)
                ->first();

            if ($existing !== null) {
                return PrintOutcome::skipped(self::ALREADY_QUEUED, (int) $printer->id);
            }
        }

        try {
            $job = PrintJob::create($attributes);

            return PrintOutcome::queued((int) $job->id, (int) $printer->id);
        } catch (QueryException $exception) {
            /*
             * Two tablets firing the same bill at the same instant. The check
             * above loses that race and the unique index wins it, which is the
             * right way round — but the loser must not turn a settlement into a
             * 500. It already printed; that is what "already queued" means.
             */
            if ($fingerprint !== null && $this->isUniqueViolation($exception)) {
                return PrintOutcome::skipped(self::ALREADY_QUEUED, (int) $printer->id);
            }

            throw $exception;
        }
    }

    private function fingerprint(string $prefix, Document $document): string
    {
        return mb_substr($prefix.':'.sha1((string) json_encode($document->toArray())), 0, 80);
    }

    /**
     * Every given-up job at this venue, back in the queue.
     *
     * `failed` only. A job that is still `queued` is already being retried by
     * the backoff and touching it would reset a schedule that is working; a
     * `claimed` one is in an agent's hands right now, and re-queueing it prints
     * the same receipt twice.
     *
     * One statement rather than a loop over `PrintJob::requeue()`, because a
     * venue whose printer has been off all afternoon has hundreds of these and
     * the person pressing the button is standing at a counter with a guest
     * waiting. The columns it writes are exactly the ones `requeue()` writes —
     * change one and change both.
     */
    public function requeueFailed(?int $branchId = null): int
    {
        return PrintJob::query()
            ->where('status', 'failed')
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->update([
                'status' => 'queued',
                'attempts' => 0,
                'available_at' => now(),
                'claimed_at' => null,
                'claimed_by' => null,
                'last_error' => null,
                'updated_at' => now(),
            ]);
    }

    private function stationName(KitchenTicket $ticket): ?string
    {
        return KitchenStation::query()
            ->withoutGlobalScope('branch')
            ->where('code', $ticket->station)
            ->when($ticket->branch_id !== null, fn ($q) => $q->where('branch_id', $ticket->branch_id))
            ->value('name');
    }

    /**
     * Telling "nobody installed a printer" apart from "nothing routes here".
     *
     * They are one `null` from the router and two different jobs for whoever
     * reads the status strip. If the venue has no active printer at all, that is
     * a box still in a cupboard and a call to the manager. If it has printers
     * and none of them serves this station or role, the hardware is on the wall
     * and the configuration is wrong — a different person, a different fix, and
     * a minute rather than a day.
     *
     * The extra query only ever runs on the failure path.
     */
    private function nowhereToPrint(?int $branchId): PrintOutcome
    {
        $anyAtAll = Printer::query()
            ->withoutGlobalScope('branch')
            ->active()
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->exists();

        return PrintOutcome::skipped($anyAtAll ? 'no_route' : 'no_printer');
    }

    private function isUniqueViolation(QueryException $exception): bool
    {
        return ($exception->errorInfo[0] ?? null) === '23505';
    }
}
