<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Marketplace\Http\Resources\SettlementResource;
use Modules\Marketplace\Models\MarketOrder;
use Modules\Marketplace\Models\Placement;
use Modules\Marketplace\Models\Settlement;
use Modules\Marketplace\Models\Store;
use Modules\Marketplace\Support\MarketOrderState;

/**
 * What the marketplace has paid this restaurant, and what it still owes.
 *
 * Two different things, and the screen shows both because a merchant checks
 * them in opposite directions. The issued statements are history — frozen,
 * quotable, reconcilable against a bank account. The running total is the week
 * in progress, and it MOVES: an order delivered ten minutes ago is in it.
 *
 * Deriving the history from live orders would collapse the two and make the
 * first one wrong. See the migration.
 */
final class MerchantSettlementController extends Controller
{
    private const MAX_PER_PAGE = 60;

    /** GET /api/v1/marketplace/settlements */
    public function index(Request $request): JsonResponse
    {
        $page = Settlement::query()
            ->orderByDesc('period_start')
            ->paginate(min($request->integer('per_page', 12), self::MAX_PER_PAGE))
            ->withQueryString();

        /*
         * The week so far: delivered orders no statement has claimed yet.
         *
         * `settlement_id is null` is the whole definition, and it is why that
         * column exists rather than a date range: a delivery that arrived late
         * on Sunday and was invoiced on Tuesday must not appear in both the
         * statement that paid for it and the running total beside it.
         */
        $pending = MarketOrder::query()
            ->where('state', MarketOrderState::Delivered->value)
            ->whereNull('settlement_id');

        return response()->json([
            'data' => SettlementResource::collection($page->items())->resolve($request),
            'meta' => [
                'total' => $page->total(),
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'pending' => [
                    'orders_count' => (clone $pending)->count(),
                    'gross_tiyin' => (int) (clone $pending)->sum('subtotal_tiyin'),
                    'commission_tiyin' => (int) (clone $pending)->sum('commission_tiyin'),
                    'payable_tiyin' => (int) $pending->sum('merchant_due_tiyin'),
                ],
            ],
        ]);
    }

