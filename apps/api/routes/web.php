<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes — Smart Restaurant Campus API
|--------------------------------------------------------------------------
| This service is API-first; the interfaces live in apps/web (staff console),
| apps/admin (platform admin) and the Telegram WebApps. Web routes here are:
|   - /          status page
|   - /horizon   queue dashboard (auth required, gated in HorizonServiceProvider)
|   - /pulse     app performance (auth required)
*/

Route::get('/', function () {
    return response()->json([
        'service' => 'Smart Restaurant Campus API',
        'version' => config('app.version', '0.0.0'),
        'env' => config('app.env'),
        'time' => now()->toIso8601String(),
    ]);
});
