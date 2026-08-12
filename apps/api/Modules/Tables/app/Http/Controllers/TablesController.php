<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Tables\Models\Hall;
use Modules\Tables\Models\Reservation;
use Modules\Tables\Models\RestaurantTable;

/**
 * Module discovery endpoint — GET /api/v1/tables/.
 */
final class TablesController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'module' => 'Tables',
            'alias' => 'tables',
            'labels' => config('tables.labels'),
            'description' => 'Zallar, stollar, joy bandligi, oldindan bron qilish va QR-menyu.',
            'enabled' => (bool) config('tables.enabled', true),
            'endpoints' => [
                'halls' => url('/api/v1/tables/halls'),
                'tables' => url('/api/v1/tables/tables'),
                'reservations' => url('/api/v1/tables/reservations'),
            ],
            'counts' => [
                'halls' => Hall::count(),
                'tables_total' => RestaurantTable::count(),
                'tables_free' => RestaurantTable::free()->count(),
                'tables_occupied' => RestaurantTable::where('status', 'occupied')->count(),
                'reservations_upcoming' => Reservation::upcoming()->count(),
            ],
        ]);
    }
}
