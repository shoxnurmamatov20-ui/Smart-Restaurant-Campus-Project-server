<?php

use Illuminate\Support\Facades\Route;
use Modules\RTTM\Http\Controllers\RTTMController;

Route::middleware(['auth:sanctum'])->prefix('v1')->group(function () {
    Route::apiResource('rttms', RTTMController::class)->names('rttm');
});
