<?php

declare(strict_types=1);

namespace Modules\Finance\Services;

use App\Contracts\Orders\BillLine;
use App\Contracts\Orders\BillRegistry;
use App\Support\Events\EventBus;
use App\Support\Orders\BillTotals;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Modules\Finance\Events\FiscalReceiptExpired;
use Modules\Finance\Fiscal\FiscalDocument;
use Modules\Finance\Fiscal\FiscalDriver;
use Modules\Finance\Fiscal\FiscalProbe;
use Modules\Finance\Fiscal\FiscalRejected;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\FiscalReceipt;
use Modules\Finance\Models\Payment;
use Throwable;

/**
 * Getting every meal declared, without ever making a guest wait for it.
 *
 * ---------------------------------------------------------------------------
 * The rule everything here is shaped around
 *
 * **A dead fiscal module never blocks a sale.** It is the plan's rule and the
 * only defensible one: the receipt is a legal requirement, and refusing to take
 * money because a government endpoint is down closes the restaurant. So the
 * shape is the outbox shape, for the same reason the event bus has it —
 *
 *   the row is written inside the sale's own transaction, which is local,
 *   cheap and cannot fail for a reason the till would have to explain;
 *
 *   the conversation with the OFD happens after that transaction commits,
 *   so a network call never holds a database transaction open and a failure
 *   never rolls back money that was physically handed over;
 *
 *   `fiscal:relay` sweeps up whatever the first attempt missed, which is what
 *   makes this a queue rather than a hope.
 *
 * Every public method here is written so that throwing into the selling path is
 * impossible. That is not defensive habit — it is the rule, in code.
 *
 * ---------------------------------------------------------------------------
 * What the window costs
 *
 * The freedom to defer filing is bought with a deadline: a declaration has to
 * reach the authority inside the window (`config('finance.fiscal.window_hours')`,
 * 24 by default), and one that misses it stops being a queue item and becomes a
 * liability. So expiring is loud — its own status, its own event — because it is
 * the one fiscal fact a manager genuinely has to act on, and the one that a
 * retry queue would otherwise hide indefinitely.
 */
final class FiscalRegistrar
{
    /**
     * Seconds between attempts. Six rungs across roughly three hours, then the
     * relay keeps trying at the last interval until the window closes.
     *
     * The first rung is short because most failures are a five-second blip and
     * a guest may still be standing there wanting a printed receipt. The last
     * is long because by then the endpoint is genuinely down, and hammering it
     * every thirty seconds for twenty hours helps nobody.
     */
    private const BACKOFF = [30, 120, 600, 1_800, 3_600, 7_200];

    public function __construct(
        private readonly FiscalDriver $driver,
        private readonly EventBus $events,
        /*
         * The bill, for the one number Finance cannot work out on its own.
         *
         * A fiscal declaration has to state the VAT inside the amount, and this
         * module knows the amount and nothing about how it was priced: whether
         * a discount came off first, whether service was charged, whether part
         * of it is a delivery fee that sits OUTSIDE the tax base. `BillTotals`
         * decided all of that when the guest was shown the total, and the
         * answer is on the order.
         *
         * Through the contract, not the model — `ModuleBoundaryTest` refuses a
         * `use Modules\\Orders\\...` here, and rightly: Finance must keep
         * working when Orders is switched off. `UnavailableBillRegistry::find()`
         * answers null and the VAT falls back to a rate, which is exactly the
         * behaviour a venue with no Orders module should get.
         */
        private readonly BillRegistry $bills,
    ) {}

    public function probe(): FiscalProbe
    {
        try {
            return $this->driver->probe();
        } catch (Throwable $failure) {
            // A probe that threw is a probe that answered "no". Reporting it as
            // an exception would make the health screen the thing that breaks
            // when the tax service does.
            return new FiscalProbe(
                provider: $this->driver->name(),
                reachable: false,
                moduleNo: null,
                message: $failure->getMessage(),
            );
        }
    }

    // ============ Raising documents ============

