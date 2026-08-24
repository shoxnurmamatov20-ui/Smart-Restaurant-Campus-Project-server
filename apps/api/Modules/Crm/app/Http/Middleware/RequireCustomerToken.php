<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Middleware;

use App\Support\Auth\GuestIdentity;
use App\Support\Errors\ErrorResponse;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use LogicException;
use Modules\Crm\Models\Customer;
use Symfony\Component\HttpFoundation\Response;

/**
 * "This route wants a guest, not a member of staff."
 *
 * A customer holds a Sanctum token like everybody else, and this middleware
 * resolves it by hand instead of using `auth:sanctum`. That is not a
 * preference — `auth:sanctum` cannot work here, and the reason is worth
 * writing down because it looks like an oversight from every angle except one.
 *
 * ---------------------------------------------------------------------------
 * Why not `auth:sanctum`
 *
 * `Illuminate\Auth\Middleware\Authenticate` implements `AuthenticatesRequests`,
 * which puts it near the TOP of the priority list in `bootstrap/app.php` —
 * above `StartTenancyClosed` and far above `ResolveTenant`. So when Sanctum
 * loads the token's owner, no tenant has been resolved yet and the connection
 * is fail-closed.
 *
 * For a `User` that is fine: `public.users` is one of the three tables
 * deliberately exempt from row-level security, precisely because
 * authentication has to read it before authentication has happened. The same
 * exemption is why `pos.terminals` and `staff.devices` are on that list.
 *
 * `crm.customers` is not on that list and must not join it. It holds names,
 * phone numbers, addresses and loyalty balances for every guest of every
 * restaurant on the platform — it is the single most valuable table here to
 * read across tenants, and `RowLevelSecurityTest` names the three exemptions
 * one by one so that a fourth cannot be added quietly.
 *
 * So the guest is resolved AFTER the tenant is. This middleware sits behind the
 * `tenant` group, the policies are already focused on one restaurant, and the
 * lookup below inherits tenant isolation from PostgreSQL rather than asserting
 * it: a token minted at one restaurant, presented with another's `X-Tenant`,
 * finds no row and is refused. That is a stronger guarantee than a comparison
 * in PHP, because it holds for every query this class does not make.
 *
 * ---------------------------------------------------------------------------
 * What the token may do
 *
 * One ability, `customer`, and it is checked rather than assumed. A staff token
 * presented here is refused even though it is a perfectly valid token, because
 * every route behind this middleware answers "your profile, your addresses,
 * your orders" and a waiter's token has no such "your".
 */
final class RequireCustomerToken
{
    public const ATTRIBUTE = 'crm.customer';

    /**
     * The one thing a customer token is for.
     *
     * Deferred to the core rather than spelled again here: `Orders` cannot
     * import this class and asks `App\Support\Auth\GuestIdentity` the smaller
     * version of the same question, and two copies of the word that gates every
     * guest endpoint would be one copy too many.
     */
    public const ABILITY = GuestIdentity::ABILITY;

    /** @param Closure(Request): Response $next */
    public function handle(Request $request, Closure $next): Response
    {
        $resolved = $this->resolve($request);

        if (is_string($resolved)) {
            return ErrorResponse::code($resolved);
        }

        if ($resolved === null) {
            return ErrorResponse::code('crm.customer_token_required');
        }

        $request->attributes->set(self::ATTRIBUTE, $resolved);
        // The id as well as the model, so a core caller further down the stack
        // gets the answer without re-hashing the token. See GuestIdentity.
        $request->attributes->set(GuestIdentity::ATTRIBUTE, (int) $resolved->getKey());

        return $next($request);
    }

    /**
     * The guest behind this request, if there is one and nothing is wrong.
     *
     * For the endpoints where signing in is optional rather than required —
     * the feedback form, above all. A guest scanning the QR code at a table has
     * no account and must still be able to say the soup was cold; a guest who
     * IS signed in should have that review land on their record rather than
     * beside it. Two endpoints would be the alternative, and the second one
     * would collect nothing.
     *
     * Silent on every refusal, deliberately. A token that has expired between
     * writing the review and pressing send must not lose the review — the
     * comment is worth more than the attribution.
     */
    public static function optional(Request $request): ?Customer
    {
        $resolved = (new self)->resolve($request);

        return $resolved instanceof Customer ? $resolved : null;
    }

    /**
     * @return Customer|string|null The guest, an error code, or null for "no token offered"
     */
    private function resolve(Request $request): Customer|string|null
    {
        $bearer = $request->bearerToken();

        if ($bearer === null || $bearer === '') {
            return null;
        }

        $token = PersonalAccessToken::findToken($bearer);

        if ($token === null || ! $token->can(self::ABILITY)) {
            /*
             * A token that does not exist and a staff token get one answer.
             * Two answers would make this endpoint a way to ask "is this string
             * a live token somewhere on the platform", which is a question
             * nobody outside should be able to ask.
             */
            return 'crm.customer_token_required';
        }

        if ($token->expires_at !== null && $token->expires_at->isPast()) {
            // Its own code: the client's move is to send the guest back through
            // the SMS, and "your session ended" is a different screen from
            // "something is wrong with this request".
            return 'crm.customer_token_expired';
        }

        /*
         * Scoped by the policies, not by a `where`.
         *
         * `BelongsToTenant` adds the Eloquent scope and PostgreSQL adds the
         * same rule underneath it. Between them, a token from another
         * restaurant resolves to nothing here — which is the correct answer,
         * and the same one a deleted guest gets.
         */
        $guest = $token->tokenable_type === Customer::class
            ? Customer::query()->whereKey($token->tokenable_id)->first()
            : null;

        if ($guest === null) {
            return 'crm.customer_token_required';
        }

        if (! $guest->is_active) {
            // A guest the restaurant has blocked. 403 rather than 401: the
            // credential is fine, the account is not, and telling the app to
            // re-send an SMS would put them in a loop that always ends here.
            return 'crm.customer_blocked';
        }

        /*
         * When this token was last used, for the profile screen's "you are
         * signed in on 2 devices" and for revoking the ones that went quiet.
         * `forceFill`+`save` rather than `touch` so only this column moves.
         */
        $token->forceFill(['last_used_at' => now()])->save();

        return $guest;
    }

    /**
     * The guest this request authenticated as.
     *
     * A static reader rather than `$request->attributes->get(...)` at each call
     * site: the attribute key and its type live in one place, and a controller
     * cannot half-remember either. The same shape `RequireTerminalToken::of()`
     * uses in the till.
     */
    public static function of(Request $request): Customer
    {
        $guest = $request->attributes->get(self::ATTRIBUTE);

        if (! $guest instanceof Customer) {
            // Unreachable through the router — the middleware refuses first.
            // Reached only by a route that forgot to apply it, which is a
            // programming error and says so rather than answering 500 later.
            throw new LogicException('Route is missing the customer.token middleware.');
        }

        return $guest;
    }
}
