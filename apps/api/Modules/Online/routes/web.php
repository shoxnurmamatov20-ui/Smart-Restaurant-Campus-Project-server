<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Online\Http\Controllers\OnlineController;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::resource('onlines', OnlineController::class)->names('online');
});
