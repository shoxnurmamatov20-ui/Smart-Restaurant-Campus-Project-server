<?php

declare(strict_types=1);

namespace App\Support\Modules;

/**
 * One module, as the platform describes it to a client.
 *
 * A plain value object rather than an array so the shape is checked at the
 * boundary: the admin sidebar, the mobile app and the Telegram WebApp all build
 * their navigation from this, and a silently renamed key would break all three.
 */
final readonly class ModuleDescriptor
{
    /**
     * @param array<string, string> $labels
     * @param array<int, string> $permissions
     */
    public function __construct(
        public string $key,
        public string $name,
        public array $labels,
        public ?string $description,
        public string $icon,
        public string $group,
        public string $route,
        public int $order,
        public string $permissionPrefix,
        public array $permissions,
        public bool $enabled,
        public bool $required,
    ) {}

    /** Display name in the request locale, falling back rather than blanking. */
    public function title(): string
    {
        foreach ([app()->getLocale(), (string) config('app.fallback_locale', 'uz'), 'uz'] as $locale) {
            $label = $this->labels[$locale] ?? null;

            if (is_string($label) && $label !== '') {
                return $label;
            }
        }

        return $this->name;
    }
}
