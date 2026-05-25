<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\HR\Http\Controllers\HRController;

Route::middleware(['auth:sanctum'])->prefix('v1')->group(function () {
    Route::apiResource('hrs', HRController::class)->names('hr');
});
