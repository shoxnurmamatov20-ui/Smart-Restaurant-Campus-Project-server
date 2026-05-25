<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Broadcast Channels — CAMPUS
|--------------------------------------------------------------------------
| Channels for WebSocket broadcasting via Laravel Reverb.
| Used by real-time features (chat, notifications, live attendance, etc.)
*/

// Private user channel — each user has their own
Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

// Module-specific channels will be registered by individual modules
// Example (in Modules/HR/Routes/channels.php):
//   Broadcast::channel('hr.attendance', fn ($user) => $user->hasRole(['hr', 'super-admin']));
