<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Orders\Models\Order;

/**
 * Module discovery endpoint — GET /api/v1/orders/.
 */
final class OrdersController extends Controller
{
    public function index(): JsonResponse
    {
        $today = Order::today();

        return response()->json([
            'module' => 'Orders',
            'alias' => 'orders',
            'labels' => config('orders.labels'),
            'description' => "Barcha kanallar bo'yicha buyurtmalar: zal, olib ketish, yetkazib berish, agregator.",
            'enabled' => (bool) config('orders.enabled', true),
            'endpoints' => [
                'orders' => url('/api/v1/orders/orders'),
                'items' => url('/api/v1/orders/items'),
            ],
            'counts' => [
                'open' => Order::open()->count(),
                'today' => $today->count(),
                'today_revenue_tiyin' => (int) Order::today()->where('status', 'paid')->sum('total'),
            ],
        ]);
    }
}
