<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Middleware;

use App\Support\Errors\ErrorResponse;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use LogicException;
use Modules\Marketplace\Models\Consumer;
use Symfony\Component\HttpFoundation\Response;

/**
 * "This route wants a marketplace customer, and not anybody else."
 *
 * It sits BEHIND `auth:sanctum` rather than replacing it, which is the
 * difference from `Crm\RequireCustomerToken` one module over and is worth the
 * paragraph.
 *
 * That one resolves the token by hand because `crm.customers` is behind
 * row-level security and Laravel sorts the framework's `Authenticate`
 * middleware above `ResolveTenant` — so Sanctum would read a guarded table
 * before any restaurant is known, and find nothing. `marketplace.consumers`
 * carries no `tenant_id` and no policy at all, for the reason written on the
 * model: a marketplace customer belongs to the platform rather than to a
 * restaurant. So Sanctum can read it whenever it likes, and `auth:sanctum` does
 * its ordinary job.
 *
 * What is left for this class is the part Sanctum does not do: check that the
 * token is a CONSUMER's. A waiter's token is a perfectly valid Sanctum token
 * and would sail straight through `auth:sanctum` onto endpoints that answer
 * "your orders, your addresses, your points" — questions a member of staff has
 * no "your" for.
 *
 * Two checks, and both are needed:
 *
 *   **The tokenable is a Consumer.** Type, not ability, because a class is not
 *   something a token can be talked into.
 *
 *   **The ability is `mp-consumer`.** So a token minted for some future
 *   marketplace purpose — a courier app, a merchant's own phone — cannot read a
 *   customer's history just by belonging to the same table.
 */
final class RequireConsumerToken
{
    public const ATTRIBUTE = 'marketplace.consumer';

    /** @param Closure(Request): Response $next */
    public function handle(Request $request, Closure $next): Response
    {
        /*
         * Asked of the guard rather than of the request, and the difference is
         * a typing one that matters: `$request->user()` is declared as the
         * application's own `User`, so a check for anything else reads as
         * impossible to static analysis — and this middleware exists precisely
         * because it is not. The guard contract answers `Authenticatable`,
         * which is what a Consumer is.
         */
        $user = Auth::guard('sanctum')->user();

        if (! $user instanceof Consumer) {
            /*
             * One answer for "not a consumer token" and for "no token at all".
             * Two would make this endpoint a way to ask whether a given string
             * is a live staff token somewhere on the platform.
             */
            return ErrorResponse::code('marketplace.consumer_token_required');
        }

        if (! $user->tokenCan(Consumer::ABILITY)) {
            return ErrorResponse::code('marketplace.consumer_token_required');
        }

        if (! $user->is_active) {
            // The credential is fine, the account is not. 403 rather than 401:
            // telling the app to send another SMS puts the guest in a loop that
            // always ends here.
            return ErrorResponse::code('marketplace.consumer_blocked');
        }

        $request->attributes->set(self::ATTRIBUTE, $user);

        return $next($request);
    }

    /**
     * The customer this request authenticated as.
     *
     * A static reader rather than `$request->user()` at each call site, and the
     * reason is the return type: every controller behind this middleware needs
     * a `Consumer`, `user()` is typed as an authenticatable, and the alternative
     * is an `instanceof` in each of them that static analysis has to be told
     * about. The same shape `RequireCustomerToken::of()` uses in CRM.
     */
    public static function of(Request $request): Consumer
    {
        $consumer = $request->attributes->get(self::ATTRIBUTE);

        if (! $consumer instanceof Consumer) {
            // Unreachable through the router — the middleware refuses first.
            // Reached only by a route that forgot to apply it, which is a
            // programming error and says so rather than answering 500 later.
            throw new LogicException('Route is missing the mp.consumer middleware.');
        }

        return $consumer;
    }
}
