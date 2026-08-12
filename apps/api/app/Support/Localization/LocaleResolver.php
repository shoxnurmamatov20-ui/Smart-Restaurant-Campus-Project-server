<?php

declare(strict_types=1);

namespace App\Support\Localization;

use Illuminate\Http\Request;

/**
 * Works out which language a request speaks.
 *
 * Order of authority, strongest first:
 *
 *   1. `X-Locale`        — a deliberate per-request choice, e.g. the language
 *                          switcher in the POS or the QR menu
 *   2. the user's saved locale — what they chose in their own settings
 *   3. `Accept-Language` — the browser's guess; right for a walk-in guest with
 *                          no account, but it must never override a preference
 *                          the person actually set
 *   4. the restaurant's default locale
 *   5. the application default
 *
 * Kept as a service rather than living inside one middleware because the
 * decision is made in two passes: the request's own signals are readable
 * immediately, but the signed-in user and the restaurant are only known once
 * authentication and tenant resolution have run.
 */
final class LocaleResolver
{
    /** Request attribute holding the `X-Locale` value, when it was valid. */
    public const EXPLICIT_ATTRIBUTE = 'locale.explicit';

    /** Request attribute holding the `Accept-Language` pick, when there was one. */
    public const PREFERRED_ATTRIBUTE = 'locale.preferred';

    /**
     * @return array<int, string>
     */
    public function supported(): array
    {
        /** @var array<int, string> $locales */
        $locales = config('app.supported_locales', ['uz', 'ru', 'en']);

        return $locales;
    }

    public function fallback(): string
    {
        $fallback = (string) config('app.locale', 'uz');

        return $this->isSupported($fallback) ? $fallback : 'uz';
    }

    public function isSupported(?string $locale): bool
    {
        return $locale !== null && in_array($locale, $this->supported(), true);
    }

    /**
     * The client stating a language outright. Null when the header is absent or
     * names a language the platform does not speak.
     */
    public function explicit(Request $request): ?string
    {
        $value = strtolower(trim((string) $request->header('X-Locale')));

        return $this->isSupported($value) ? $value : null;
    }

    /**
     * The browser's advertised preference, honouring quality values.
     *
     * `en;q=0.4,ru-RU;q=0.9` resolves to `ru`, not to whichever tag happens to
     * appear first after a naive split.
     */
    public function preferred(Request $request): ?string
    {
        $header = (string) $request->header('Accept-Language');

        if (trim($header) === '') {
            return null;
        }

        /** @var array<string, float> $ranked */
        $ranked = [];

        foreach (explode(',', $header) as $part) {
            $bits = explode(';q=', trim($part));
            $tag = strtolower(explode('-', trim($bits[0]))[0]);

            if ($tag === '' || $tag === '*') {
                continue;
            }

            $quality = isset($bits[1]) ? (float) $bits[1] : 1.0;

            if (! isset($ranked[$tag]) || $ranked[$tag] < $quality) {
                $ranked[$tag] = $quality;
            }
        }

        arsort($ranked);

        foreach (array_keys($ranked) as $tag) {
            if ($this->isSupported($tag)) {
                return $tag;
            }
        }

        return null;
    }

    /**
     * Pick the first supported locale out of an ordered list of candidates,
     * falling back to the application default when none of them fit.
     */
    public function firstSupported(?string ...$candidates): string
    {
        foreach ($candidates as $candidate) {
            if ($this->isSupported($candidate)) {
                return (string) $candidate;
            }
        }

        return $this->fallback();
    }

    /**
     * Apply a locale to the whole application — Laravel's translator, Carbon's
     * date formatting, and anything reading `app()->getLocale()`, which is how
     * `HasTranslations` picks a value out of a `{uz, ru, en}` column.
     */
    public function apply(?string $locale): void
    {
        app()->setLocale($this->firstSupported($locale));
    }
}
