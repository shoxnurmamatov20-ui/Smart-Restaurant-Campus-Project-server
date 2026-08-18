<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Middleware;

use App\Models\User;
use App\Support\Errors\ErrorResponse;
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
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user instanceof User) {
            // A device token on its own is not a person. Type a PIN.
            return $this->refuse('pos.session_required');
        }

        $token = $user->currentAccessToken();
        $tokenId = $token instanceof PersonalAccessToken ? $token->getKey() : null;

        if ($tokenId === null) {
            // Signed in, but not with a token this module minted — a cookie
            // session from the back office, or a general-purpose API token.
            return $this->refuse('pos.session_token_required');
        }

        /** @var TerminalSession|null $session */
        $session = TerminalSession::query()
            ->open()
            ->where('access_token_id', $tokenId)
            ->with('terminal')
            ->first();

        if ($session === null) {
            return $this->refuse('pos.session_closed');
        }

        if ($session->hasExpired((int) config('pos.pin.session_idle_minutes', 15))) {
            $session->close('timeout');

            return $this->refuse('pos.session_timeout');
        }

        if ($session->terminal === null || $session->terminal->status !== 'active') {
            return $this->refuse('pos.terminal_inactive');
        }

        $session->touchActivity();

        $request->attributes->set(self::ATTRIBUTE_SESSION, $session);
        $request->attributes->set(self::ATTRIBUTE_TERMINAL, $session->terminal);

        return $next($request);
    }

    /**
     * Every refusal here is 403, not 401: the device token IS valid, and it is
     * the human session behind it that is missing or timed out. A 401 would
     * send a paired terminal back through pairing; a 403 sends the waiter back
     * to the PIN pad, which is what actually needs to happen.
     */
    private function refuse(string $code): Response
    {
        return ErrorResponse::code($code);
    }
}
