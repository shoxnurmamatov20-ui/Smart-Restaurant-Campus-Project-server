<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\Tenancy\DatabaseTenancy;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Tests\Architecture\TenancyClaimTest;

/**
 * Every request starts with no restaurant. Something has to claim one.
 *
 * Row-level security fails closed, which is the right default and was chosen
 * deliberately — but "closed" was only ever the *resting* state of a php-fpm
 * worker, never something a request stated. That difference hid a whole class
 * of bug for exactly as long as it took to find it:
 *
 *   - A php-fpm worker rests closed, so a tenant-less request read nothing.
 *   - A PHPUnit process rests on BYPASS, because migrations, seeders and
 *     assertions between simulated requests need the whole platform visible.
 *
 * So every feature test ran with row-level security effectively switched off.
 * 624 tests passed while three production paths were broken: pairing a terminal
 * ("Ulash kodi noto'g'ri" for a code issued thirty seconds earlier), every
 * Telegram bot endpoint (404 on a bot key that exists), and the platform
 * operator's sign-in (its audit row refused by the policy).
 *
 * This middleware makes the request say it. It runs first on every API request
 * and closes the connection; ResolveTenant then focuses it on a restaurant, or
 * opens it for the platform operator, or leaves it shut. Routes with no tenant
 * middleware at all stay shut — under test exactly as in production, which is
 * the point. Work outside a request is untouched, so factories and assertions
 * keep their bypass.
 *
 * A route that legitimately needs to read across restaurants now has to say so
 * in code — DatabaseTenancy::withoutTenancy() — rather than inheriting it from
 * whatever the process happened to be doing.
 *
 * @see TenancyClaimTest which route may do that, and why
 */
final class StartTenancyClosed
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $tenancy = app(DatabaseTenancy::class);
        $tenancy->close();

        try {
            return $next($request);
        } finally {
            /*
             * Put the process back where it was, the same way ResolveTenant
             * does. Closing without restoring is harmless under php-fpm, where
             * closed IS the resting state — and poison under test, where the
             * next factory call in the same method would find a connection
             * still shut by the previous request and refuse to write.
             */
            $tenancy->reset();
        }
    }
}
