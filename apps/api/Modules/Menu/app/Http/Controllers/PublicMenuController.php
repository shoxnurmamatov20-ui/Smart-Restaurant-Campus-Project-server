<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Controllers;

use App\Contracts\Menu\StopList;
use App\Http\Controllers\Controller;
use App\Support\Errors\ErrorResponse;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Menu\Http\Resources\MenuCategoryResource;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Services\MenuCache;
use Symfony\Component\HttpFoundation\Response;

/**
 * Guest-facing menu — GET /api/v1/public/menu.
 *
 * This is what the QR code on the table opens. No login: the restaurant is
 * identified by the tenant header/subdomain, and only items of active sections
 * that the business actually sells are ever returned — a draft dish or an
 * archived one is not a thing a guest has any business reading about.
 *
 * A dish this kitchen has 86'd is a different case and is answered differently:
 * it comes down in its place, flagged `is_available: false` and `is_stopped:
 * true`, because "we are out of somsa tonight" is an answer and a dish that
 * silently disappeared is not. See `flagStopped()`.
 *
 * It is also the busiest endpoint the platform has, so it is served from cache
 * and answers a repeat visit with 304 rather than the whole menu again — the
 * difference between a phone on a slow connection redrawing instantly and
 * waiting for a payload it already has.
 */
final class PublicMenuController extends Controller
{
    public function __invoke(
        Request $request,
        TenantContext $context,
        MenuCache $cache,
        StopList $stops,
    ): JsonResponse {
        if (! $context->hasTenant()) {
            return ErrorResponse::code('tenant.required');
        }

        $channel = (string) $request->query('channel', 'dine_in');

        // The locale is part of the variant because dish names are resolved for
        // it: a Russian guest and an Uzbek guest at the same table get different
        // payloads from the same query.
        $variant = $channel.':'.app()->getLocale();
        $etag = $cache->etag($variant);

        // The client already has this exact menu. Nothing to send.
        if (trim((string) $request->header('If-None-Match')) === $etag) {
            return response()->json(null, Response::HTTP_NOT_MODIFIED)
                ->setEtag(trim($etag, '"'))
                ->header('Cache-Control', 'public, max-age='.$cache->ttl());
        }

        /*
         * What this kitchen has run out of, and the reason it is read out here
         * rather than inside the closure: the closure only runs on a cache miss,
         * and the stop-list is part of what the key already accounts for.
         *
         * Guests were the one audience this had been missed for. The POS greys a
         * stopped dish and the Telegram WebApp drops it, both through
         * `MenuCatalog::sellable()`; this endpoint builds its own query because it
         * needs the nested children a phone draws, and so it kept listing dishes
         * the kitchen had already pulled. A guest ordering one is the exact
         * situation the feature exists to prevent, from the audience least able
         * to be told.
         */
        $stopped = $stops->stoppedItemIds();

        $payload = $cache->remember($variant, function () use ($context, $channel, $stopped): array {
            /*
             * Everything this restaurant sells on this channel — including what
             * this kitchen has run out of tonight.
             *
             * It used to end `->whereNotIn('id', $stopped)`, and that was the bug
             * this endpoint is now free of. A dish the kitchen 86'd did not go
             * grey on a guest's phone; it *vanished*, and a guest who came for
             * the somsa was left asking a waiter why a dish they had read about
             * was no longer on the menu. The dish comes down flagged instead —
             * `is_available: false`, in its own section, in its own place — which
             * is what every guest screen was already built to draw.
             *
             * `orderable()` still removes the other kind of unavailable: a draft,
             * an archived dish, or one the *business* withdrew
             * (`menu_items.is_available`). Those are not "we are out tonight",
             * they are "we do not sell this", and there is nothing to tell a
             * guest about a dish the restaurant no longer has.
             *
             * The modifier sheet rides along. A phone opening a dish needs to
             * know whether it has sizes before it can draw an add button, and a
             * second request per dish over a café's Wi-Fi is the difference
             * between a sheet that opens and one that spins.
             */
            $sellable = fn ($query) => $query->orderable()->forChannel($channel)
                ->with(['modifierGroups' => fn ($groups) => $groups->active()
                    ->with(['options' => fn ($options) => $options->active()])])
                ->orderBy('sort_order');

            $categories = MenuCategory::query()
                ->active()
                ->root()
                ->with([
                    'children' => fn ($query) => $query->where('is_active', true),
                    /*
                     * A sub-category's dishes, eager-loaded with the SAME filter.
                     *
                     * They were not loaded here at all, and that was two bugs
                     * wearing one coat. The `reject` below reads `$child->items`
                     * to decide whether a heading is empty, which lazy-loaded them
                     * one query per sub-category — and lazy-loaded them
                     * *unfiltered*, so `whenLoaded('items')` in the resource then
                     * serialised every draft, archived and 86'd dish under every
                     * sub-heading. The top level was filtered and the level below
                     * it was not, on the one menu guests read.
                     */
                    'children.items' => $sellable,
                    'items' => $sellable,
                ])
                ->orderBy('sort_order')
                ->get()
                // A heading with nothing under it is noise on a phone screen —
                // and the same rule the Telegram WebApp already applies through
                // App\Contracts\Menu\MenuCatalog. The two guest-facing menus
                // must agree about what is on sale.
                ->reject(fn (MenuCategory $category): bool => $category->items->isEmpty()
                    && $category->children->every(fn (MenuCategory $child): bool => $child->items->isEmpty()))
                ->values();

            return [
                'restaurant' => [
                    'name' => $context->tenant()?->name,
                    'slug' => $context->tenant()?->slug,
                    'locale' => $context->tenant()?->locale,
                    'timezone' => $context->tenant()?->timezone,
                ],
                'channel' => $channel,
                'currency' => 'UZS',
                /*
                 * Encoded and decoded, not merely resolved.
                 *
                 * `resolve()` flattens only the top level: each category comes
                 * back as an array whose `items` and `children` are still
                 * Resource objects. That survives a response — json_encode
                 * walks JsonSerializable — and does not survive a cache. Once
                 * the payload had been through Redis, every section's dishes
                 * came back as `__PHP_Incomplete_Class`, so the QR menu worked
                 * for the first request of each 60-second window and was
                 * garbage for the rest.
                 *
                 * The round-trip forces the whole tree to plain arrays before
                 * it is stored, which is what "caching the finished payload"
                 * was supposed to mean.
                 */
                'data' => self::flagStopped(
                    json_decode(
                        (string) MenuCategoryResource::collection($categories)->toJson(),
                        associative: true,
                    ),
                    $stopped,
                ),
            ];
        });

        return response()->json($payload)
            ->setEtag(trim($etag, '"'))
            ->header('Cache-Control', 'public, max-age='.$cache->ttl());
    }