    /**
     * Declare a bill, or add this tender to the declaration already open on it.
     *
     * One document per bill, not per tender: a table of four paying with two
     * cards and cash is three payment rows and ONE declaration. The authority is
     * told what was sold, not how many times the card machine was used, and
     * filing three receipts for one meal would declare triple the revenue.
     *
     * **Tips and cash rounding are not declared.** Neither is a sale — nothing
     * was sold for the tip, and the rounding is a gain on the settlement rather
     * than on the food. `Payment.amount` is already what was applied to the
     * bill, which is exactly the figure that belongs on a fiscal document.
     *
     * Returns null when there is nothing to declare — fiscalisation switched
     * off, or a tender that is not a sale — and never throws: this is called
     * from inside the settlement's own transaction, and a failure escaping it
     * would roll back a payment that has physically happened.
     *
     * @param  CashShift|null  $shift  The drawer this sale was taken at, when there
     *                                 was one. Null for money that arrived through
     *                                 a payment provider at an hour when no till was
     *                                 open — a delivery paid at 03:00 is still a
     *                                 declarable sale, and refusing to declare it
     *                                 because nobody was standing at a cash desk
     *                                 would leave the one category of revenue that
     *                                 has no cash to hide behind undeclared.
     */
    public function recordSale(?CashShift $shift, Payment $payment): ?FiscalReceipt
    {
        if (! $this->enabled()) {
            return null;
        }

        /*
         * Nothing was sold, so there is nothing to declare.
         *
         * `amount` is zero on the two tenders that are not sales: a cash line
         * that was entirely a tip, and one that turned out to be pure change on a
         * bill the card had already covered. Declaring either would raise a
         * zero-total document, which every provider refuses — and a refused
         * document stays in the queue until its window closes. The cashier who
         * was handed 5 000 so'm for good service would then be told at midnight
         * that a meal went undeclared, and there would be no meal to find.
         */
        if ((int) $payment->amount <= 0) {
            return null;
        }

        try {
            $receipt = $this->openSaleFor($shift, $payment);
        } catch (Throwable $failure) {
            // Logged and swallowed. The sale stands; `fiscal:relay --repair`
            // can raise the missing document later, and an un-filed meal is a
            // smaller problem than a refused one.
            Log::error('fiscal.record_sale_failed', [
                'payment_id' => $payment->getKey(),
                'order_id' => $payment->order_id,
                'error' => $failure->getMessage(),
            ]);

            return null;
        }

        $this->fileAfterCommit($receipt);

        return $receipt;
    }

    /**
     * Reverse a declared meal with a document of its own.
     *
     * A filed declaration cannot be unfiled; it can only be corrected by another
     * one. So a refund raises a `refund` document carrying the original's fiscal
     * sign — a reversal the authority cannot match to a sale is treated as a new
     * negative sale, which is a different thing and a worse one.
     *
     * The exception is a sale that never made it out: if the original is still
     * pending, nothing was ever declared, so there is nothing to correct. Both
     * rows go to `void` and no document is filed at all. Filing a correction for
     * a sale the authority never saw would leave a refund standing alone in the
     * day's declarations.
     */
    public function recordRefund(Payment $payment, ?CashShift $drawer, int $cashReturned): ?FiscalReceipt
    {
        if (! $this->enabled() || $payment->order_id === null) {
            return null;
        }

        try {
            return DB::transaction(function () use ($payment, $drawer, $cashReturned): ?FiscalReceipt {
                /** @var FiscalReceipt|null $sale */
                $sale = FiscalReceipt::query()
                    ->where('order_id', $payment->order_id)
                    ->where('kind', 'sale')
                    ->lockForUpdate()
                    ->first();

                if ($sale === null) {
                    return null;
                }

                if ($sale->status !== 'registered') {
                    // Never declared, so nothing to correct.
                    $sale->update(['status' => 'void', 'last_error' => 'Sotuv fiskallashtirilmasdan qaytarildi.']);

                    return null;
                }

                /*
                 * The correction belongs to the till that handed the money back,
                 * not to the one that took it. When there is no till — a card
                 * reversal opens no drawer — it stays with the original sale, so
                 * the document is still attached to a shift somebody can find.
                 */
                $refund = FiscalReceipt::create([
                    'branch_id' => $drawer === null ? $sale->branch_id : $drawer->branch_id,
                    'cash_shift_id' => $drawer === null ? $sale->cash_shift_id : $drawer->getKey(),
                    'order_id' => $payment->order_id,
                    'order_number' => $payment->order_number,
                    'kind' => 'refund',
                    'parent_id' => $sale->getKey(),
                    'status' => 'pending',
                    'total' => (int) $payment->amount,
                    'cash_total' => $cashReturned,
                    'card_total' => (int) $payment->amount - $cashReturned,
                    'vat_total' => $this->vatShareOf($sale, (int) $payment->amount),
                    'expires_at' => now()->addHours($this->windowHours()),
                ]);

                $this->fileAfterCommit($refund);

                return $refund;
            });
        } catch (Throwable $failure) {
            Log::error('fiscal.record_refund_failed', [
                'payment_id' => $payment->getKey(),
                'error' => $failure->getMessage(),
            ]);

            return null;
        }
    }

