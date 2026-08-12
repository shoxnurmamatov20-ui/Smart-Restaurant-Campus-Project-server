<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\Localization\LocaleResolver;
use App\Support\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Second pass at choosing a language, once we know who is asking.
 *
 * Runs after authentication and tenant resolution. An `X-Locale` header is a
 * deliberate choice and is left alone; everything else is re-decided here so
 * that a waiter who set their account to Russian gets Russian from the POS
 * without the client having to remember a header, and a guest whose browser
 * says nothing useful still gets the restaurant's own language rather than a
 * platform-wide default.
 */
final readonly class RefineLocale
{
    public function __construct(
        private LocaleResolver $resolver,
        private TenantContext $tenants,
    ) {}

    /**
     * @param Closure(Request): Response $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $explicit = $request->attributes->get(LocaleResolver::EXPLICIT_ATTRIBUTE);

        if (is_string($explicit)) {
            return $next($request);
        }

        $user = $request->user();
        $preferred = $request->attributes->get(LocaleResolver::PREFERRED_ATTRIBUTE);

        $this->resolver->apply($this->resolver->firstSupported(
            $user instanceof User ? $user->locale : null,
            is_string($preferred) ? $preferred : null,
            $this->tenants->tenant()?->locale,
        ));

        return $next($request);
    }
}
