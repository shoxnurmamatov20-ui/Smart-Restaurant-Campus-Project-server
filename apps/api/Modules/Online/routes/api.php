<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Online\Http\Controllers\OnlineController;

Route::middleware(['auth:sanctum'])->prefix('v1')->group(function () {
    Route::apiResource('onlines', OnlineController::class)->names('online');
});
