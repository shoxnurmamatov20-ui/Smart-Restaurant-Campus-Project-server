<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Middleware;

use App\Models\User;
use App\Support\Errors\ErrorResponse;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * "Is there a human on the other end of this token?"
 *
 * Most of the till's routes answer that by requiring a PIN session, which
 * implies a person by construction. The approval queue cannot: P9's whole point
 * is that a manager signs a discount off from the car park, on their phone, with
 * an ordinary user token and no terminal anywhere near them. So the session
 * requirement comes off those three routes — and this goes on instead.
 *
 * Two things would otherwise be true, and both are worse than they look.
 *
 * A device token would reach them. Sanctum's tokenable in this module is either
 * a `User` or a `Terminal`, and a terminal holding its own long-lived token is
 * exactly the credential a cashier has physical access to all evening. Without
 * this, the tablet could sign off its own operator's discounts.
 *
 * And it would do so by crashing rather than refusing: Spatie's permission
 * middleware calls `canAny()` on whatever is authenticated, `Terminal` is not
 * `Authorizable`, and the request dies as a 500 with a stack trace instead of a
 * translated refusal. Which is why this runs BEFORE the permission check rather
 * than inside the controller — by the time a controller sees the request, the
 * permission middleware has already tried.
 */
final class RequirePerson
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user() instanceof User) {
            // Same code the session guard uses, and for the same reason: the
            // credential is valid, it is simply not a person's.
            return ErrorResponse::code('pos.session_required');
        }

        return $next($request);
    }
}