    /**
     * GET /api/v1/marketplace/settlements/{settlement}
     *
     * One statement, opened up: the orders it paid for, the banner days it
     * charged for, and the document a merchant hands to an accountant.
     *
     * ------------------------------------------------------------------------
     * `statement` is a rendering, and the figures in it are still the row's
     *
     * The totals are read off `marketplace.settlements` and never recomputed —
     * that is the whole reason a statement is a row. What the block adds is the
     * things a piece of paper needs and a payout row does not: who it is
     * addressed to, which bank it is going to, and the arithmetic broken into
     * lines a person can add up by hand.
     *
     * The A4 pipeline does not exist, so this is JSON and the printable version
     * is the documents surface at `/documents?d=settlement&id=`. An accountant
     * accepts a printed page; they do not accept a JSON file, which is why the
     * merchant panel links to that page rather than downloading this.
     */
    public function show(Request $request, Settlement $settlement): JsonResponse
    {
        $orders = MarketOrder::query()
            ->where('settlement_id', $settlement->id)
            ->orderBy('delivered_at')
            ->get(['id', 'number', 'delivered_at', 'subtotal_tiyin', 'total_tiyin', 'commission_tiyin', 'merchant_due_tiyin']);

        $placements = Placement::query()
            ->where('settlement_id', $settlement->id)
            ->orderBy('starts_on')
            ->get();

        $placementTotal = (int) $placements->sum('total_tiyin');

        /*
         * What is left of `adjustments_tiyin` once the banner days are taken
         * out is the dispute credits. Derived rather than stored as a second
         * column, because the two must always add up to the figure the merchant
         * was actually paid on — and two columns that can disagree with a third
         * is exactly how a statement stops reconciling.
         */
        $credits = max(0, $settlement->adjustments_tiyin - $placementTotal);

        $store = $settlement->store ?? Store::query()->first();

        return response()->json([
            'data' => [
                ...(new SettlementResource($settlement))->resolve($request),

                'orders' => $orders->map(static fn (MarketOrder $order): array => [
                    'id' => $order->id,
                    'number' => $order->number,
                    'delivered_at' => $order->delivered_at?->toIso8601String(),
                    'subtotal_tiyin' => $order->subtotal_tiyin,
                    'total_tiyin' => $order->total_tiyin,
                    'commission_tiyin' => $order->commission_tiyin,
                    'merchant_due_tiyin' => $order->merchant_due_tiyin,
                ])->all(),

                'placements' => $placements->map(static fn (Placement $placement): array => [
                    'id' => $placement->id,
                    'slot' => $placement->slot,
                    'days' => $placement->days,
                    'total_tiyin' => $placement->total_tiyin,
                ])->all(),

                'statement' => [
                    'invoice_number' => $settlement->invoice_number,
                    // The day the paper is dated. `created_at` and not today:
                    // a statement reprinted in March is still February's.
                    'issued_on' => $settlement->created_at?->toDateString(),
                    'period_start' => $settlement->period_start->toDateString(),
                    'period_end' => $settlement->period_end->toDateString(),

                    'store' => $store === null ? null : [
                        'name' => $store->name,
                        'slug' => $store->slug,
                    ],

                    /*
                     * Three lines and they add up to the payout. Labelled in
                     * three languages here rather than in the client, because
                     * this is the one document on the platform that leaves the
                     * building — an accountant and a bank read it, and a client
                     * that supplied its own wording would produce two versions
                     * of the same invoice.
                     */
                    'lines' => [
                        [
                            'key' => 'gross',
                            'label' => ['uz' => 'Sotilgan taomlar', 'ru' => 'Продано блюд', 'en' => 'Food sold'],
                            'count' => $settlement->orders_count,
                            'amount_tiyin' => $settlement->gross_tiyin,
                        ],
                        [
                            'key' => 'commission',
                            'label' => ['uz' => 'Bozor komissiyasi', 'ru' => 'Комиссия маркетплейса', 'en' => 'Marketplace commission'],
                            'count' => $settlement->orders_count,
                            'amount_tiyin' => -$settlement->commission_tiyin,
                        ],
                        [
                            'key' => 'placements',
                            'label' => ['uz' => 'Reklama joylashuvi', 'ru' => 'Платное размещение', 'en' => 'Paid placement'],
                            'count' => (int) $placements->sum('days'),
                            'amount_tiyin' => -$placementTotal,
                        ],
                        [
                            'key' => 'credits',
                            'label' => ['uz' => 'Murojaatlar bo\'yicha qaytarish', 'ru' => 'Возвраты по обращениям', 'en' => 'Dispute credits'],
                            'count' => null,
                            'amount_tiyin' => -$credits,
                        ],
                    ],

                    'gross_tiyin' => $settlement->gross_tiyin,
                    'commission_tiyin' => $settlement->commission_tiyin,
                    'adjustments_tiyin' => $settlement->adjustments_tiyin,
                    'payable_tiyin' => $settlement->payable_tiyin,

                    /*
                     * Masked, and this is the one place it differs from the
                     * merchant's own payout screen. A statement is a document
                     * that leaves the building; the last four digits are enough
                     * for a bank to match it, and the full number printed on a
                     * page that gets emailed is a payout somebody can redirect.
                     */
                    'payout' => $store === null ? null : [
                        'bank_name' => $store->payout['bank_name'] ?? null,
                        'mfo' => $store->payout['mfo'] ?? null,
                        'account_last4' => $store->payoutMasked(),
                        'inn' => $store->payout['inn'] ?? null,
                        'holder' => $store->payout['holder'] ?? null,
                        'state' => $store->payout_state ?? 'incomplete',
                    ],
                ],
            ],
        ]);
    }
}
