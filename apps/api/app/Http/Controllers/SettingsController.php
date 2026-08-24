<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\UpdateSettingsRequest;
use App\Http\Requests\UpdateSiteSettingsRequest;
use App\Models\Tenant;
use App\Support\Errors\ApiException;
use App\Support\Exports\TenantArchive;
use App\Support\Settings\SettingsSchema;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * One restaurant's own settings — the document behind eight console panels.
 *
 * Core rather than a module, for the same reason `Branch` is: several modules
 * read `settings` and none of them owns it. The receipt renderer wants
 * `legal.*`, the till wants `cash_rounding_tiyin`, the bill totals want
 * `vat_percent` and `service_charge_percent`, and the public website wants the
 * whole `site` group. A module that owned this would be a module every other
 * module imports.
 *
 * Reading and writing are deliberately different permissions. A branch manager
 * has to read the VAT rate to explain a receipt to a guest; changing the VAT
 * rate is the owner's, because it is a number that reprices every bill in the
 * building and nobody notices until the accountant does.
 *
 * What may be written is declared in config/settings.php and enforced in both
 * directions — see App\Support\Settings\SettingsSchema for why a jsonb column
 * without a declared shape is a column that silently absorbs typos.
 */
final class SettingsController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly TenantArchive $archive,
    ) {}

    /**
     * Everything the console's settings screens draw, plus the schema itself.
     *
     * The schema rides along because the console is the thing that has to stop
     * somebody typing an eight-digit STIR *before* the round trip. Shipping the
     * rules rather than re-declaring them in TypeScript is what keeps the two
     * from drifting — the same argument openapi.json makes for the routes.
     */
    public function show(): JsonResponse
    {
        $tenant = $this->tenant();

        return response()->json([
            'data' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'country_code' => $tenant->country_code,
                'locale' => $tenant->locale,
                'timezone' => $tenant->timezone,
                'status' => $tenant->status,
                'settings' => $this->restaurantGroup($tenant->settings),
            ],
            'meta' => [
                'schema' => SettingsSchema::rules('restaurant'),
            ],
        ]);
    }

    public function update(UpdateSettingsRequest $request): JsonResponse
    {
        $tenant = $this->tenant();

        $tenant->forceFill([
            'settings' => SettingsSchema::merge($tenant->settings, $request->validated()),
        ])->save();

        return $this->show();
    }

    /**
     * The public website's settings, as the console edits them.
     *
     * Same document, own group, own screen. Split at the route rather than
     * folded into the patch above because the two are saved from different
     * pages by different people — a marketer writes the site copy, and the
     * owner writes the bank details.
     */
    public function site(): JsonResponse
    {
        $tenant = $this->tenant();
        $draft = $this->group($tenant->settings, 'site');

        return response()->json([
            'data' => $this->withoutSnapshot($draft),
            'meta' => [
                'restaurant' => ['name' => $tenant->name, 'slug' => $tenant->slug],
                'schema' => SettingsSchema::rules('site'),
                'published' => $this->publication($draft),
            ],
        ]);
    }

    /**
     * Put the draft on the internet.
     *
     * The website's settings are edited continuously — somebody rewrites the
     * blurb over a lunch break, switches a section off to see what it looks
     * like, gets called away — and until now every keystroke was live the moment
     * it saved. `(dashboard)/web` draws a **Nashr qilish** button precisely
     * because that is not how anybody works.
     *
     * So the group is the draft and `site.published` is the snapshot a stranger
     * sees. `PublicSiteController` reads only the snapshot; a restaurant that
     * has never pressed this button has no public site, which is honest — the
     * alternative is publishing a half-written page nobody chose to show.
     *
     * A copy rather than a version table. What a version history would buy is
     * "put last Tuesday's back", and what it costs is a table, a diff view and a
     * retention policy for a document of about thirty keys. `version` counts up
     * so the console can say which one is live and so a stale tab pressing
     * publish is visible in the audit log rather than invisible.
     */
    public function publish(): JsonResponse
    {
        $tenant = $this->tenant();
        $root = SettingsSchema::root('site') ?? 'site';
        $draft = $this->withoutSnapshot($this->group($tenant->settings, 'site'));
        $previous = $this->publication($this->group($tenant->settings, 'site'));

        $tenant->forceFill([
            'settings' => SettingsSchema::merge($tenant->settings, [
                $root => [
                    'published' => $draft,
                    'published_at' => now()->toIso8601String(),
                    'version' => $previous['version'] + 1,
                ],
            ]),
        ])->save();

        return $this->site();
    }

    /**
     * The draft with the snapshot taken back out.
     *
     * The published copy lives inside the same group, which keeps it in one
     * column and out of a second table — but it must never come back on the
     * editing endpoint. A console doing GET-then-PUT with what it was given
     * would send `published` back, `UpdateSiteSettingsRequest` would refuse it
     * as an undeclared path, and the page would be unsaveable.
     *
     * @param array<array-key, mixed> $site
     *
     * @return array<array-key, mixed>
     */
    private function withoutSnapshot(array $site): array
    {
        unset($site['published'], $site['published_at'], $site['version']);

        return $site;
    }

    /**
     * What is live right now, without the whole snapshot.
     *
     * @param array<array-key, mixed> $site
     *
     * @return array{at: string|null, version: int, live: bool}
     */
    private function publication(array $site): array
    {
        $at = $site['published_at'] ?? null;

        return [
            'at' => is_string($at) ? $at : null,
            'version' => (int) ($site['version'] ?? 0),
            'live' => is_array($site['published'] ?? null),
        ];
    }

    public function updateSite(UpdateSiteSettingsRequest $request): JsonResponse
    {
        $tenant = $this->tenant();
        $root = SettingsSchema::root('site') ?? 'site';

        $tenant->forceFill([
            'settings' => SettingsSchema::merge($tenant->settings, [
                $root => SettingsSchema::merge(
                    $this->group($tenant->settings, 'site'),
                    $request->validated(),
                ),
            ]),
        ])->save();

        return $this->site();
    }

    /**
     * The owner's own copy of everything the platform holds about them.
     *
     * The same job the platform console queues, aimed at the caller's own
     * restaurant — which is the whole difference between the two doors, and
     * why neither of them names a tenant in a body somebody could edit. Here
     * it comes from `ResolveTenant`; there it comes from a route the platform
     * operator alone can reach.
     *
     * `system.settings` rather than `settings.view`: this is not reading a
     * number off a screen, it is minting a file that holds every guest, every
     * bill and every wage in the business. By the RBAC seeder only the owner
     * and the platform operator hold it — a branch manager who may read the
     * VAT rate may not take the company home on a memory stick.
     *
     * 202 and nothing else: the work is a queued walk of every table, and the
     * console polls `exports` for the link.
     */
    public function export(Request $request): JsonResponse
    {
        $export = $this->archive->queue($this->tenant(), $request->user());

        return response()->json(
            ['data' => $this->archive->row($export)],
            Response::HTTP_ACCEPTED,
        );
    }

    /** This restaurant's own export history — the same shape the platform sees. */
    public function exports(): JsonResponse
    {
        return response()->json(['data' => $this->archive->listFor($this->tenant())]);
    }

    /**
     * Which restaurant this request is about.
     *
     * `ResolveTenant` has already settled it and refused a caller asking for
     * somebody else's, so there is nothing to re-check here — but a request
     * that reached this controller with no tenant at all is a routing mistake,
     * not a 500 waiting to happen.
     */
    private function tenant(): Tenant
    {
        $tenant = $this->context->tenant();

        if ($tenant === null) {
            throw ApiException::of('tenant.required');
        }

        return $tenant;
    }

    /**
     * One group's slice of the stored document.
     *
     * @param array<array-key, mixed>|null $settings
     *
     * @return array<array-key, mixed>
     */
    private function group(?array $settings, string $group): array
    {
        $root = SettingsSchema::root($group);

        if ($root === null) {
            return $settings ?? [];
        }

        $slice = data_get($settings, $root, []);

        return is_array($slice) ? $slice : [];
    }

    /**
     * The restaurant group, with the other groups' roots taken back out.
     *
     * `restaurant` is the document root, so a naive read of it hands back the
     * `site` object as well — and a console that did GET-then-PATCH with what
     * it was given would be refused, because `site.*` is not a restaurant path.
     * Returning only what this endpoint accepts back is what makes the round
     * trip work.
     *
     * @param array<array-key, mixed>|null $settings
     *
     * @return array<array-key, mixed>
     */
    private function restaurantGroup(?array $settings): array
    {
        $document = $this->group($settings, 'restaurant');

        /** @var array<string, string|null> $roots */
        $roots = config('settings.root', []);

        foreach ($roots as $group => $root) {
            if ($group !== 'restaurant' && is_string($root)) {
                unset($document[$root]);
            }
        }

        return $document;
    }
}
