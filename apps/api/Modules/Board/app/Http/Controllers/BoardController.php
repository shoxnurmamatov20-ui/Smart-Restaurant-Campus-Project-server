<?php

declare(strict_types=1);

namespace Modules\Board\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Board\Models\BoardBanner;
use Modules\Board\Models\BoardColumn;
use Modules\Board\Models\BoardScreen;

/**
 * Module discovery endpoint — GET /api/v1/board/.
 *
 * Returns what the module is, which endpoints it exposes and a few headline
 * counts, so any client can discover capabilities instead of hard-coding them.
 *
 * The counts are scoped by whatever branch the caller named, like every other
 * read in this module: with no `X-Branch` they are the whole chain's, which is
 * the honest answer to a question that named no venue.
 */
final class BoardController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'module' => 'Board',
            'alias' => 'board',
            'labels' => config('board.labels'),
            'description' => config('board.description'),
            'enabled' => (bool) config('board.enabled', true),
            'endpoints' => [
                'columns' => url('/api/v1/board/columns'),
                'playlist' => url('/api/v1/board/playlist'),
                'banners' => url('/api/v1/board/banners'),
                'preview' => url('/api/v1/board/preview'),
                'push' => url('/api/v1/board/push'),
            ],
            'counts' => [
                'columns' => BoardColumn::query()->count(),
                'columns_visible' => BoardColumn::query()->visible()->count(),
                'screens' => BoardScreen::query()->count(),
                'screens_active' => BoardScreen::query()->active()->count(),
                'banners' => BoardBanner::query()->count(),
                'banners_live' => BoardBanner::query()->live()->count(),
            ],
        ]);
    }
}
