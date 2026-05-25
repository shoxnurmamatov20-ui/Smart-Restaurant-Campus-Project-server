<?php

use Illuminate\Support\Facades\Route;
use Modules\EDMS\Http\Controllers\EDMSController;

Route::middleware(['auth:sanctum'])->prefix('v1')->group(function () {
    Route::apiResource('edms', EDMSController::class)->names('edms');
});
