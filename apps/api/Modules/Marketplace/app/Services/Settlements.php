<?php

declare(strict_types=1);

namespace Modules\Marketplace\Services;

use App\Support\Counters\BranchCounters;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Modules\Marketplace\Models\Dispute;
use Modules\Marketplace\Models\MarketOrder;
use Modules\Marketplace\Models\Placement;
use Modules\Marketplace\Models\Settlement;
use Modules\Marketplace\Models\Store;
use Modules\Marketplace\Support\MarketOrderState;

/**
 * What the marketplace owes one restaurant for one week, worked out once.
 *
 * ---------------------------------------------------------------------------
 * Why a statement is a ROW and not a query
 *
 * A merchant reconciles this against a bank account. If the figures were
 * derived from live orders every time the screen was opened, a refund granted
 * on Friday would silently change what Monday's statement said, and a merchant
 * who cannot reproduce last month's number stops trusting all of them. So the
 * run freezes the arithmetic into `marketplace.settlements` and STAMPS every
 * order it paid for with `settlement_id`.
 *
 * That stamp is also the only definition of "not yet paid for". The running
 * total the merchant panel shows beside the history is `settlement_id is null`
 * — which is why a delivery that arrived late on Sunday and was invoiced on
 * Tuesday appears in exactly one of the two rather than in both.
 *
 * ---------------------------------------------------------------------------
 * The arithmetic
 *
 *     gross         food sold at market prices — `subtotal_tiyin`, not `total`.
 *                   The delivery fee and the service fee are the PLATFORM's and
 *                   never the restaurant's; including them would show a merchant
 *                   a turnover they never earned and then deduct it again.
 *     commission     what the marketplace keeps, snapshotted per order at the
 *                   rate that was live when it was placed.
 *     adjustments    dispute credits the merchant accepted, plus the banner
 *                   days they bought. Both come off the payout.
 *     payable        gross − commission − adjustments, floored at zero.
 *
 * A merchant whose adjustments exceed their week does not get a negative
 * payout: the column is unsigned, a bank cannot be asked for money by a
 * transfer, and the balance carries into the next week by simply not being
 * stamped. The floor is deliberate and is where that carry happens.
 *
 * ---------------------------------------------------------------------------
 * Idempotent by the unique index, not by a flag
 *
 * `(tenant_id, store_id, period_start)` is unique. Running `marketplace:settle`
 * twice for the same week finds the existing statement and does nothing — which
 * matters because a scheduler that fires twice after a deploy is ordinary, and a
 * merchant paid twice is not.
 */
