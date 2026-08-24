<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Marketplace\Http\Requests\SavePayoutRequest;
use Modules\Marketplace\Models\Store;

/**
 * Where a week's takings are sent, and who has looked at it.
 *
 * ---------------------------------------------------------------------------
 * Behind `marketplace.manage` on the READ as well as the write
 *
 * Every other read in this module is `marketplace.view`, which a shift manager
 * holds. This one is not: bank details are the owner's, and a screen a person
 * answering the telephone at eight can open is a bank account on a shoulder
 * somebody is looking over. The same split the store settings route already
 * makes between marking a shop closed and changing its delivery fee, one step
 * further along.
 *
 * ---------------------------------------------------------------------------
 * Every write goes back into review
 *
 * `Store::savePayout()` resets `payout_state` to `pending_review` and clears the
 * verification date. This is the field somebody with a stolen session would
 * change, and "verified" has to mean a human looked at THIS account rather than
 * at whichever one was there last month. The merchant screen warns about it
 * before the save — a payout that silently stops on the Thursday it was due is
 * worse than one that was never promised.
 */
final class MerchantPayoutController extends Controller
{
    /** GET /api/v1/marketplace/settings/payout */
    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->payload($this->store())]);
    }

    /** PUT /api/v1/marketplace/settings/payout */
    public function update(SavePayoutRequest $request): JsonResponse
    {
        $store = $this->store();

        /** @var array{bank_name: string, mfo: string, account: string, inn: string, holder: string} $details */
        $details = $request->validated();

        $store->savePayout($details);

        return response()->json(['data' => $this->payload($store)]);
    }

    /**
     * The details as the owner sees them.
     *
     * The full account is returned here and NOT by any other endpoint. The
     * person reading this screen typed it and has to be able to check it
     * against a bank letter; a masked field they cannot verify is a field they
     * re-type from memory and get wrong. Everywhere else — the statement, the
     * platform's review queue — reads `payoutMasked()`.
     *
     * @return array<string, mixed>
     */
    private function payload(Store $store): array
    {
        $payout = is_array($store->payout) ? $store->payout : [];

        return [
            'bank_name' => $payout['bank_name'] ?? null,
            'mfo' => $payout['mfo'] ?? null,
            'account' => $payout['account'] ?? null,
            'account_last4' => $store->payoutMasked(),
            'inn' => $payout['inn'] ?? null,
            'holder' => $payout['holder'] ?? null,

            // `incomplete` rather than null, so the client has one word for
            // "nothing has been entered" instead of having to test five fields.
            'state' => $store->payout_state ?? 'incomplete',
            'verified_at' => $store->payout_verified_at?->toIso8601String(),
        ];
    }

    /**
     * This restaurant's storefront, found by the policies rather than by an id.
     */
    private function store(): Store
    {
        $store = Store::query()->first();

        if ($store === null) {
            throw ApiException::of('marketplace.no_storefront');
        }

        return $store;
    }
}
