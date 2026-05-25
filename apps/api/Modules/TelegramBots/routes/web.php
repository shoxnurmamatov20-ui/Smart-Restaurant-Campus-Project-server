<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\TelegramBots\Http\Controllers\TelegramBotsController;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::resource('telegrambots', TelegramBotsController::class)->names('telegrambots');
});
