<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| TelegramBots module web routes
|--------------------------------------------------------------------------
| Deliberately empty.
|
| `module:make` generates a session-authenticated `resource('telegrambots')`
| here pointing at the same scaffold controller as routes/api.php did. This
| platform has no server-rendered admin: the console is apps/admin, a Next.js
| app talking to the API over Sanctum tokens. A `web` route behind `auth` and
| `verified` middleware would be guarded by a session guard nothing issues.
|
| See routes/api.php for the rest of the reasoning.
*/
