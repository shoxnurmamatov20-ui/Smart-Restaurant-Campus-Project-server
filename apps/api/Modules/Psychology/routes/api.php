<?php

use Illuminate\Support\Facades\Route;
use Modules\Psychology\Http\Controllers\PsychologyController;

Route::middleware(['auth:sanctum'])->prefix('v1')->group(function () {
    Route::apiResource('psychologies', PsychologyController::class)->names('psychology');
});
