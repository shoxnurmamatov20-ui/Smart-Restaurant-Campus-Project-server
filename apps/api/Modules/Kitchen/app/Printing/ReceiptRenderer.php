<?php

declare(strict_types=1);

namespace Modules\Kitchen\Printing;

use App\Contracts\Finance\Tender;
use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillLine;
use App\Contracts\Orders\LineModifier;
use App\Models\Branch;
use App\Models\User;
use App\Support\Finance\TenderPlan;
use Modules\Kitchen\Models\Printer;

/**
 * The 80 mm slip a guest walks out with.
 *
 * The one document in this platform an outsider reads, argues with, and keeps.
 * Everything on it has to be defensible in front of somebody holding it, which
 * decides most of the layout:
 *
 *  - **Every adjustment is a line.** A discount, a service charge, a delivery
 *    fee and the cash rounding each get their own row with their own figure. A
 *    receipt where 45 240 quietly became 45 000 with nothing naming the
 *    difference does not read as rounding — it reads as a till that overcharged,
 *    and there is no way for the cashier to prove otherwise afterwards. Q7 says
 *    the rounding is recorded; this is where it is *shown*.
 *  - **VAT is stated as included, never added.** It is inside the total already,
 *    and a line that looks like `+ QQS` at the bottom invites the guest to add it
 *    themselves.
 *  - **A tip is never part of the bill.** It appears below the total, after the
 *    payment lines, because that is what it is: something handed over on top.
 *  - **Modifiers appear with their price.** A steak at 45 000 that cost 59 000
 *    has to explain the 14 000 somewhere, or the line looks wrong.
 *
 * Reads nothing but `Bill`, `Tender` and `TenderPlan` — all core contracts. This
 * class lives in the kitchen module and knows nothing whatsoever about Orders or
 * Finance, which is what lets the till print through it without a boundary being
 * crossed.
 */
final class ReceiptRenderer
{
    /**
     * @param array<int, Tender> $tenders How the money actually arrived.
     * @param bool $copy A reprint. Marked, because two identical slips for one
     *                   bill is how a refund gets claimed twice.
     */
    public function render(
        Bill $bill,
        Printer $printer,
        ?TenderPlan $plan = null,
        array $tenders = [],
        bool $copy = false,
    ): Document {
        $branch = $printer->branch;
        $document = new Document($printer->columns);

        $this->venue($document, $branch);
        $this->header($document, $bill, $branch, $copy);
        $this->lines($document, $bill);
        $this->totals($document, $bill);
        $this->payments($document, $plan, $tenders);
        $this->footer($document, $bill);

        return $document->feed(1)->cut();
    }

    // ============ Sections ============

    private function venue(Document $document, ?Branch $branch): void
    {
        $tenant = $branch?->tenant;

        $document->text($tenant->name ?? '', align: 'center', bold: true, width: 2, height: 2);

        if ($branch === null) {
            $document->rule('=');

            return;
        }

        $document->centre($branch->name);

        if ($branch->address !== null && $branch->address !== '') {
            $document->centre(trim(($branch->city !== null ? $branch->city.', ' : '').$branch->address));
        }

        if ($branch->phone !== null && $branch->phone !== '') {
            $document->centre($branch->phone);
        }

        $document->rule('=');
    }

    private function header(Document $document, Bill $bill, ?Branch $branch, bool $copy): void
    {
        if ($copy) {
            $document->centre(__('kitchen::print.receipt.copy'))->rule();
        }

        $document->kv(__('kitchen::print.receipt.number'), $bill->number)
            ->kv(__('kitchen::print.receipt.date'), now()
                ->setTimezone($branch->timezone ?? config('app.timezone'))
                ->format('d.m.Y H:i'));

        if ($bill->tableLabel !== null && $bill->tableLabel !== '') {
            $document->kv(__('kitchen::print.receipt.table'), $bill->tableLabel);
        }

        if ($bill->guestsCount > 1) {
            $document->kv(__('kitchen::print.receipt.guests'), (string) $bill->guestsCount);
        }

        $waiter = $this->waiterName($bill->waiterUserId);

        if ($waiter !== null) {
            // Named, because a guest with a complaint or a compliment has
            // somebody to attach it to, and because a waiter whose name is on
            // the slip is a waiter who checks the slip.
            $document->kv(__('kitchen::print.receipt.waiter'), $waiter);
        }

        $document->rule();
    }

