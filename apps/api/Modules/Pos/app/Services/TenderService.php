<?php

declare(strict_types=1);

namespace Modules\Pos\Services;

use App\Contracts\Finance\Tender;
use App\Contracts\Finance\TillLedger;
use App\Contracts\Orders\BillRegistry;
use Illuminate\Support\Facades\DB;
use Modules\Pos\Models\Terminal;
use RuntimeException;

/**
 * Settling a bill, in however many pieces the guests want.
 *
 * A table of four paying with two cards and a handful of notes is one bill and
 * three tenders. Getting that right is mostly arithmetic, and all of it in
 * tiyin — the moment a float appears here, a hundredth of a so'm per line
 * multiplied by a day's covers becomes a real difference in a real drawer.
 *
 * Two rules are worth stating because they are easy to get backwards:
 *
 *  - Change only ever comes out of cash. Overpaying by card is not generosity,
 *    it is a mistake, and handing back notes for it turns a card terminal into
 *    a cash machine.
 *  - Everything happens in one transaction. A settlement that captured two of
 *    three tenders and then failed would leave a bill that is neither open nor
 *    paid, and a guest who has been charged twice for a meal they still owe for.
 */
final class TenderService
{
    public function __construct(
        private readonly BillRegistry $bills,
        private readonly TillLedger $till,
    ) {}

    /**
     * @param array<int, array{method: string, amount: int, reference?: string|null}> $tenders
     *
     * @return array{bill: array<string, mixed>, payment_ids: array<int, int>, change: int, settled: bool}
     */
    public function settle(Terminal $terminal, int $billId, int $shiftId, array $tenders): array
    {
        if ($tenders === []) {
            throw new RuntimeException('Kamida bitta to\'lov usuli ko\'rsatilishi kerak.');
        }

        return DB::transaction(function () use ($terminal, $billId, $shiftId, $tenders): array {
            $bill = $this->bills->find($billId);

            if ($bill === null) {
                throw new RuntimeException("#{$billId} hisobi topilmadi.");
            }

            if (! $bill->isOpen()) {
                throw new RuntimeException("#{$bill->number} hisobi allaqachon yopilgan.");
            }

            $offered = 0;
            $cashOffered = 0;

            foreach ($tenders as $line) {
                $amount = (int) $line['amount'];

                if ($amount <= 0) {
                    throw new RuntimeException('To\'lov summasi noldan katta bo\'lishi kerak.');
                }

                $offered += $amount;

                if ($line['method'] === 'cash') {
                    $cashOffered += $amount;
                }
            }

            $due = $bill->total;
            $overpaid = max(0, $offered - $due);

            // Anything over the bill has to be coverable in cash, because that
            // is the only form change can take.
            if ($overpaid > $cashOffered) {
                throw new RuntimeException('Ortiqcha to\'lov faqat naqddan qaytariladi.');
            }

            $paymentIds = [];

            foreach ($tenders as $line) {
                $paymentIds[] = $this->till->capture(
                    shiftId: $shiftId,
                    orderId: $bill->id,
                    orderNumber: $bill->number,
                    tender: new Tender(
                        method: (string) $line['method'],
                        amount: (int) $line['amount'],
                        reference: isset($line['reference']) ? (string) $line['reference'] : null,
                    ),
                );
            }

            $settled = $offered >= $due;

            // Underpaying is legitimate — a deposit, or one guest of four paying
            // early — so the bill simply stays open rather than being refused.
            $bill = $settled ? $this->bills->close($bill->id) : $this->bills->find($bill->id);

            return [
                'bill' => $bill?->toArray() ?? [],
                'payment_ids' => $paymentIds,
                'change' => $this->roundChange($terminal, $overpaid),
                'settled' => $settled,
                'due' => $due,
                'offered' => $offered,
            ];
        });
    }

    /**
     * Round change to the smallest note anybody actually carries.
     *
     * Uzbekistan has no coin below one so'm, so a drawer cannot pay out 37
     * tiyin however correct the arithmetic is. Rounding down keeps the
     * restaurant on the right side of the difference.
     */
    private function roundChange(Terminal $terminal, int $change): int
    {
        $step = (int) ($terminal->settings['cash_rounding_tiyin'] ?? 100);

        if ($step <= 1 || $change <= 0) {
            return $change;
        }

        return intdiv($change, $step) * $step;
    }
}
