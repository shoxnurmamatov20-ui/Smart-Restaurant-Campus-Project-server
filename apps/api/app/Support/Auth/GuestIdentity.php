<?php

declare(strict_types=1);

namespace App\Support\Auth;

use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Which guest, if any, is holding this phone — asked from anywhere.
 *
 * `Modules\Crm\Http\Middleware\RequireCustomerToken` already answers this, and
 * answers it better: it returns the `Customer` itself, with the addresses and
 * the loyalty balance hanging off it. But it lives in CRM, and CRM is a module.
 * `Modules\Orders` may not import it — `ModuleBoundaryTest` refuses the edge and
 * is right to, because a bill must keep being takeable at a venue that runs no
 * loyalty scheme at all.
 *
 * So the core answers the smaller question. An id, an integer, and nothing else:
 * enough for Orders to stamp `customer_id` on a bill and to ask
 * `App\Contracts\Crm\Promotions` whether this person's coupon is real, and not
 * enough to be a second, drifting copy of the guest record.
 *
 * ---------------------------------------------------------------------------
 * The ability is the whole of the check
 *
 * A customer token carries exactly one ability, `customer`, and a staff token
 * never carries it. That is the same gate `RequireCustomerToken` uses and the
 * same reason: a waiter's session must not be able to read "your orders" on an
 * endpoint whose entire notion of "your" is the token.
 *
 * Every refusal is silent — an expired token, a staff token, no token at all
 * are one answer, `null`. That is right for the callers this has: ordering
 * dinner works signed out, so a token that went stale on the way to the
 * checkout must cost the guest their coupon, never their dinner. Endpoints
 * where signing in is REQUIRED keep using the middleware, which explains itself.
 */
final class GuestIdentity
{
    /** The one thing a customer token is for. */
    public const ABILITY = 'customer';

    /**
     * Where a middleware that already did this work leaves the answer.
     *
     * An int rather than the model, deliberately, and separate from CRM's own
     * `crm.customer` attribute: a core caller that could reach the model would
     * be importing CRM through the back door of a request attribute.
     */
    public const ATTRIBUTE = 'guest.customer_id';

    /**
     * The signed-in guest's id, or null when nobody is.
     *
     * Reads the attribute first so that a route already behind
     * `customer.token` costs one lookup rather than two — the middleware there
     * has resolved the same token a moment earlier, and doing it again would
     * mean two hash comparisons per request on the busiest guest path we have.
     */
    public static function of(Request $request): ?int
    {
        $known = $request->attributes->get(self::ATTRIBUTE);

        if (is_int($known) && $known > 0) {
            return $known;
        }

        $bearer = $request->bearerToken();

        if ($bearer === null || $bearer === '') {
            return null;
        }

        $token = PersonalAccessToken::findToken($bearer);

        if ($token === null || ! $token->can(self::ABILITY)) {
            return null;
        }

        if ($token->expires_at !== null && $token->expires_at->isPast()) {
            return null;
        }

        $id = (int) $token->tokenable_id;

        return $id > 0 ? $id : null;
    }
}
