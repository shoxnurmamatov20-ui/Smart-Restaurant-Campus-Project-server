<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Media\Http\Controllers\MediaController;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::resource('media', MediaController::class)->names('media');
});
