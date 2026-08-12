<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;

/**
 * Module discovery endpoint — GET /api/v1/menu/.
 *
 * Returns what the module is, which endpoints it exposes and a few headline
 * counts, so any client (staff console, POS, Telegram WebApp, mobile) can
 * discover capabilities instead of hard-coding them.
 */
final class MenuController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'module' => 'Menu',
            'alias' => 'menu',
            'labels' => config('menu.labels'),
            'description' => 'Restoran menyusi: kategoriyalar, taomlar, narxlar, modifikatorlar, stop-list.',
            'enabled' => (bool) config('menu.enabled', true),
            'endpoints' => [
                'categories' => url('/api/v1/menu/categories'),
                'items' => url('/api/v1/menu/items'),
                'public_menu' => url('/api/v1/public/menu'),
            ],
            'counts' => [
                'categories_total' => MenuCategory::count(),
                'categories_active' => MenuCategory::active()->count(),
                'items_total' => MenuItem::count(),
                'items_active' => MenuItem::active()->count(),
                'items_orderable' => MenuItem::orderable()->count(),
                'items_stopped' => MenuItem::active()->where('is_available', false)->count(),
            ],
        ]);
    }
}
