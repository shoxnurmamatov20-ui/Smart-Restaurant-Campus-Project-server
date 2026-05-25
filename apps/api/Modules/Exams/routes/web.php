<?php

use Illuminate\Support\Facades\Route;
use Modules\Exams\Http\Controllers\ExamsController;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::resource('exams', ExamsController::class)->names('exams');
});