    // ============ Filing ============

    /**
     * Try to file one document. Never throws.
     *
     * The three outcomes are the three the driver contract names, and each has
     * to be handled differently or the queue misbehaves in a way nobody notices
     * for a day: accepted is terminal, unavailable goes back with a longer
     * backoff, rejected stops and waits for a person because retrying a
     * malformed document only burns the window.
     */
    public function file(FiscalReceipt $receipt): FiscalReceipt
    {
        /*
         * Re-read the row before deciding anything, because the copy in hand may
         * already be out of date.
         *
         * A bill settled in two tenders queues this twice — once per `capture()`,
         * both against the SAME document, because one bill is one declaration.
         * The second callback holds the row as it looked before the first one
         * filed it, so trusting that copy would declare the same meal to the tax
         * authority twice: two fiscal signs for one table, and revenue the
         * restaurant is taxed on and never took. The relay has the same problem
         * from the other side, with a model read before a sibling pass filed it.
         */
        $current = $receipt->fresh();

        if ($current === null) {
            // Nothing left to file. Fiscal documents are never deleted, so this
            // is a row that never existed rather than one that has been removed.
            return $receipt;
        }

        $receipt = $current;

        if ($receipt->is_settled) {
            return $receipt;
        }

        if ($this->windowClosed($receipt)) {
            return $this->expire($receipt);
        }

        try {
            $marks = $this->driver->register($this->documentFor($receipt));

            $receipt->update([
                'status' => 'registered',
                'provider' => $this->driver->name(),
                'fiscal_sign' => $marks->fiscalSign,
                'receipt_seq' => $marks->receiptSeq,
                'module_no' => $marks->moduleNo,
                'qr_url' => $marks->qrUrl,
                'registered_at' => $marks->registeredAt ?? now(),
                'attempts' => $receipt->attempts + 1,
                'next_attempt_at' => null,
                'last_error' => null,
            ]);

            // The payment row carries the number a receipt is looked up by, so
            // that "which fiscal document covers this money" is answerable from
            // the money rather than only from the document.
            $this->stampPayments($receipt, $marks->fiscalSign);
        } catch (FiscalRejected $rejected) {
            /*
             * Stopped, not retried.
             *
             * `next_attempt_at` is left null and the status stays `pending`, so
             * the relay's `due()` scope will keep picking it up — which is
             * deliberate: a rejection is usually a configuration problem that a
             * person fixes, and once they have, the next pass files it without
             * anybody remembering to re-queue anything. What changes is the
             * error, which is now a sentence somebody can act on rather than a
             * timeout.
             */
            $receipt->update([
                'attempts' => $receipt->attempts + 1,
                'last_error' => $rejected->getMessage(),
                'next_attempt_at' => now()->addSeconds(self::BACKOFF[count(self::BACKOFF) - 1]),
            ]);
        } catch (Throwable $unavailable) {
            /*
             * `FiscalUnavailable` and anything unexpected are handled the same
             * way, deliberately. A driver that threw a raw TypeError is a driver
             * that did not file the document, and the safe reading of "I do not
             * know what went wrong" is "try again later" — the alternative would
             * turn a bug in one provider into a day of expired declarations.
             *
             * Only `FiscalRejected` above is treated as final, because that is
             * the one case where the driver has told us retrying cannot help.
             */
            $attempts = $receipt->attempts + 1;
            $backoff = self::BACKOFF[min($attempts, count(self::BACKOFF)) - 1];

            $receipt->update([
                'attempts' => $attempts,
                'last_error' => $unavailable->getMessage(),
                'next_attempt_at' => now()->addSeconds($backoff),
            ]);
        }

        return $receipt->refresh();
    }

