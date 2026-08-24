<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Marketplace\Models\Dispute;
use Modules\Marketplace\Models\MarketOrder;
use Modules\Marketplace\Models\Settlement;
use Modules\Marketplace\Models\Store;
use Modules\Marketplace\Support\MarketOrderState;

/**
 * Module discovery — GET /api/v1/marketplace/.
 *
 * Every module answers this so a client can find its way around without
 * hard-coding routes. The counts are this restaurant's own — the policies see
 * to that without a `where` — so a merchant panel can draw its badges from one
 * request rather than four.
 *
 * The consumer endpoints are listed here too even though no consumer will ever
 * be able to call this one: the manifest is what a client builds navigation
 * from, and a marketplace module that described only half of itself would leave
 * the other half undiscoverable.
 */
final class MarketplaceController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'module' => 'Marketplace',
            'alias' => 'marketplace',
            'labels' => config('marketplace.labels'),
            'description' => config('marketplace.description'),
            'enabled' => (bool) config('marketplace.enabled', true),
            'endpoints' => [
                'merchant' => [
                    'orders' => '/api/v1/marketplace/orders',
                    'catalogue' => '/api/v1/marketplace/catalogue',
                    'settlements' => '/api/v1/marketplace/settlements',
                    'disputes' => '/api/v1/marketplace/disputes',
                    'performance' => '/api/v1/marketplace/performance',
                    'promotions' => '/api/v1/marketplace/promotions',
                    'settings' => '/api/v1/marketplace/settings',
                ],
                'consumer' => [
                    'stores' => '/api/v1/mp/stores',
                    'sign_in' => '/api/v1/mp/auth/otp',
                    'orders' => '/api/v1/mp/orders',
                    'profile' => '/api/v1/mp/me',
                    'plus' => '/api/v1/mp/plus',
                ],
            ],
            'counts' => [
                'storefronts' => Store::query()->count(),
                // The number the panel badges: orders still inside their ninety
                // seconds. `waiting()` is the same scope the queue itself uses,
                // so the badge and the list cannot disagree.
                'waiting' => MarketOrder::query()->waiting()->count(),
                'open_disputes' => Dispute::query()->where('state', 'open')->count(),
                'settlements_due' => Settlement::query()->where('state', 'due')->count(),
                'delivered' => MarketOrder::query()->where('state', MarketOrderState::Delivered->value)->count(),
            ],
        ]);
    }
}
