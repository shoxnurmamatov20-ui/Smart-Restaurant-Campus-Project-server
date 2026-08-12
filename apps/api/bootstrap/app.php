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

        // Trust X-Forwarded-* headers (behind Nginx)
        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Sentry, error formatting, etc. — to be configured later
    })
    ->create();