    /**
     * One pass of the queue: file what is ripe, expire what is out of time.
     *
     * @return array{filed: int, pending: int, expired: int}
     */
    public function relayPending(int $limit = 100): array
    {
        $filed = 0;
        $pending = 0;
        $expired = 0;

        /** @var iterable<int, FiscalReceipt> $due */
        $due = FiscalReceipt::query()->due()->orderBy('id')->limit($limit)->get();

        foreach ($due as $receipt) {
            $after = $this->file($receipt);

            match ($after->status) {
                'registered' => $filed++,
                'expired' => $expired++,
                default => $pending++,
            };
        }

        // Anything whose window closed while it was waiting for its backoff.
        // Without this pass a document could sit un-expired for hours after it
        // became a liability, simply because it was not yet due for a retry.
        $outOfTime = FiscalReceipt::query()
            ->outstanding()
            ->pastWindow($this->windowHours())
            ->limit($limit)
            ->get();

        foreach ($outOfTime as $stale) {
            $this->expire($stale);
            $expired++;
        }

        return ['filed' => $filed, 'pending' => $pending, 'expired' => $expired];
    }

    /**
     * A reprint, stamped so nobody can present it as a second sale.
     *
     * It files nothing: the declaration was made once and this is the same
     * declaration on new paper. Counting the copies is what makes "this receipt
     * was printed four times" a question with an answer.
     */
    public function duplicate(FiscalReceipt $receipt): FiscalReceipt
    {
        $receipt->increment('duplicates_printed');

        return $receipt->refresh();
    }

    // ============ Internals ============

    private function enabled(): bool
    {
        return (bool) config('finance.fiscal.enabled', false);
    }

    private function windowHours(): int
    {
        return max(1, (int) config('finance.fiscal.window_hours', 24));
    }

    /**
     * The deadline this document is actually held to.
     *
     * `expires_at` whenever it is there, which is every document this class
     * raises. The fallback is for the ones that arrived some other way — a
     * repair, an import from a venue that traded before its OFD existed — and it
     * is not a formality: a row with no deadline is retried forever and never
     * counted as a liability, and the window is the one thing standing between
     * deferring a declaration and never making it.
     */
    private function windowClosesAt(FiscalReceipt $receipt): ?CarbonInterface
    {
        return $receipt->expires_at ?? $receipt->created_at?->addHours($this->windowHours());
    }

    private function windowClosed(FiscalReceipt $receipt): bool
    {
        return $this->windowClosesAt($receipt)?->isPast() === true;
    }

