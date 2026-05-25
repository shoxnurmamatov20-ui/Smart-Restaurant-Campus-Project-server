<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Validates `Authorization: Bearer <LARAVEL_INTERNAL_TOKEN>` header.
 * Used for routes called by the Python apps/telegram-bots service.
 */
final class InternalBotsAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = config('telegrambots.internal_token');
        if (! $expected) {
            abort(500, 'LARAVEL_INTERNAL_TOKEN is not configured');
        }

        $header = (string) $request->header('Authorization', '');
        $token = str_starts_with($header, 'Bearer ') ? substr($header, 7) : '';

        if (! hash_equals($expected, $token)) {
            abort(401, 'Invalid internal token');
        }

        return $next($request);
    }
}
