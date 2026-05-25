<?php

use Illuminate\Support\Facades\Route;
use Modules\Exams\Http\Controllers\ExamsController;

Route::middleware(['auth:sanctum'])->prefix('v1')->group(function () {
    Route::apiResource('exams', ExamsController::class)->names('exams');
});
