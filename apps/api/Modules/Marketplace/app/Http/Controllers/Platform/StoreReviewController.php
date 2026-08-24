<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\DatabaseTenancy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Marketplace\Models\Store;

/**
 * The platform operator's review of where a restaurant's money goes.
 *
 * ---------------------------------------------------------------------------
 * Why this is not a merchant endpoint
 *
 * A payout account that a merchant could mark verified is a payout account
 * nobody checks. The whole value of `payout_state` is that a person outside the
 * restaurant confirmed the account belongs to the business named on the
 * statement — which is what stops an attacker with a stolen owner session
 * redirecting a week's takings — so the verify side lives here, behind
 * `role:super-admin`, and no permission a restaurant can hold opens it.
 *
 * ---------------------------------------------------------------------------
 * Cross-tenant by definition, and safe for the same reason the rest of the
 * platform console is
 *
 * `ResolveTenant` already recognises the platform operator — tenant_id null,
 * super-admin — and OPENS the row-level-security policies for them. So `Store`
 * queries here read every restaurant's storefront without a `withoutTenancy()`
 * call anywhere, exactly like `Platform\TenantController` does.
 *
 * ---------------------------------------------------------------------------
 * The account is masked here and nowhere else is it not
 *
 * A reviewer needs to see that an account was entered, to tell two of them
 * apart, and to read the bank, the MFO and the tax number — none of which needs
 * twenty digits on a screen somebody screen-shares. The full number is returned
 * only to the merchant who typed it, on their own settings endpoint.
 */
final class StoreReviewController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function __construct(private readonly DatabaseTenancy $database) {}

    /** GET /api/v1/platform/marketplace/stores */
    public function index(Request $request): JsonResponse
    {
        $page = Store::query()
            ->when(
                $request->filled('payout_state'),
                fn ($query) => $query->where('payout_state', (string) $request->string('payout_state')),
            )
            ->when(
                $request->filled('status'),
                fn ($query) => $query->where('status', (string) $request->string('status')),
            )
            /*
             * Waiting first. This screen is a queue, and a queue sorted by id
             * buries the shop that has been waiting since Tuesday under the
             * forty that were verified months ago.
             */
            ->orderByRaw("case when payout_state = 'pending_review' then 0 else 1 end")
            ->orderBy('id')
            ->paginate(min($request->integer('per_page', 25), self::MAX_PER_PAGE))
            ->withQueryString();

        return response()->json([
            'data' => array_map($this->row(...), $page->items()),
            'meta' => [
                'total' => $page->total(),
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
            ],
        ]);
    }

    /**
     * PATCH /api/v1/platform/marketplace/stores/{store}/verify
     *
     * Bound by id and not by slug. `Store::getRouteKeyName()` answers `slug`,
     * which is right for every public URL and wrong here: the operator console
     * holds the row it is looking at, and a review queue has no reason to make
     * the round trip through a public URL segment.
     */
    public function verify(Request $request, Store $store): JsonResponse
    {
        $data = $request->validate([
            'state' => ['required', Rule::in(['verified', 'pending_review'])],
            // What the reviewer saw. Recorded on the audit trail rather than on
            // the row: a rejection reason stored beside the account would be
            // read by the merchant, and half of them are "this looks like
            // somebody else's business".
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        if ($store->payout === null) {
            // Nothing to verify. Refused clearly rather than marking an empty
            // account verified, which would let a payout run against nothing.
            throw ApiException::of('marketplace.payout_missing');
        }

        $store->forceFill([
            'payout_state' => $data['state'],
            'payout_verified_at' => $data['state'] === 'verified' ? now() : null,
        ])->save();

        /*
         * The operator's own record, and it belongs to no restaurant.
         *
         * `causedBy` is the operator, whose `tenant_id` is null — and
         * `activity_log` is a guarded table, so an unstamped row is refused
         * unless the connection is open. `AdminAuthController` says the same
         * thing for the same reason at the platform's front door: widening the
         * policy to allow NULL rows would let any request that merely forgot
         * its tenant write entries no restaurant can read, which puts holes in
         * the one trail that exists to be complete.
         *
         * The row is written against the STORE, so the restaurant reading its
         * own audit log sees that its payout account was reviewed and when.
         */
        $this->database->withoutTenancy(function () use ($store, $data): void {
            activity('marketplace.payout')
                ->performedOn($store)
                ->causedBy(request()->user())
                ->withProperties([
                    'state' => $data['state'],
                    'note' => $data['note'] ?? null,
                    // The last four digits and never the account. An audit row
                    // is read by more people than the settings screen is.
                    'account_last4' => $store->payoutMasked(),
                ])
                ->log('platform.payout-reviewed');
        });

        return response()->json(['data' => $this->row($store)]);
    }

    /**
     * One row of the queue.
     *
     * @return array<string, mixed>
     */
    private function row(Store $store): array
    {
        $payout = is_array($store->payout) ? $store->payout : [];

        return [
            'id' => $store->id,
            'tenant_id' => $store->tenant_id,
            'name' => $store->name,
            'slug' => $store->slug,
            'status' => $store->status,
            'payout_state' => $store->payout_state ?? 'incomplete',
            'payout_verified_at' => $store->payout_verified_at?->toIso8601String(),
            'payout' => $store->payout === null ? null : [
                'bank_name' => $payout['bank_name'] ?? null,
                'mfo' => $payout['mfo'] ?? null,
                'account_last4' => $store->payoutMasked(),
                'inn' => $payout['inn'] ?? null,
                'holder' => $payout['holder'] ?? null,
            ],
            'updated_at' => $store->updated_at?->toIso8601String(),
        ];
    }
}
