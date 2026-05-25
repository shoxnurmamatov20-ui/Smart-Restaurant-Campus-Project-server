<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\HR\Http\Controllers\HRController;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::resource('hrs', HRController::class)->names('hr');
});
