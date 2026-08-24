<?php

declare(strict_types=1);

namespace Modules\Marketplace\Services;

use App\Models\Tenant;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\DatabaseTenancy;
use App\Support\Tenancy\TenantContext;
use Closure;
use Illuminate\Database\Eloquent\Collection;
use Modules\Marketplace\Models\MarketOrder;
use Modules\Marketplace\Models\Placement;
use Modules\Marketplace\Models\Store;

/**
 * The one place in this module that reads across restaurants.
 *
 * Everything else in `Modules/Marketplace` runs under a resolved tenant like
 * the rest of the platform. This class is the exception, and keeping it to one
 * class is the point: `withoutTenancy()` opens EVERY policy-guarded table on
 * the connection, not just the two this module wanted, so the number of places
 * that call it is the size of the hole.
 *
 * ---------------------------------------------------------------------------
 * Why the marketplace needs it at all
 *
 * `GET /mp/stores` is a directory of forty restaurants. There is no `X-Tenant`
 * a consumer could send — asking them to name a restaurant before they have
 * chosen one is the opposite of what a marketplace is — and with the connection
 * fail-closed the query answers nothing at all rather than answering wrongly.
 * `StartTenancyClosed` makes that the default and `TenancyClaimTest` makes it a
 * decision somebody has to write down, which is what this paragraph is.
 *
 * Three shapes of cross-tenant read, and each is scoped by something else:
 *
 *   `live()`          — the public directory. Only `status = live` rows, and
 *                       only the columns a shop window has. No orders, no
 *                       customers, no money.
 *   `bySlug()`        — one storefront by its public URL segment.
 *   `ordersOf()`      — one CONSUMER's own orders, scoped by `consumer_id`.
 *                       Their history crosses tenants because they do.
 *
 * ---------------------------------------------------------------------------
 * And the way back in
 *
 * `asStore()` is the inverse and it matters more. Once a storefront is chosen,
 * everything that follows — reading its menu, writing its order, opening its
 * bill, firing its kitchen ticket — happens INSIDE that restaurant's tenancy,
 * with the policies on and stamping every row through `BelongsToTenant`. A
 * marketplace order written under a bypass would be a row with no owner, or
 * worse, one owned by whoever the last request happened to be.
 *
 * Both take a closure rather than being open/close pairs, for the reason
 * `DatabaseTenancy::withoutTenancy()` does: an early return or a thrown
 * exception cannot leave a request running with the whole platform visible.
 */
