<?php

use Illuminate\Support\Facades\Route;
use Modules\Students\Http\Controllers\StudentsController;

Route::middleware(['auth:sanctum'])->prefix('v1')->group(function () {
    Route::apiResource('students', StudentsController::class)->names('students');
});
