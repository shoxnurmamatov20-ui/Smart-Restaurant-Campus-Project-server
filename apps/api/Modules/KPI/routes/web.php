<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\KPI\Http\Controllers\KPIController;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::resource('kpis', KPIController::class)->names('kpi');
});
