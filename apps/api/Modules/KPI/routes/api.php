<?php

use Illuminate\Support\Facades\Route;
use Modules\KPI\Http\Controllers\KPIController;

Route::middleware(['auth:sanctum'])->prefix('v1')->group(function () {
    Route::apiResource('kpis', KPIController::class)->names('kpi');
});