final readonly class Settlements
{
    public function __construct(private BranchCounters $counters) {}

    /**
     * Issue one storefront's statement for one period, or return the one that
     * already exists.
     *
     * Runs INSIDE the storefront's own tenancy — the caller is responsible for
     * that, because a settlement written under a bypass would be a row with no
     * owner. See `SettleMerchants`, which uses `focusDuring()`.
     */
    public function issue(Store $store, CarbonImmutable $from, CarbonImmutable $to): Settlement
    {
        $existing = Settlement::query()
            ->where('store_id', $store->id)
            ->where('period_start', $from->toDateString())
            ->first();

        if ($existing instanceof Settlement) {
            return $existing;
        }

        return DB::transaction(function () use ($store, $from, $to): Settlement {
            /*
             * `business_date` and not `delivered_at`, and the difference is the
             * trading day: a restaurant's day runs 06:00 → 06:00, so an order
             * delivered at half past midnight on Monday belongs to Sunday's
             * takings and to Sunday's week. `whereBetween` on a date column
             * rather than `whereDate()` on a timestamp — `ModuleBoundaryTest`
             * refuses the latter by name because it wraps the column in a
             * function and throws the index away.
             */
            $orders = MarketOrder::query()
                ->where('store_id', $store->id)
                ->where('state', MarketOrderState::Delivered->value)
                ->whereNull('settlement_id')
                ->whereBetween('business_date', [$from->toDateString(), $to->toDateString()]);

            $ids = (clone $orders)->pluck('id')->all();

            $gross = (int) (clone $orders)->sum('subtotal_tiyin');
            $commission = (int) (clone $orders)->sum('commission_tiyin');
            $count = count($ids);

            $credits = $this->disputeCredits($ids);
            $placements = $this->placementsDue($store, $from, $to);
            $placementTotal = array_sum(array_map(
                static fn (Placement $placement): int => $placement->unbilled(),
                $placements,
            ));

            $adjustments = $credits + $placementTotal;

            $settlement = Settlement::create([
                'store_id' => $store->id,
                'invoice_number' => $this->nextInvoiceNumber($to),
                'period_start' => $from->toDateString(),
                'period_end' => $to->toDateString(),
                'orders_count' => $count,
                'gross_tiyin' => $gross,
                'commission_tiyin' => $commission,
                'adjustments_tiyin' => $adjustments,
                // Never negative — see the docblock. What is not paid this week
                // is simply not stamped, and lands in the next one.
                'payable_tiyin' => max(0, $gross - $commission - $adjustments),
                'state' => 'due',
            ]);

            /*
             * The stamp, and it is the whole point of the run.
             *
             * Done in one UPDATE keyed by the ids gathered above rather than by
             * re-running the filter, so an order delivered between the SELECT
             * and the UPDATE lands in next week's statement instead of being
             * paid for by a total that never counted it.
             */
            if ($ids !== []) {
                MarketOrder::query()->whereIn('id', $ids)->update(['settlement_id' => $settlement->id]);
            }

            foreach ($placements as $placement) {
                $placement->forceFill([
                    'billed_tiyin' => $placement->billed_tiyin + $placement->unbilled(),
                    'settlement_id' => $settlement->id,
                    // A run that has ended and been paid for is finished. One
                    // still on air keeps its state and is billed again next week
                    // for the days that have since run.
                    'state' => $placement->ends_on->lessThanOrEqualTo($to) ? 'finished' : $placement->state,
                ])->save();
            }

            return $settlement;
        });
    }

    /**
     * Refunds this restaurant agreed to, on the orders in this statement.
     *
     * Only `accepted` and `resolved` disputes count. An open complaint is an
     * argument in progress and deducting it would take money off a merchant
     * for something they may yet win; a contested one is explicitly disputed.
     * Both land in a later week when they close, which is the correct place for
     * them — a statement is a record of what was known when it was issued.
     *
     * @param array<int, int> $orderIds
     */
    private function disputeCredits(array $orderIds): int
    {
        if ($orderIds === []) {
            return 0;
        }

        return (int) Dispute::query()
            ->whereIn('order_id', $orderIds)
            ->whereIn('state', ['accepted', 'resolved'])
            ->sum('amount_tiyin');
    }

    /**
     * Banner days that have run and have not been charged for.
     *
     * A placement is billed by the DAY, so one cancelled on Wednesday costs
     * three days rather than seven — `unbilled()` is the arithmetic and this is
     * the filter. Runs that start after the period are not touched: a merchant
     * who booked next month must not be charged for it this week.
     *
     * @return array<int, Placement>
     */
    private function placementsDue(Store $store, CarbonImmutable $from, CarbonImmutable $to): array
    {
        return Placement::query()
            ->where('store_id', $store->id)
            ->whereIn('state', ['booked', 'running', 'finished', 'cancelled'])
            ->whereNull('settlement_id')
            ->where('starts_on', '<=', $to->toDateString())
            ->get()
            ->filter(static fn (Placement $placement): bool => $placement->unbilled() > 0)
            ->values()
            ->all();
    }

    /**
     * `MP-INV-2026-0833` — what a merchant quotes down a telephone.
     *
     * The sequence is per restaurant and per year, taken from `branch_counters`
     * with no branch: a payout is the business's rather than one venue's, and
     * `max(id)+1` under two workers is two merchants holding the same invoice
     * number. The counter is taken inside the transaction that writes the row,
     * so a rolled-back run gives its number back.
     */
    private function nextInvoiceNumber(CarbonImmutable $to): string
    {
        $year = $to->format('Y');
        $serial = $this->counters->next('marketplace.settlement', null, $year);

        return sprintf('MP-INV-%s-%04d', $year, $serial);
    }
}
