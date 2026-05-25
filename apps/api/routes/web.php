<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes — CAMPUS API
|--------------------------------------------------------------------------
| API server is mainly used via /api routes. Web routes here are:
|   - / (status page)
|   - /docs (API docs, dev only — when generator is set up)
|   - /horizon (queue dashboard, auth required)
*/

Route::get('/', function () {
    return response()->json([
        'service' => 'CAMPUS API',
        'version' => config('app.version', '0.0.0'),
        'env' => config('app.env'),
        'time' => now()->toIso8601String(),
    ]);
});
