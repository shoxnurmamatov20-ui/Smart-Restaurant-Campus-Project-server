<?php

declare(strict_types=1);

namespace Modules\Kitchen\Printing;

use App\Models\Branch;
use Illuminate\Support\Carbon;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Kitchen\Models\Printer;

/**
 * What a cook holds.
 *
 * A docket is not a small receipt. It is read at arm's length, upside down,
 * across a hot pass, by somebody with both hands full — so it is laid out for
 * one glance and one question: *what do I cook and where does it go*. Prices are
 * absent on purpose (a pass has no use for money and showing it invites the
 * wrong conversation at the wrong end of the kitchen), and the two things that
 * are shouted are the table and the channel.
 *
 * The channel is shouted because getting it wrong is the mistake that actually
 * happens: a takeaway plated onto china, or a dine-in packed into a box. Both
 * are the same half-second of not looking, and both come back.
 *
 * Modifiers are printed under their dish, indented, every time — including when
 * a bill is re-fired. "No onion" is an allergy until proven otherwise, and a
 * docket that drops it is the one failure in this whole module that can put
 * somebody in hospital.
 */
final class DocketRenderer
{
    public function render(
        KitchenTicket $ticket,
        Printer $printer,
        ?string $stationName = null,
        bool $reprint = false,
    ): Document {
        $branch = $printer->branch;
        $document = new Document($printer->columns);

        $this->head($document, $ticket, $stationName, $reprint);
        $this->meta($document, $ticket, $branch);

        $document->rule('=');

        /** @var array<int, array<string, mixed>> $lines */
        $lines = $ticket->lines ?? [];

        foreach ($lines as $index => $line) {
            if ($index > 0) {
                $document->rule();
            }

            $this->line($document, $line);
        }

        if ($lines === []) {
            // Should not happen, and has to print something when it does: a
            // blank docket tells a cook nothing, an empty one tells them the
            // till sent an empty ticket and somebody should look.
            $document->centre('—');
        }

        return $document->rule('=')->feed(1)->cut();
    }

    private function head(Document $document, KitchenTicket $ticket, ?string $stationName, bool $reprint): void
    {
        $document->rule('=')
            ->centre(mb_strtoupper($stationName ?? $ticket->station))
            ->rule('=');

        if ($reprint) {
            // Said before anything else, because a cook who plates a reprint a
            // second time has thrown away a dish and the guest is still waiting.
            $document->centre(__('kitchen::print.docket.reprint'))->rule();
        }

        /*
         * The biggest thing on the paper is where the food goes.
         *
         * A table label for a dine-in, the order number for everything else —
         * a courier does not have a table and "STOL —" is a line of noise on
         * every delivery docket.
         */
        $document->headline($ticket->table_label !== null && $ticket->table_label !== ''
            ? __('kitchen::print.docket.table').' '.$ticket->table_label
            : $ticket->order_number);

        $channel = __('kitchen::print.channel.'.$ticket->channel);
        $document->centre(is_string($channel) ? $channel : mb_strtoupper($ticket->channel));
    }

    private function meta(Document $document, KitchenTicket $ticket, ?Branch $branch): void
    {
        $document->rule()
            ->kv(__('kitchen::print.docket.order'), $ticket->order_number)
            ->kv(__('kitchen::print.docket.fired'), $this->localTime($ticket->created_at, $branch));
    }

    /** @param array<string, mixed> $line */
    private function line(Document $document, array $line): void
    {
        $quantity = (int) ($line['quantity'] ?? 1);
        $title = (string) ($line['title'] ?? '');

        // Quantity and dish on one bold line, because reading them apart is how
        // one portion becomes three. Single-spaced: the wrapper collapses runs
        // of spaces, so padding here would be silently thrown away — alignment
        // inside a line is what `kv` is for.
        $document->text($quantity.' x '.$title, bold: true);

        /** @var array<int, string> $modifiers */
        $modifiers = is_array($line['modifiers'] ?? null) ? $line['modifiers'] : [];

        foreach ($modifiers as $modifier) {
            $document->line('     - '.$modifier);
        }

        $note = $line['note'] ?? null;

        if (is_string($note) && trim($note) !== '') {
            // Quoted so it reads as somebody's words rather than as another
            // modifier — a guest's request and a menu option are different
            // kinds of instruction and a cook treats them differently.
            $document->line('     "'.trim($note).'"');
        }

        $seat = (int) ($line['seat_no'] ?? 0);

        if ($seat > 0) {
            $document->line('     '.__('kitchen::print.docket.seat').' '.$seat);
        }
    }

    /**
     * The clock on the wall of the kitchen, not the one in the database.
     *
     * Timestamps are stored naive UTC. A docket printed in Tashkent that says
     * 09:32 for an order fired at 14:32 makes every ticket look five hours old,
     * and the pass's whole sense of what is late goes with it.
     */
    private function localTime(?Carbon $at, ?Branch $branch): string
    {
        $at ??= now();

        return $at->copy()->setTimezone($branch->timezone ?? config('app.timezone'))->format('d.m.Y H:i');
    }
}
