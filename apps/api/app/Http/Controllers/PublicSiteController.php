<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\SiteVisit;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * What a restaurant's own website says about it, to somebody with no account.
 *
 * `(site)/r/{slug}` is the one indexable surface on the platform — `robots.ts`
 * closes every other one, because they are somebody's session or one table's
 * page. This is the shop window, and until now it was drawing `venue-data.ts`:
 * five branches, one telephone number and a rating, all invented, identical for
 * every restaurant on the product.
 *
 * Public, tenant-scoped, and deliberately narrow. What comes back is what is
 * already printed on the door: the venue's name, its addresses, its hours and
 * its telephone. No figures, no counts, no ids that unlock anything — a page
 * whose whole purpose is to be read by strangers and indexed by Google.
 */
final class PublicSiteController extends Controller
{
    public function __construct(private readonly TenantContext $context) {}

    public function __invoke(Request $request): JsonResponse
    {
        $tenant = $this->context->tenant();

        if ($tenant === null) {
            throw ApiException::of('tenant.required');
        }

        /*
         * Somebody looked at the shop window. Count it.
         *
         * Here rather than on a beacon the browser fires, for two reasons. This
         * endpoint IS the render — `(site)/r/{slug}` is a server component and
         * this is the request it makes — so the count is of pages that were
         * actually served rather than of browsers that ran a script; and a
         * beacon would need `Idempotency-Key`, which is global on writes here,
         * turning a counter into a protocol.
         *
         * `?path=` when the caller knows which page it is rendering; `/` is the
         * front page and the honest default. Nothing personal is recorded and
         * nothing here can fail the render — see `SiteVisit::record()`.
         */
        SiteVisit::record($tenant->id, (string) $request->query('path', '/'));

        $site = $tenant->setting('site', []);
        $site = is_array($site) ? $site : [];

        /*
         * The published snapshot, never the draft.
         *
         * `site.*` is what the console is editing right now — a half-rewritten
         * blurb, a section switched off to see what it looks like, a subdomain
         * somebody is still deciding on. `site.published` is what a person
         * pressed **Nashr qilish** on. Reading the draft here is what made the
         * button meaningless, and it is the difference between a website and a
         * text field somebody is typing into in public.
         *
         * A restaurant that has never published answers with an empty document
         * rather than its draft. The page then draws the venue's name, its
         * addresses and its hours — everything that is already printed on the
         * door — and none of the copy nobody chose to show.
         */
        $published = $site['published'] ?? null;
        $published = is_array($published) ? $published : [];

        return response()->json([
            'data' => [
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'locale' => $tenant->locale,
                'timezone' => $tenant->timezone,
                'site' => $published,
                'published_at' => is_string($site['published_at'] ?? null) ? $site['published_at'] : null,
                /*
                 * The brand block, not the legal one.
                 *
                 * `legal.*` is on this document too — the STIR, the bank, the
                 * settlement account — and none of it belongs on an endpoint
                 * with no login. It goes on a receipt and an invoice, both of
                 * which the person already holds.
                 */
                'brand' => $this->brand($tenant->setting('brand', [])),
                'branches' => $this->branches(),
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function brand(mixed $brand): array
    {
        if (! is_array($brand)) {
            return [];
        }

        return array_intersect_key($brand, array_flip(['name', 'logo_url', 'color', 'accent', 'tagline']));
    }

    /**
     * The venues, as they appear on the door.
     *
     * Active only: an archived branch is one a guest cannot walk into, and
     * publishing its address is how somebody drives across a city to a closed
     * shutter.
     *
     * @return list<array<string, mixed>>
     */
    private function branches(): array
    {
        return Branch::query()
            ->where('status', 'active')
            ->orderBy('name')
            ->get()
            ->map(static function (Branch $branch): array {
                $hours = $branch->setting('hours', []);

                return [
                    'id' => $branch->slug,
                    'name' => $branch->name,
                    'city' => $branch->city,
                    'address' => $branch->address,
                    'phone' => $branch->phone,
                    'timezone' => $branch->timezone,
                    'hours' => is_array($hours) ? $hours : [],
                    // A branch that does not take bookings says so, rather than
                    // drawing a form that lands in a queue nobody reads.
                    'bookable' => (bool) $branch->setting('bookable', true),
                ];
            })
            ->all();
    }
}