final readonly class StorefrontDirectory
{
    public function __construct(
        private DatabaseTenancy $database,
        private TenantContext $tenants,
        private BranchContext $branches,
    ) {}

    /**
     * Every storefront trading on the platform, filtered.
     *
     * @param string|null $vertical VERTICALS key — food, grocery, bakery, drinks
     * @param string|null $cuisine CUISINES key — osh, lavash, burger…
     * @param string|null $query Matches the trading name and the subtitle, any language
     *
     * @return Collection<int, Store>
     */
    public function live(
        ?string $vertical = null,
        ?string $cuisine = null,
        ?string $query = null,
        int $limit = 60,
    ): Collection {
        return $this->database->withoutTenancy(function () use ($vertical, $cuisine, $query, $limit): Collection {
            /*
             * Who has paid to be at the top today.
             *
             * `home_top` is the directory's own banner; `category_top` only
             * counts when the guest is actually inside a category, because a
             * shop that bought the lavash chip has not bought the front page.
             * Read here, inside the same open connection, because a placement
             * belongs to a restaurant and the directory belongs to none.
             */
            $promoted = $this->promoted($vertical !== null || $cuisine !== null);

            $stores = Store::query()
                ->live()
                ->when($vertical !== null, fn ($q) => $q->where('vertical', $vertical))
                ->when($cuisine !== null, fn ($q) => $q->where('cuisine', $cuisine));

            if ($query !== null && trim($query) !== '') {
                /*
                 * All three languages of the subtitle, not just the one on
                 * screen — somebody typing Russian into an Uzbek page still
                 * means the same restaurant. `searchStores()` on the consumer
                 * side searches the same three fields for the same reason.
                 */
                $like = '%'.mb_strtolower(trim($query)).'%';

                $stores->where(function ($q) use ($like): void {
                    $q->whereRaw('lower(name) like ?', [$like])
                        ->orWhereRaw('lower(cast(kind as text)) like ?', [$like])
                        ->orWhereRaw('lower(cast(offer as text)) like ?', [$like]);
                });
            }

            // Open shops first, then by rating. A closed restaurant is still
            // drawn — the design dims it rather than hiding it, because a
            // guest planning tomorrow needs to know it exists — but it does
            // not deserve the top of a list of places that will feed them now.
            $stores->orderByDesc('is_open');

            /*
             * Paid placement comes AFTER `is_open` and before the rating, and
             * that order is the product decision rather than an accident. A
             * restaurant that bought the banner and is closed cannot feed
             * anybody tonight, and putting it at the top of a hungry person's
             * list is the fastest way to make the whole directory untrustworthy.
             * What money buys here is the top of the shops that can actually
             * cook.
             */
            if ($promoted !== []) {
                $stores->orderByRaw(
                    'case when id in ('.implode(',', array_fill(0, count($promoted), '?')).') then 0 else 1 end',
                    $promoted,
                );
            }

            return $stores
                ->orderByDesc('rating_tenths')
                ->orderBy('id')
                ->limit($limit)
                ->get();
        });
    }

    /**
     * Store ids holding a live banner today.
     *
     * Called from inside `live()`'s open connection — never on its own, because
     * it reads a tenanted table across every restaurant and the whole point of
     * this class is that such reads happen in one place.
     *
     * `booked` and `running` both count: a placement's state is moved by the
     * weekly settlement rather than by a nightly job, so a run that began this
     * morning is still `booked` and is still on air.
     *
     * @return array<int, int>
     */
    private function promoted(bool $inACategory): array
    {
        $today = now()->toDateString();

        $slots = $inACategory ? ['home_top', 'category_top'] : ['home_top'];

        return Placement::query()
            ->withoutGlobalScopes()
            ->live()
            ->whereIn('slot', $slots)
            ->where('starts_on', '<=', $today)
            ->where('ends_on', '>=', $today)
            ->pluck('store_id')
            ->map(static fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    /** One storefront by its public slug, or null. */
    public function bySlug(string $slug): ?Store
    {
        return $this->database->withoutTenancy(
            static fn (): ?Store => Store::query()->live()->where('slug', $slug)->first(),
        );
    }

    /**
     * One consumer's own orders, newest first, across every restaurant.
     *
     * Scoped by `consumer_id` and nothing else, which is exactly the scope a
     * marketplace history has. The caller must have proved who the consumer is
     * — `RequireConsumerToken` — because inside this closure the policies are
     * open and a consumer id out of a URL would read somebody else's dinners.
     *
     * @return Collection<int, MarketOrder>
     */
    public function ordersOf(int $consumerId, int $limit = 30): Collection
    {
        return $this->database->withoutTenancy(
            static fn (): Collection => MarketOrder::query()
                ->with(['lines', 'store'])
                ->where('consumer_id', $consumerId)
                ->orderByDesc('created_at')
                ->limit($limit)
                ->get(),
        );
    }

    /**
     * The order a basket reference already produced, if it produced one.
     *
     * Cross-tenant like every other consumer-side read, and it has to be: the
     * reference belongs to the customer rather than to the restaurant, and with
     * the connection fail-closed the lookup answers nothing — after which the
     * insert hits the unique index and a replayed checkout is a 500 instead of
     * the first order coming back.
     */
    public function orderByReference(int $consumerId, string $reference): ?MarketOrder
    {
        return $this->database->withoutTenancy(
            static fn (): ?MarketOrder => MarketOrder::query()
                // Eager-loaded HERE, inside the open window. A relation loaded
                // after it closes reads through a fail-closed connection and
                // answers null — a response with no store and no lines, and
                // nothing raised to say so.
                ->with(['lines', 'store'])
                ->where('consumer_id', $consumerId)
                ->where('client_reference', $reference)
                ->first(),
        );
    }

    /** One order of one consumer, by the number printed on their screen. */
    public function orderOf(int $consumerId, string $number): ?MarketOrder
    {
        return $this->database->withoutTenancy(
            static fn (): ?MarketOrder => MarketOrder::query()
                ->with(['lines', 'store', 'courier'])
                ->where('consumer_id', $consumerId)
                ->where('number', $number)
                ->first(),
        );
    }

    /**
     * Run one piece of work as the restaurant behind this storefront.
     *
     * The tenant context is set as well as the database's, because they answer
     * two different halves: `BelongsToTenant` stamps new rows from the context,
     * and the policies filter reads from the GUC. Setting one without the other
     * gives a row that is written correctly and invisible, or visible and
     * unowned.
     *
     * The branch goes with it. A storefront belongs to one venue, and the
     * bill, the kitchen ticket and the day's takings all belong to that
     * address rather than to the head office.
     *
     * @template TReturn
     *
     * @param Closure(Tenant): TReturn $work
     *
     * @return TReturn
     */
    public function asStore(Store $store, Closure $work): mixed
    {
        /*
         * Both reads happen inside the open window, and the branch is the
         * reason. `public.branches` carries `tenant_id` and is behind the
         * policy, so reading `$store->branch` outside would answer null on a
         * fail-closed connection — and a null branch is not an error, it is a
         * roll-up. The order would be written against every venue at once.
         */
        [$tenant, $branch] = $this->database->withoutTenancy(static fn (): array => [
            Tenant::query()->find($store->tenant_id),
            $store->branch_id === null ? null : $store->branch()->first(),
        ]);

        if (! $tenant instanceof Tenant) {
            // A storefront whose restaurant is gone. Refused rather than run
            // under whatever tenancy the request happened to carry, which is
            // how an order lands in the wrong kitchen.
            throw new \RuntimeException("Do'kon #{$store->id} hech qaysi restoranga tegishli emas.");
        }

        $previousTenant = $this->tenants->tenant();
        $previousBranch = $this->branches->branch();

        $this->tenants->set($tenant);
        $this->branches->set($branch);
        $this->database->focus($tenant->id);

        try {
            return $work($tenant);
        } finally {
            // Put the request back exactly as it was. A merchant endpoint that
            // reaches in here must not come out scoped to somebody else.
            $this->tenants->set($previousTenant);
            $this->branches->set($previousBranch);

            if ($previousTenant instanceof Tenant) {
                $this->database->focus($previousTenant->id);
            } else {
                $this->database->close();
            }
        }
    }
}