    /**
     * Open the bill's declaration, or add this tender to the one already open.
     */
    private function openSaleFor(?CashShift $shift, Payment $payment): FiscalReceipt
    {
        return DB::transaction(function () use ($shift, $payment): FiscalReceipt {
            /** @var FiscalReceipt|null $existing */
            $existing = $payment->order_id === null ? null : FiscalReceipt::query()
                ->where('order_id', $payment->order_id)
                ->where('kind', 'sale')
                ->lockForUpdate()
                ->first();

            $isCash = $payment->method === 'cash';
            $amount = (int) $payment->amount;

            if ($existing === null) {
                return FiscalReceipt::create([
                    'branch_id' => $shift === null ? $payment->branch_id : $shift->branch_id,
                    'cash_shift_id' => $shift?->getKey(),
                    'order_id' => $payment->order_id,
                    'order_number' => $payment->order_number,
                    'kind' => 'sale',
                    'status' => 'pending',
                    'total' => $amount,
                    'cash_total' => $isCash ? $amount : 0,
                    'card_total' => $isCash ? 0 : $amount,
                    'vat_total' => $this->vatInside($payment, $amount),
                    'expires_at' => now()->addHours($this->windowHours()),
                ]);
            }

            /*
             * A second tender on a bill that has already been declared.
             *
             * It happens: a guest pays half by card, the receipt files, and then
             * they put notes down for the rest. The declaration cannot be
             * amended — it is already lodged — so the balance is declared as its
             * own document rather than silently added to a total the authority
             * has already seen.
             */
            if ($existing->status === 'registered') {
                return FiscalReceipt::create([
                    'branch_id' => $shift === null ? $payment->branch_id : $shift->branch_id,
                    'cash_shift_id' => $shift?->getKey(),
                    'order_id' => null,
                    'order_number' => $payment->order_number,
                    'kind' => 'sale',
                    'parent_id' => $existing->getKey(),
                    'status' => 'pending',
                    'total' => $amount,
                    'cash_total' => $isCash ? $amount : 0,
                    'card_total' => $isCash ? 0 : $amount,
                    'vat_total' => $this->vatInside($payment, $amount),
                    'expires_at' => now()->addHours($this->windowHours()),
                ]);
            }

            $existing->update([
                'total' => $existing->total + $amount,
                'cash_total' => $existing->cash_total + ($isCash ? $amount : 0),
                'card_total' => $existing->card_total + ($isCash ? 0 : $amount),
                /*
                 * The tender joins a declaration that has not filed yet, so the
                 * VAT joins it too. Added rather than recomputed from the new
                 * total: each tender's share was worked out against the bill it
                 * pays, and re-deriving from a running sum would drift by a
                 * tiyin per split.
                 */
                'vat_total' => $existing->vat_total + $this->vatInside($payment, $amount),
            ]);

            return $existing->refresh();
        });
    }

    /**
     * File once the surrounding transaction commits.
     *
     * Never inside it. A network call inside a payment's transaction holds row
     * locks open for as long as the tax service takes to answer, and a rollback
     * would undo money that has physically been handed over.
     */
    private function fileAfterCommit(FiscalReceipt $receipt): void
    {
        DB::afterCommit(function () use ($receipt): void {
            try {
                $this->file($receipt);
            } catch (Throwable $failure) {
                // `file()` already swallows everything it expects. This is the
                // belt for the unexpected — an after-commit callback that threw
                // would surface as a failed request for a sale that succeeded.
                Log::error('fiscal.file_failed', [
                    'receipt_id' => $receipt->getKey(),
                    'error' => $failure->getMessage(),
                ]);
            }
        });
    }

    private function documentFor(FiscalReceipt $receipt): FiscalDocument
    {
        return new FiscalDocument(
            kind: $receipt->kind,
            orderId: $receipt->order_id === null ? null : (int) $receipt->order_id,
            orderNumber: $receipt->order_number,
            total: $receipt->total,
            cashTotal: $receipt->cash_total,
            cardTotal: $receipt->card_total,
            vatTotal: $receipt->vat_total,
            moduleNo: config('finance.fiscal.module_no') === null
                ? null
                : (string) config('finance.fiscal.module_no'),
            correctsSign: $receipt->parent?->fiscal_sign,
            lines: $this->linesFor($receipt),
        );
    }

    /**
     * What was sold, in the terms a fiscal provider itemises.
     *
     * Empty until now, and legal to leave empty — several providers take a
     * total-only declaration and ask for nothing else. But the ones that
     * itemise want a classification code per line, and this platform has been
     * carrying one since `menu.menu_items.plu` was added: the IKPU category a
     * dish is sold as, which is the authority's word rather than the
     * restaurant's.
     *
     * Read from the bill, through the contract, and therefore from the SNAPSHOT
     * on the line rather than from the catalogue. That is the whole reason the
     * code was copied onto `orders.order_items` at sale time: a dish
     * reclassified in March must not change what February declared, because the
     * authority is holding February's version and a mismatch is what an audit
     * finds.
     *
     * Empty when there is no bill — a shift-level correction, or a payment taken
     * with no order behind it — and that is the honest answer rather than a
     * fabricated line.
     *
     * @return array<int, array<string, mixed>>
     */
    private function linesFor(FiscalReceipt $receipt): array
    {
        if ($receipt->order_id === null) {
            return [];
        }

        $bill = $this->bills->find((int) $receipt->order_id);

        if ($bill === null) {
            return [];
        }

        return array_values(array_map(
            static fn (BillLine $line): array => [
                'name' => $line->title,
                'plu' => $line->plu,
                'sku' => $line->sku,
                'quantity' => $line->quantity,
                'unit_price' => $line->unitPrice,
                'total' => $line->totalPrice,
            ],
            // A cancelled line already carries `total_price` 0, and declaring a
            // zero-value line is declaring a sale that did not happen. Filtered
            // here rather than in the contract, because a till legitimately
            // draws voided lines — a receipt may not.
            array_filter(
                $bill->lines,
                static fn (BillLine $line): bool => $line->status !== 'cancelled',
            ),
        ));
    }

