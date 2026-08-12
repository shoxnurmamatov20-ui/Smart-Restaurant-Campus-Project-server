<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use Illuminate\Support\Arr;

/**
 * Minimal translatable-attribute support for jsonb `{uz, ru, en}` columns.
 *
 * Smart Restaurant Campus stores *user-visible content* (dish names, category
 * titles, promo texts) as a JSON object keyed by locale, so one restaurant can
 * serve a Russian-speaking guest and an English-speaking tourist from the same
 * row. UI chrome (buttons, labels) is NOT stored here — that lives in
 * packages/i18n on the frontend.
 *
 * A model opts in by listing the columns:
 *
 *     protected array $translatable = ['name', 'description'];
 *
 * and casting them to 'array'.
 */
trait HasTranslations
{
    /**
     * Columns that hold a `{locale: value}` map.
     *
     * @return array<int, string>
     */
    public function translatableAttributes(): array
    {
        /** @var array<int, string> */
        return property_exists($this, 'translatable') ? $this->translatable : [];
    }

    /**
     * Resolve one translatable attribute for a locale.
     *
     * Falls back: requested locale → app fallback locale → 'uz' → first value.
     * Returns null only when the column is empty.
     */
    public function translate(string $attribute, ?string $locale = null): ?string
    {
        $value = $this->getAttribute($attribute);

        if (is_string($value)) {
            return $value;
        }

        if (! is_array($value) || $value === []) {
            return null;
        }

        $locale ??= app()->getLocale();
        $fallback = (string) config('app.fallback_locale', 'en');

        foreach ([$locale, $fallback, 'uz'] as $candidate) {
            $translated = Arr::get($value, $candidate);

            if (is_string($translated) && $translated !== '') {
                return $translated;
            }
        }

        $first = Arr::first($value, static fn ($item): bool => is_string($item) && $item !== '');

        return is_string($first) ? $first : null;
    }

    /**
     * All translatable columns resolved for the current locale.
     *
     * @return array<string, string|null>
     */
    public function translatedAttributes(?string $locale = null): array
    {
        $resolved = [];

        foreach ($this->translatableAttributes() as $attribute) {
            $resolved[$attribute] = $this->translate($attribute, $locale);
        }

        return $resolved;
    }
}
