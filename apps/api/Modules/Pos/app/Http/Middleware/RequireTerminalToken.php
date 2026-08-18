<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Middleware;

use App\Support\Errors\ErrorResponse;
use Closure;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\Request;
use Modules\Pos\Models\Terminal;
use Symfony\Component\HttpFoundation\Response;

/**
 * "This route wants a device, not a person."
 *
 * Two endpoints answer before anybody has typed a PIN — the heartbeat and the
 * idle screen — and both are scoped by the terminal's own branch. A user token
 * cannot serve them: an owner's token names no till, so there would be no
 * branch to scope by and nothing to record liveness against.
 *
 * It exists as middleware rather than as four lines in each controller for two
 * reasons. A guard belongs where guards are read — a route with no middleware
 * looks unguarded in `route:list`, which is exactly why these two needed
 * entries in ModuleRouteGuardTest's documented-exception list. And the
 * controllers were making the check by hand through `$request->user()`, whose
 * stub type is narrowed to the User model in config/auth.php: static analysis
 * concluded the guard could never pass and called everything after it dead
 * code. Two baseline entries hid that, under a comment claiming a `@var`
 * annotation had fixed it. It had not. Resolving the terminal here, from the
 * token, and handing it on as a request attribute means the type is honest at
 * both ends.
 *
 * @see RequireTerminalSession the next gate along — device AND person
 */
final class RequireTerminalToken
{
    public const ATTRIBUTE = 'pos.terminal';

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        /**
         * Sanctum hands back whichever model owns the presented token, and a
         * Terminal owns its own: it is Authenticatable, uses HasApiTokens, and
         * TerminalPairing mints the token against it.
         *
         * The annotation widens the type back to the truth. Larastan narrows
         * `$request->user()` to the provider model in config/auth.php, decides
         * the guard below can never pass, and calls the rest dead code. The two
         * controllers that used to make this check by hand carried the same
         * note — but as a `/*` comment rather than a `/**` docblock, which
         * PHPStan does not read for `@var` at all. So the note claimed a fix
         * that had never applied, and two baseline entries quietly held the
         * errors down. Both are now deleted.
         *
         * @var Authenticatable|null $holder
         */
        $holder = $request->user();

        if (! $holder instanceof Terminal) {
            return ErrorResponse::code('pos.terminal_token_required');
        }

        if ($holder->status !== 'active') {
            // A till taken out of service must stop answering the moment it is
            // switched off, not when its token expires.
            return ErrorResponse::code('pos.terminal_disabled');
        }

        $request->attributes->set(self::ATTRIBUTE, $holder);

        return $next($request);
    }

    /**
     * The terminal this request authenticated as.
     *
     * A static reader rather than `$request->attributes->get(...)` at each call
     * site: the attribute key and its type live in one place, and a controller
     * cannot half-remember either.
     */
    public static function of(Request $request): Terminal
    {
        $terminal = $request->attributes->get(self::ATTRIBUTE);

        if (! $terminal instanceof Terminal) {
            // Unreachable through the router — the middleware refuses first.
            // Reached only by a route that forgot to apply it, which is a
            // programming error and says so rather than answering 500 later.
            throw new \LogicException('Route is missing the pos.device middleware.');
        }

        return $terminal;
    }
}