    /**
     * The VAT inside one tender, in the proportion the bill declared it.
     *
     * Not `amount x 12 / 112`. That looks equivalent and is wrong whenever a
     * bill carries a delivery fee: `BillTotals` keeps the fee OUTSIDE the tax
     * base, so a rate applied to the whole tender over-declares by the VAT on
     * the delivery. It is also wrong on a discounted bill, where the tax was
     * read out of the discounted sum rather than the menu price.
     *
     * So the authority is the order's own `vat_included` — the figure the guest
     * was shown — apportioned across the tenders that pay it. A bill settled by
     * card and cash declares the same total VAT as one settled by card alone.
     *
     * Falls back to the configured rate when there is no order to ask: a
     * payment with no `order_id`, or a venue running Finance without the Orders
     * module. Better an approximation than a declaration claiming a sale
     * carried no tax at all.
     */
    private function vatInside(Payment $payment, int $amount): int
    {
        if ($amount <= 0) {
            return 0;
        }

        $bill = $payment->order_id === null ? null : $this->bills->find((int) $payment->order_id);

        if ($bill !== null && $bill->total > 0 && $bill->vatIncluded > 0) {
            /*
             * `intdiv`, so the parts of a split bill can never add up to more
             * VAT than the whole declared. A tiyin lost to truncation is a
             * tiyin under-declared on one receipt out of a split; a tiyin
             * gained is an over-declaration on every single one.
             */
            return intdiv($bill->vatIncluded * $amount, $bill->total);
        }

        /*
         * The platform's rate, from the calculator that owns it — not a literal
         * and not a config key nobody wrote. `BillTotals` is where DECISIONS Q1
         * lives, and a second twelve in this file is how a rate change becomes
         * a tax problem instead of an edit.
         */
        $rate = BillTotals::VAT_PERCENT;

        /*
         * No zero guard, because the arithmetic already is one: at a rate of
         * zero the numerator is zero and the divisor is a hundred, so the
         * answer is zero without a branch. The guard that used to be here was a
         * comparison against a constant — always true, and static analysis said
         * so — which reads as protection and provides none.
         */
        return (int) round($amount * $rate / (100 + $rate));
    }

    /**
     * VAT on a partial reversal, in the proportion the original declared it.
     *
     * Recomputing it from a rate would be wrong twice over: the rate may have
     * changed since, and the original document is what the authority holds. So
     * the correction carries the same share of VAT that the sale did.
     */
    private function vatShareOf(FiscalReceipt $sale, int $amount): int
    {
        if ($sale->total <= 0 || $sale->vat_total <= 0) {
            return 0;
        }

        return intdiv($sale->vat_total * $amount, $sale->total);
    }

    /**
     * Put the fiscal number on the money it covers.
     */
    private function stampPayments(FiscalReceipt $receipt, string $sign): void
    {
        if ($receipt->order_id === null) {
            return;
        }

        Payment::query()
            ->where('order_id', $receipt->order_id)
            ->whereNull('fiscal_receipt_no')
            ->update(['fiscal_receipt_no' => $sign]);
    }

    /**
     * The window closed. Loud, because this is no longer a queue item.
     */
    private function expire(FiscalReceipt $receipt): FiscalReceipt
    {
        $receipt->update([
            'status' => 'expired',
            'last_error' => $receipt->last_error ?? 'Fiskallashtirish oynasi yopildi.',
        ]);

        $this->events->publish(new FiscalReceiptExpired($receipt));

        return $receipt->refresh();
    }
}
