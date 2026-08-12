<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Modules\Pos\Models\TerminalSession;
use Symfony\Component\HttpFoundation\Response;

/**
 * "Which till is this, and who is standing at it?"
 *
 * Every write in the module needs both halves, and neither can be taken from
 * the request body: a client that could name its own terminal or its own
 * session id could attribute a void to somebody else. Both are derived from the
 * bearer token that PIN login minted, which is why that token is per-session
 * and dies when the session does.
 *
 * The idle check lives here rather than in a scheduled job because a till left
 * unattended is only dangerous at the moment somebody picks it up — and that
 * moment is a request.
 */
final class RequireTerminalSession
{
    public const ATTRIBUTE_SESSION = 'pos.session';

    public const ATTRIBUTE_TERMINAL = 'pos.terminal';

    /**
     * @param Closure(Request): Response $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user instanceof User) {
            // A device token on its own is not a person. Type a PIN.
            return $this->refuse('Kassa sessiyasi talab qilinadi.', 'POS_SESSION_REQUIRED');
        }

        $token = $user->currentAccessToken();
        $tokenId = $token instanceof PersonalAccessToken ? $token->getKey() : null;

        if ($tokenId === null) {
            // Signed in, but not with a token this module minted — a cookie
            // session from the back office, or a general-purpose API token.
            return $this->refuse('Bu token kassa sessiyasiga bog\'lanmagan.', 'POS_SESSION_TOKEN_REQUIRED');
        }

        /** @var TerminalSession|null $session */
        $session = TerminalSession::query()
            ->open()
            ->where('access_token_id', $tokenId)
            ->with('terminal')
            ->first();

        if ($session === null) {
            return $this->refuse('Kassa sessiyasi topilmadi yoki yopilgan.', 'POS_SESSION_CLOSED');
        }

        if ($session->hasExpired((int) config('pos.pin.session_idle_minutes', 15))) {
            $session->close('timeout');

            return $this->refuse('Sessiya harakatsizlikdan yopildi. PIN kiriting.', 'POS_SESSION_TIMEOUT');
        }

        if ($session->terminal === null || $session->terminal->status !== 'active') {
            return $this->refuse('Terminal faol emas.', 'POS_TERMINAL_INACTIVE');
        }

        $session->touchActivity();

        $request->attributes->set(self::ATTRIBUTE_SESSION, $session);
        $request->attributes->set(self::ATTRIBUTE_TERMINAL, $session->terminal);

        return $next($request);
    }

    private function refuse(string $message, string $code): Response
    {
        return response()->json(['message' => $message, 'code' => $code], Response::HTTP_FORBIDDEN);
    }
}