    /**
     * Mark what this kitchen has run out of, without removing it.
     *
     * Applied to the serialised tree rather than to the models, and that is the
     * point: `menu_items.is_available` is a fact about the *business* — a dish
     * withdrawn from the card — and the stop-list is a fact about *tonight, in
     * this room*. Writing the second onto the first, even in memory, would make
     * a read of the column mean two different things depending on who had
     * touched the object first.
     *
     * On the guest payload the two collapse into one honest sentence, because
     * the only question a guest is asking is "can I order this here, now". A
     * dish the business does not sell was already filtered out upstream; what
     * is left carrying `is_available: false` is exactly what the kitchen pulled.
     *
     * `is_stopped` is carried as well, so a client that wants the distinction
     * has it without inferring it — and so the guest surfaces read the same key
     * the till board reads.
     *
     * @param  array<int, array<string, mixed>>|mixed  $categories
     * @param  array<int, int>  $stopped
     * @return array<int, array<string, mixed>>
     */
    private static function flagStopped(mixed $categories, array $stopped): array
    {
        if (! is_array($categories)) {
            return [];
        }

        foreach ($categories as $index => $category) {
            if (! is_array($category)) {
                continue;
            }

            if (isset($category['items']) && is_array($category['items'])) {
                $category['items'] = self::flagItems($category['items'], $stopped);
            }

            if (isset($category['children']) && is_array($category['children'])) {
                $category['children'] = self::flagStopped($category['children'], $stopped);
            }

            $categories[$index] = $category;
        }

        return array_values($categories);
    }

    /**
     * @param  array<int, mixed>  $items
     * @param  array<int, int>  $stopped
     * @return array<int, mixed>
     */
    private static function flagItems(array $items, array $stopped): array
    {
        foreach ($items as $index => $item) {
            if (! is_array($item)) {
                continue;
            }

            $isStopped = in_array((int) ($item['id'] ?? 0), $stopped, true);

            $item['is_stopped'] = $isStopped;

            if ($isStopped) {
                // Both, because they answer the same question to two readers and
                // a screen that trusted one while the other still said "yes"
                // would put an add button on a dish the kitchen cannot cook.
                $item['is_available'] = false;
                $item['is_orderable'] = false;
            }

            $items[$index] = $item;
        }

        return array_values($items);
    }
}
