<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes — CAMPUS
|--------------------------------------------------------------------------
| All API routes are versioned under /api/v1/...
| Module routes (HR, Students, etc.) are auto-loaded from Modules/{Name}/Routes/api.php
| via nwidart/laravel-modules.
*/

Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
    return $request->user();
});

// Health check (Laravel built-in /up is also available)
Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'service' => 'campus-api',
        'version' => config('app.version', '0.0.0'),
        'time' => now()->toIso8601String(),
    ]);
});

// Version namespace — all module routes nest under here
Route::prefix('v1')->name('api.v1.')->group(function () {

    // Public routes (no auth)
    Route::prefix('public')->group(function () {
        // Module routes can register public endpoints here
    });

    // Authenticated routes (Sanctum)
    Route::middleware(['auth:sanctum'])->group(function () {

        // ---- Super Admin endpoints ----
        Route::prefix('admin')
            ->middleware(['role:super-admin'])    // Spatie permission gate
            ->name('admin.')
            ->group(function () {
                // Admin module routes will mount here
            });

        // ---- Per-user endpoints ----
        // Module routes (HR, Students, etc.) auto-mount via nwidart/laravel-modules
    });
});
