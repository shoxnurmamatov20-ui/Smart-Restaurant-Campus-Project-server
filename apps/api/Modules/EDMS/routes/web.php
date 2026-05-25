<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\EDMS\Http\Controllers\EDMSController;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::resource('edms', EDMSController::class)->names('edms');
});
