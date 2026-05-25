<?php

use Illuminate\Support\Facades\Route;
use Modules\Students\Http\Controllers\StudentsController;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::resource('students', StudentsController::class)->names('students');
});
