<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Controllers;

use App\Http\Controllers\Controller;
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
 * identified by the tenant header/subdomain, and only sellable items of active
 * sections are ever returned, so a guest can never see a draft dish, an
 * archived one, or something the kitchen just put on the stop-list.
 *
 * It is also the busiest endpoint the platform has, so it is served from cache
 * and answers a repeat visit with 304 rather than the whole menu again — the
 * difference between a phone on a slow connection redrawing instantly and
 * waiting for a payload it already has.
 */
final class PublicMenuController extends Controller
{
    public function __invoke(Request $request, TenantContext $context, MenuCache $cache): JsonResponse
    {
        if (! $context->hasTenant()) {
            return response()->json([
                'message' => 'Restoran aniqlanmadi.',
                'code' => 'TENANT_REQUIRED',
            ], Response::HTTP_BAD_REQUEST);
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

        $payload = $cache->remember($variant, function () use ($context, $channel): array {
            $categories = MenuCategory::query()
                ->active()
                ->root()
                ->with([
                    'children' => fn ($query) => $query->where('is_active', true),
                    'items' => fn ($query) => $query->orderable()->forChannel($channel)->orderBy('sort_order'),
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
                'data' => json_decode(
                    (string) MenuCategoryResource::collection($categories)->toJson(),
                    associative: true,
                ),
            ];
        });

        return response()->json($payload)
            ->setEtag(trim($etag, '"'))
            ->header('Cache-Control', 'public, max-age='.$cache->ttl());
    }
}
