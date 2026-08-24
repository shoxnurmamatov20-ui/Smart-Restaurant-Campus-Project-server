<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Branch;
use Illuminate\Http\JsonResponse;

/**
 * The restaurant's venues, for a guest who has not signed in.
 *
 * A chain's customer app has to ask "which branch" before it can price a
 * delivery or tell the guest where to collect. The authenticated `branches`
 * list answers that for staff; a stranger at `/customer` had nothing, so the
 * public order endpoint refuses a chain rather than guess
 * (`order.branch_unavailable`). This is the list that refusal points at.
 *
 * Only what a guest needs and only venues that are open for business: name,
 * where it is, when it opens, whether it delivers. No counters, no targets,
 * no staff — those stay behind the session.
 *
 * ---------------------------------------------------------------------------
 * Every key here is the key the order endpoint enforces
 *
 * It was not, and the drift was in the two figures that are money. This list
 * quoted `delivery.fee_tiyin` and `delivery.min_order_tiyin`;
 * `PublicOrderController` charges from `delivery_fee_tiyin` and refuses under
 * `min_order_tiyin` — different paths in the same JSON column, so the storefront
 * quoted a free delivery and the bill charged for one, or accepted a basket the
 * order endpoint then refused as too small. `pricing.ts` warns about exactly
 * this shape: when the phone says one number and the receipt says another, the
 * cashier is blamed.
 *
 * `PublicBranchQuoteTest` reads both sides out of one branch row and fails if
 * they ever disagree again.
 */
final class PublicBranchController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $venues = Branch::query()
            ->where('status', 'active')
            ->orderBy('name')
            ->get()
            ->map(fn (Branch $branch) => [
                'id' => $branch->id,
                'slug' => $branch->slug,
                'name' => $branch->name,
                'city' => $branch->city,
                'address' => $branch->address,
                'phone' => $branch->phone,
                'timezone' => $branch->timezone,
                /*
                 * Today's hours, from the week the console writes.
                 *
                 * `hours.opens` was read here and is written nowhere: the
                 * settings schema declares `hours.{day} => [open, close]`, and
                 * an undeclared path is dropped on write — so every venue
                 * answered `null` and the restaurant's own website printed no
                 * opening times at all. The flat pair still wins when a row
                 * carries one, because an older venue may.
                 */
                ...$this->hoursToday($branch),
                'delivers' => (bool) $branch->setting('delivery_enabled', true),
                'delivery_fee_tiyin' => (int) $branch->setting('delivery_fee_tiyin', 0),
                'free_delivery_over_tiyin' => (int) $branch->setting('free_delivery_over_tiyin', 0),
                'min_order_tiyin' => (int) $branch->setting('min_order_tiyin', 0),
                'lat' => $branch->setting('geo.lat'),
                'lng' => $branch->setting('geo.lng'),
            ]);

        return response()->json(['data' => $venues]);
    }

    /**
     * When this venue opens and closes today, in its own timezone.
     *
     * The week is stored as `{"mon": ["10:00", "23:00"], …}` and a missing day
     * is a day the venue is shut — which is why a closed day answers `null`
     * rather than `00:00`, and why the site's chip can say "Yopiq" truthfully.
     *
     * @return array{opens: ?string, closes: ?string}
     */
    private function hoursToday(Branch $branch): array
    {
        $flat = $branch->setting('hours.opens');

        if (is_string($flat) && $flat !== '') {
            $closes = $branch->setting('hours.closes');

            return ['opens' => $flat, 'closes' => is_string($closes) ? $closes : null];
        }

        $today = now($branch->timezone ?? config('app.timezone'))->format('D');
        $pair = $branch->setting('hours.'.strtolower($today));

        if (! is_array($pair) || count($pair) < 2) {
            return ['opens' => null, 'closes' => null];
        }

        $opens = $pair[0] ?? $pair['open'] ?? null;
        $closes = $pair[1] ?? $pair['close'] ?? null;

        return [
            'opens' => is_string($opens) ? $opens : null,
            'closes' => is_string($closes) ? $closes : null,
        ];
    }
}
