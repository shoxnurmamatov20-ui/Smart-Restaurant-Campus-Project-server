<?php

declare(strict_types=1);

namespace Modules\Inventory\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Modules\Inventory\Models\Ingredient;
use Modules\Inventory\Models\StockMovement;

/**
 * Module discovery endpoint — GET /api/v1/inventory/.
 */
final class InventoryController extends Controller
{
    public function index(BusinessDay $businessDay): JsonResponse
    {
        return response()->json([
            'module' => 'Inventory',
            'alias' => 'inventory',
            'labels' => config('inventory.labels'),
            'description' => 'Ingredientlar, texnologik kartalar, qoldiq nazorati, inventarizatsiya va chiqim.',
            'enabled' => (bool) config('inventory.enabled', true),
            'endpoints' => [
                'ingredients' => url('/api/v1/inventory/ingredients'),
                'movements' => url('/api/v1/inventory/movements'),
            ],
            'counts' => [
                'ingredients' => Ingredient::active()->count(),
                'low_stock' => Ingredient::active()->lowStock()->count(),
                // Summed in the database, not by loading every ingredient into
                // PHP to add up an accessor. A chain with a few thousand SKUs
                // was hydrating all of them to produce one integer.
                'stock_value_tiyin' => (int) Ingredient::active()
                    ->sum(DB::raw('greatest(stock_quantity, 0) * cost_per_unit')),
                'write_offs_today' => StockMovement::losses()
                    ->tap(fn ($query) => $businessDay->constrain($query, 'happened_at', $businessDay->window()))
                    ->count(),
            ],
        ]);
    }
}
