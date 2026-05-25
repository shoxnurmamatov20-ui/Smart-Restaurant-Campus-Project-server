<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Psychology\Http\Controllers\PsychologyController;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::resource('psychologies', PsychologyController::class)->names('psychology');
});
