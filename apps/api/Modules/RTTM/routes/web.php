<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\RTTM\Http\Controllers\RTTMController;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::resource('rttms', RTTMController::class)->names('rttm');
});
