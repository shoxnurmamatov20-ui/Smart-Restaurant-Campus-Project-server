<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Kitchen\Models\KitchenStation;
use Modules\Kitchen\Models\KitchenTicket;

/**
 * Module discovery endpoint — GET /api/v1/kitchen/.
 */
final class KitchenController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'module' => 'Kitchen',
            'alias' => 'kitchen',
            'labels' => config('kitchen.labels'),
            'description' => "Oshxona displey tizimi: chiptalar, sexlar bo'yicha marshrutlash, tayyorlash vaqti nazorati.",
            'enabled' => (bool) config('kitchen.enabled', true),
            'endpoints' => [
                'stations' => url('/api/v1/kitchen/stations'),
                'tickets' => url('/api/v1/kitchen/tickets'),
                'dispatch' => url('/api/v1/kitchen/dispatch'),
            ],
            'counts' => [
                // Counted in the database. The kitchen display polls this
                // several times a minute per station; loading every open ticket
                // into PHP to filter on an accessor does not survive a chain.
                'stations' => KitchenStation::where('is_active', true)->count(),
                'tickets_active' => KitchenTicket::active()->count(),
                'tickets_late' => KitchenTicket::late()->count(),
            ],
        ]);
    }
}
