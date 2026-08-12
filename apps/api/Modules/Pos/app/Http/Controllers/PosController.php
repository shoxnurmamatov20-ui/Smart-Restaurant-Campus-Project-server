<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * Module discovery endpoint — GET /api/v1/pos/.
 *
 * A till pairs before it has a menu, a layout or a shift, so the first thing it
 * asks is what this module can do and which modes it supports. Discovering that
 * beats hard-coding it into four different clients.
 */
final class PosController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'module' => 'Pos',
            'alias' => 'pos',
            'labels' => config('pos.labels'),
            'description' => config('pos.description'),
            'enabled' => (bool) config('pos.enabled', true),
            'modes' => config('pos.modes'),
            'endpoints' => [
                'terminals' => url('/api/v1/pos/terminals'),
                'pair' => url('/api/v1/pos/terminals/pair'),
                'pin_login' => url('/api/v1/pos/auth/pin'),
            ],
            'policy' => [
                'pin_length' => (int) config('pos.pin.length'),
                'pin_max_attempts' => (int) config('pos.pin.max_attempts'),
                'pin_lock_minutes' => (int) config('pos.pin.lock_minutes'),
                'pairing_ttl_minutes' => (int) config('pos.pairing.ttl_minutes'),
                'approval_ttl_minutes' => (int) config('pos.approvals.ttl_minutes'),
            ],
        ]);
    }
}
