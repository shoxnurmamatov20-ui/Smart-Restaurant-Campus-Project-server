<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Suppliers\Models\PurchaseOrder;
use Modules\Suppliers\Models\Supplier;

final class SuppliersController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'module' => 'Suppliers',
            'alias' => 'suppliers',
            'labels' => config('suppliers.labels'),
            'description' => 'Yetkazib beruvchilar bazasi, xarid arizalari, kirim hujjatlari va qarzdorlik.',
            'enabled' => (bool) config('suppliers.enabled', true),
            'endpoints' => [
                'suppliers' => url('/api/v1/suppliers/suppliers'),
                'purchase_orders' => url('/api/v1/suppliers/purchase-orders'),
            ],
            'counts' => [
                'suppliers' => Supplier::active()->count(),
                'open_orders' => PurchaseOrder::open()->count(),
                'total_debt_tiyin' => (int) Supplier::sum('debt'),
            ],
        ]);
    }
}
