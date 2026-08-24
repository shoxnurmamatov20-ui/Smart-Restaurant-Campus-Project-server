<?php

declare(strict_types=1);

namespace Modules\Kitchen\Services;

use App\Contracts\Kitchen\TicketWriter;
use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillLine;
use App\Contracts\Orders\LineModifier;
use App\Support\Settings\Policies;
use Modules\Kitchen\Events\TicketFired;
use Modules\Kitchen\Models\KitchenStation;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Kitchen\Printing\EloquentPrintSpooler;

/**
 * Turning a bill into dockets, one per station.
 *
 * Reads a `Bill` and nothing else — no Orders model, no query back into another
 * module's tables. That is what lets the two be deployed apart, and it is the
 * debt `ModuleBoundaryTest` recorded against this module.
 *
 * Everything on a docket is a snapshot. A cook holds paper, or a screen that
 * has not refreshed, and the dish it names has to keep meaning what it meant
 * when it was fired — the same reason a receipt keeps its own copy of the price.
 */
final class EloquentTicketWriter implements TicketWriter
{
    /** What a station is given when it has set no target of its own. */
    private const DEFAULT_SLA_MINUTES = 20;

    public function __construct(
        private readonly EloquentPrintSpooler $spooler,
        private readonly Policies $policies,
    ) {}

    /**
     * @return array<int, int>
     */
    public function fire(Bill $bill): array
    {
        $slaByStation = KitchenStation::query()->pluck('sla_minutes', 'code');
        $ids = [];

        foreach ($this->linesByStation($bill) as $station => $lines) {
            $payload = [
                'order_id' => $bill->id,
                'order_number' => $bill->number,
                'station' => $station,
                'table_label' => $bill->tableLabel,
                // Snapshotted with the rest of the docket. The pass calls the
                // waiter by name, and the bill is the only place that knows it.
                'waiter_user_id' => $bill->waiterUserId,
                'channel' => $bill->channel,
                'sla_minutes' => (int) ($slaByStation[$station] ?? self::DEFAULT_SLA_MINUTES),
                'lines' => $lines,
            ];

            /** @var KitchenTicket|null $existing */
            $existing = KitchenTicket::query()
                ->where('order_id', $bill->id)
                ->where('station', $station)
                ->first();

            if ($existing !== null) {
                // Updated in place. A cook holding two dockets for one table
                // has to reconcile them by hand, mid-service.
                $existing->update($payload);
                $ticket = $existing;
            } else {
                $ticket = KitchenTicket::create($payload + ['status' => 'new']);
            }

            /*
             * Announced after the write, inside the caller's transaction.
             *
             * `ShouldBroadcast` queues it, so what happens here is a job being
             * written — and if the transaction rolls back, the job goes with it.
             * A screen that showed a docket for a bill that never fired would
             * have a cook plating food nobody ordered, and no way to find out.
             */
            TicketFired::dispatch($ticket);

            /*
             * And the same docket on paper, in the same transaction.
             *
             * A screen and a printer are not alternatives — a KDS goes dark when
             * the tablet's battery dies or the venue's wifi drops, and paper does
             * not. Every kitchen that has both uses both, and the one that only
             * had a screen found out which it needed at the worst moment.
             *
             * This writes a queue row and nothing else: no socket is opened, no
             * printer is waited on. That is what makes it safe to sit inside the
             * transaction that fired the bill — a dead printer cannot roll back
             * an order, and an order that rolls back cannot leave a docket
             * behind. If there is no printer configured the spooler says so and
             * returns; a venue with no hardware still sells.
             *
             * `policies.kds_paper_docket` is the restaurant's own answer to
             * whether it wants both. On by default — that is what this did
             * unconditionally — and a kitchen that switches it off is a kitchen
             * with no printer, where the alternative is a print queue filling up
             * with jobs nothing will ever collect.
             */
            if ($this->policies->on('kds_paper_docket')) {
                $this->spooler->docket($ticket);
            }

            $ids[] = (int) $ticket->id;
        }

        return $ids;
    }

    /**
     * The lines a kitchen needs, grouped the way a kitchen is laid out.
     *
     * @return array<string, array<int, array<string, mixed>>>
     */
    private function linesByStation(Bill $bill): array
    {
        $grouped = [];

        foreach ($bill->lines as $line) {
            if ($line->status === 'cancelled') {
                // A voided line is not cooked. It stays on the bill for the
                // audit trail and has no business on a pass.
                continue;
            }

            $station = $line->station ?? 'hot';
            $grouped[$station][] = $this->docketLine($line);
        }

        return $grouped;
    }

    /**
     * @return array<string, mixed>
     */
    private function docketLine(BillLine $line): array
    {
        return [
            'sku' => $line->sku,
            'title' => $line->title,
            'quantity' => $line->quantity,
            'note' => $line->note,

            /*
             * The modifiers, and this is the field that matters most on the
             * whole docket.
             *
             * "No onion" is not a preference — for somebody with an allergy it
             * is the reason they can eat. The ticket carried sku, title,
             * quantity and note and nothing else, so from the day modifiers
             * shipped a cook would have plated exactly the wrong dish while the
             * tablet showed the right one.
             *
             * Names only, no prices: a pass has no use for money and a docket
             * showing it invites the wrong conversation at the wrong end of the
             * kitchen.
             */
            'modifiers' => array_map(
                static fn (LineModifier $modifier): string => $modifier->title,
                $line->modifiers,
            ),

            /*
             * Which guest ordered it.
             *
             * A grill plating four steaks for one table needs to know which is
             * which, and "the rare one is for seat 2" is the only way a runner
             * can put it down in front of the right person without asking.
             */
            'seat_no' => $line->seatNo,
        ];
    }
}
