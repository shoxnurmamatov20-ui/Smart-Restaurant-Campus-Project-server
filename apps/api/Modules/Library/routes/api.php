<?php

use Illuminate\Support\Facades\Route;
use Modules\Library\Http\Controllers\LibraryController;

Route::middleware(['auth:sanctum'])->prefix('v1')->group(function () {
    Route::apiResource('libraries', LibraryController::class)->names('library');
});
