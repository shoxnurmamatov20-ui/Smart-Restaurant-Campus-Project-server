<?php

declare(strict_types=1);

use App\Http\Middleware\EnsureModuleEnabled;
use App\Http\Middleware\RefineLocale;
use App\Http\Middleware\ResolveBranch;
use App\Http\Middleware\ResolveTenant;
use App\Http\Middleware\SetLocale;
use Illuminate\Auth\Middleware\Authorize;
use Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests;
use Illuminate\Contracts\Session\Middleware\AuthenticatesSessions;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Foundation\Http\Middleware\HandlePrecognitiveRequests;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Routing\Middleware\ThrottleRequestsWithRedis;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\View\Middleware\ShareErrorsFromSession;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        apiPrefix: 'api',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Sanctum SPA auth (cookies for web/admin)
        $middleware->statefulApi();

        // API throttling
        $middleware->throttleApi();

        // Language is decided for every API request, public ones included —
        // a guest scanning a QR menu has no account to read a preference from.
        $middleware->appendToGroup('api', [
            SetLocale::class,
        ]);

        // Declared as a group, not an alias, so routes keep writing `tenant`
        // while the second locale pass rides along behind tenant resolution
        // (it needs the user and the restaurant, which only exist by then).
        $middleware->group('tenant', [
            ResolveTenant::class,
            ResolveBranch::class,
            RefineLocale::class,
            EnsureModuleEnabled::class,
        ]);

        /*
         * Middleware order, stated in full rather than inherited.
         *
         * The one line that matters is ResolveTenant sitting ABOVE
         * SubstituteBindings. Laravel's default puts route-model binding first,
         * which means `/api/v1/menu/items/{item}` resolved the dish before any
         * restaurant was known — and the BelongsToTenant global scope, having no
         * tenant to filter by, let it through. Any signed-in user could read (and
         * with a PATCH, rewrite) another restaurant's row by guessing an id.
         *
         * Authentication still comes first: ResolveTenant pins a user to their
         * own restaurant, so it has to know who they are.
         */
        $middleware->priority([
            HandlePrecognitiveRequests::class,
            EncryptCookies::class,
            AddQueuedCookiesToResponse::class,
            StartSession::class,
            ShareErrorsFromSession::class,
            AuthenticatesRequests::class,
            ThrottleRequests::class,
            ThrottleRequestsWithRedis::class,
            AuthenticatesSessions::class,

            SetLocale::class,
            ResolveTenant::class,
            ResolveBranch::class,
            RefineLocale::class,
            EnsureModuleEnabled::class,

            SubstituteBindings::class,
            Authorize::class,
        ]);

        /*
         * Where a guest is sent, and why the default could not stay.
         *
         * ApplicationBuilder::withMiddleware() installs
         * `redirectGuestsTo(fn () => route('login'))` before this callback runs.
         * There is no route named `login` in this application — signing in is a
         * Next.js page that posts to its own handler — so Authenticate resolved
         * that closure and threw RouteNotFoundException from inside the
         * middleware, long before the exception handler could turn a missing
         * session into a 401.
         *
         * The result was a 500, with a stack trace logged, every time an
         * unauthenticated request arrived without `Accept: application/json`.
         * The consoles always send that header and were answered correctly,
         * which is why this survived: it only ever fired for a browser opened on
         * an API URL, an uptime probe, or curl — 27 of them in one day's log.
         *
         * A path rather than a route name: `/login` is served by the staff
         * console through nginx, so a person who lands on a guarded HTML page
         * gets the actual sign-in screen. API callers never reach it — the
         * exception handler answers them in JSON first. See withExceptions below;
         * both halves are needed, and fixing only one leaves the 500 in place.
         */
        $middleware->redirectGuestsTo('/login');

        // Trust X-Forwarded-* headers (behind Nginx)
        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        /*
         * Answer an unauthenticated request. Do not try to redirect it.
         *
         * Laravel's Authenticate middleware sends a guest to route('login')
         * whenever the request does not look like it wants JSON. There is no
         * `login` route in this application — signing in belongs to the Next.js
         * consoles, which post to their own route handler — so that redirect
         * throws RouteNotFoundException and the caller is told 500.
         *
         * It stayed hidden because the consoles send `Accept: application/json`
         * and were answered 401 exactly as they should be. Everything else —
         * a browser opened on an API URL, an uptime probe, curl with no header —
         * got "500 Internal Server Error" for the ordinary condition of not
         * being signed in, and wrote a stack trace for each: 22 in one day's log
         * when this was found. A monitor reading that cannot tell "nobody is
         * logged in" from "the server is broken", which is the real cost.
         *
         * Scoped to the paths Laravel serves here rather than switched on
         * globally: Horizon, Telescope and Pulse are HTML dashboards and their
         * error pages should stay HTML.
         */
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request, Throwable $e): bool => $request->is(
                'api/*',
                'sanctum/*',
                'broadcasting/*',
                'up',
            ) || $request->expectsJson(),
        );
    })
    ->create();
