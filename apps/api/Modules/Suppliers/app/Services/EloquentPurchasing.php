<?php

declare(strict_types=1);

namespace Modules\Suppliers\Services;

use App\Contracts\Suppliers\IncomingDelivery;
use App\Contracts\Suppliers\Payable;
use App\Contracts\Suppliers\Purchasing;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Modules\Suppliers\Models\PurchaseOrder;
use Modules\Suppliers\Models\Supplier;

/**
 * The purchasing ledger, answering the two dashboards that read it.
 *
 * Both callers are a panel on a home screen — the page a manager opens fifty
 * times a day — so everything here is capped and nothing walks a relation per
 * row. The supplier's name and terms arrive as correlated subqueries rather
 * than through `with('supplier')`, which is not a micro-optimisation: a
 * supplier the restaurant has stopped dealing with is soft-deleted, its
 * relation resolves to null, and the invoice it left behind is still owed.
 * `withTrashed()` on the subquery keeps the name on the row; the relation
 * would have dropped it and printed an em dash against real money.
 */
final class EloquentPurchasing implements Purchasing
{
    public function expectedBetween(string $from, string $to, int $limit = 10): array
    {
        /*
         * A range on the timestamp, computed in PHP, end exclusive.
         *
         * `whereDate()` is banned platform-wide — it wraps the column in a
         * function and PostgreSQL stops using the index — and `expected_at` is
         * a timestamp rather than a trading date, so the day has to become two
         * instants. Deriving them here rather than in SQL also keeps the clock
         * the application's: the database server answers `now()` in its own
         * zone, which on this box is five hours from the dining room.
         */
        $opens = Carbon::parse($from)->startOfDay();
        $closes = Carbon::parse($to)->startOfDay()->addDay();

        return $this->withSupplier(PurchaseOrder::query())
            ->withCount('items')
            ->where('status', '!=', 'cancelled')
            ->whereNotNull('expected_at')
            ->where('expected_at', '>=', $opens)
            ->where('expected_at', '<', $closes)
            ->orderBy('expected_at')
            ->limit($limit)
            ->get()
            ->map(fn (PurchaseOrder $order): IncomingDelivery => new IncomingDelivery(
                id: (int) $order->getKey(),
                number: $order->number,
                supplier: self::nameOf($order),
                lines: (int) ($order->getAttribute('items_count') ?? 0),
                expectedAt: $order->expected_at?->toIso8601String(),
                receivedAt: $order->received_at?->toIso8601String(),
                totalTiyin: (int) $order->total,
            ))
            ->values()
            ->all();
    }

    public function outstanding(int $limit = 10): array
    {
        return $this->withSupplier(PurchaseOrder::query())
            ->outstanding()
            /*
             * Received first, then oldest delivery first.
             *
             * Ordering by the derived due date is not available in SQL without
             * repeating the terms arithmetic in the query, and "when it
             * arrived" is the same order in every case that matters: two
             * invoices from one supplier age in the order they landed. The
             * list is re-sorted below, once the dates exist.
             */
            ->orderByRaw('received_at is null')
            ->orderBy('received_at')
            ->limit($limit)
            ->get()
            ->map(fn (PurchaseOrder $order): Payable => new Payable(
                id: (int) $order->getKey(),
                number: $order->number,
                supplier: self::nameOf($order),
                // What is LEFT. A part-settled invoice shown at its full value
                // overstates the debt by exactly what has already been paid.
                amountTiyin: self::owedOn($order),
                dueAt: self::dueAt($order),
            ))
            ->sortBy(static fn (Payable $row): string => $row->dueAt ?? '9999-12-31')
            ->values()
            ->all();
    }

    public function payablesSummary(): array
    {
        $rows = $this->withSupplier(PurchaseOrder::query())->outstanding()->get();

        // The reader's clock, not the database's. See expectedBetween() — and
        // ModuleBoundaryTest refuses a timestamp compared against SQL now().
        $now = Carbon::now();

        $overdue = $rows->filter(static function (PurchaseOrder $order) use ($now): bool {
            $due = self::dueAt($order);

            return $due !== null && Carbon::parse($due)->lessThan($now);
        })->count();

        return [
            'unpaid' => $rows->count(),
            'overdue' => $overdue,
            'amount_tiyin' => (int) $rows->sum(
                static fn (PurchaseOrder $order): int => self::owedOn($order),
            ),
        ];
    }

    /**
     * The two supplier columns this contract publishes, as correlated subqueries.
     *
     * `withTrashed()` on both, for the reason the class docblock gives: a
     * supplier that has been struck off is still owed for what it delivered.
     *
     * @param Builder<PurchaseOrder> $query
     *
     * @return Builder<PurchaseOrder>
     */
    private function withSupplier(Builder $query): Builder
    {
        $column = static fn (string $name) => Supplier::query()
            ->withTrashed()
            ->select($name)
            ->whereColumn('suppliers.suppliers.id', 'suppliers.purchase_orders.supplier_id')
            ->limit(1);

        return $query
            ->select('suppliers.purchase_orders.*')
            ->addSelect(['supplier_name' => $column('name')])
            ->addSelect(['supplier_terms' => $column('payment_terms_days')]);
    }

    /** A supplier's trading name, or an em dash when the row is long gone. */
    private static function nameOf(PurchaseOrder $order): string
    {
        $name = $order->getAttribute('supplier_name');

        return is_string($name) && $name !== '' ? $name : '—';
    }

    /** What is still owed on this invoice, floored at zero. */
    private static function owedOn(PurchaseOrder $order): int
    {
        return max(0, (int) $order->total - (int) $order->paid_amount);
    }

    /**
     * When this invoice falls due.
     *
     * The supplier's own terms counted from the day the van arrived. Zero terms
     * is "pay at the door", which is a deadline of the delivery itself rather
     * than no deadline at all — a distinction that decides whether a cash
     * supplier ever shows up as overdue.
     *
     * Null while the order has not been received: the clock has not started,
     * and a due date invented from the order date would age a debt the
     * restaurant does not owe yet.
     */
    private static function dueAt(PurchaseOrder $order): ?string
    {
        if ($order->received_at === null) {
            return null;
        }

        $terms = max(0, (int) $order->getAttribute('supplier_terms'));

        return $order->received_at->copy()->addDays($terms)->toIso8601String();
    }
}
