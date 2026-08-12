<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\Localization\LocaleResolver;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * First pass at choosing a language, from the request alone.
 *
 * Without this the platform is multilingual on paper only: dish names are
 * stored as `{uz, ru, en}` and `HasTranslations` resolves against
 * `app()->getLocale()`, which never moved off the config default. A Russian
 * guest scanning a QR menu would silently be served Uzbek.
 *
 * Runs on every API request, public ones included — a guest at a table has no
 * account to read a preference from. What the request itself carries is stashed
 * for {@see RefineLocale}, which gets a second go once the signed-in user and
 * the restaurant are known.
 */
final readonly class SetLocale
{
    public function __construct(private LocaleResolver $resolver) {}

    /**
     * @param Closure(Request): Response $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $explicit = $this->resolver->explicit($request);
        $preferred = $this->resolver->preferred($request);

        $request->attributes->set(LocaleResolver::EXPLICIT_ATTRIBUTE, $explicit);
        $request->attributes->set(LocaleResolver::PREFERRED_ATTRIBUTE, $preferred);

        $this->resolver->apply($explicit ?? $preferred);

        $response = $next($request);

        // Set on the way out so it states the final decision, including any
        // change made by RefineLocale — caches and CDNs key on this header.
        $response->headers->set('Content-Language', app()->getLocale());

        return $response;
    }
}
