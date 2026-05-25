<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\TelegramBots\Http\Controllers\TelegramBotsController;

Route::middleware(['auth:sanctum'])->prefix('v1')->group(function () {
    Route::apiResource('telegrambots', TelegramBotsController::class)->names('telegrambots');
});