    private function lines(Document $document, Bill $bill): void
    {
        foreach ($bill->lines as $line) {
            if ($line->status === 'cancelled') {
                // A voided line is not something the guest owes for. It stays
                // on the bill for the audit trail and has no business on paper
                // a guest is being asked to pay from.
                continue;
            }

            $this->line($document, $line);
        }

        $document->rule();
    }

    private function line(Document $document, BillLine $line): void
    {
        $document->line($line->title);

        foreach ($line->modifiers as $modifier) {
            $document->line('  + '.$this->modifierLabel($modifier));
        }

        // Quantity, unit price and line total on one row: the arithmetic a
        // guest checks first, and the only row on the slip they will do by hand.
        $document->kv(
            sprintf('  %d x %s', $line->quantity, Money::som($line->unitPrice)),
            Money::som($line->totalPrice),
        );
    }

    private function modifierLabel(LineModifier $modifier): string
    {
        return $modifier->priceDelta === 0
            ? $modifier->title
            : $modifier->title.' ('.Money::signed($modifier->priceDelta).')';
    }

    private function totals(Document $document, Bill $bill): void
    {
        $document->kv(__('kitchen::print.receipt.subtotal'), Money::som($bill->subtotal));

        if ($bill->discountTotal > 0) {
            // Shown negative. The contract stores it positive because it is
            // always subtracted; a guest reading `Chegirma  5 000` next to a
            // falling total has to work out which way it went.
            $document->kv(__('kitchen::print.receipt.discount'), Money::som(-$bill->discountTotal));
        }

        if ($bill->serviceCharge > 0) {
            $document->kv(__('kitchen::print.receipt.service'), Money::som($bill->serviceCharge));
        }

        if ($bill->deliveryFee > 0) {
            $document->kv(__('kitchen::print.receipt.delivery'), Money::som($bill->deliveryFee));
        }

        $document->rule()
            ->kv(__('kitchen::print.receipt.total'), Money::som($bill->total), bold: true, width: 2);

        if ($bill->vatIncluded > 0) {
            $document->kv('  '.__('kitchen::print.receipt.vat'), Money::som($bill->vatIncluded));
        }

        $document->rule();
    }

    /**
     * @param array<int, Tender> $tenders
     */
    private function payments(Document $document, ?TenderPlan $plan, array $tenders): void
    {
        foreach ($tenders as $tender) {
            $label = __('kitchen::print.method.'.$tender->method);

            $document->kv(is_string($label) ? $label : $tender->method, Money::som($tender->amount));
        }

        if ($plan === null) {
            return;
        }

        if ($plan->rounding !== 0) {
            // The line this whole section exists for. Without it the guest sees
            // a total of 45 240 and hands over what the cashier asked for, which
            // was 45 000, and nothing on the paper explains the difference.
            $document->kv(__('kitchen::print.receipt.rounding'), Money::signed($plan->rounding));
        }

        if ($plan->tips > 0) {
            $document->kv(__('kitchen::print.receipt.tip'), Money::som($plan->tips));
        }

        if ($plan->change > 0) {
            $document->kv(__('kitchen::print.receipt.change'), Money::som($plan->change), bold: true);
        }

        if (! $plan->settled && $plan->remaining > 0) {
            // A part payment. Printed in bold because a guest who walks out
            // thinking they are square is a debt nobody will collect.
            $document->rule()
                ->kv(__('kitchen::print.receipt.due'), Money::som($plan->remaining), bold: true);
        }

        $document->rule();
    }

    private function footer(Document $document, Bill $bill): void
    {
        if ($bill->note !== null && trim($bill->note) !== '') {
            $document->line(trim($bill->note))->rule();
        }

        $document->feed(1)->centre(__('kitchen::print.receipt.thanks'));
    }

    /**
     * The waiter's name, or nothing.
     *
     * `User` is a core model, not another module's — reading it crosses no
     * boundary. A missing user is not an error worth failing a receipt over: the
     * guest still gets their slip, one line shorter.
     */
    private function waiterName(?int $userId): ?string
    {
        if ($userId === null) {
            return null;
        }

        return User::query()->whereKey($userId)->value('name');
    }
}
