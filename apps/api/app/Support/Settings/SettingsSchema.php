<?php

declare(strict_types=1);

namespace App\Support\Settings;

use Illuminate\Support\Arr;
use Illuminate\Support\Str;

/**
 * The declared shape of a jsonb settings document, and the two things a
 * declaration is worth: rules for what is written, and a refusal for what is
 * not declared at all.
 *
 * The second half is the reason this class exists. `$tenant->settings` accepts
 * any key, so a console that sent `vat_precent` got a 200, stored the typo
 * forever, and every reader downstream went on using the default — a silent
 * wrong number on every receipt, with a green save button. Laravel's own
 * validator cannot catch that either: rules describe the keys you named, and
 * say nothing about the ones you did not.
 *
 * So writes are checked in both directions. Every declared path gets its rule;
 * every path the client sent has to match a declared one, or the request comes
 * back 422 naming it.
 *
 * See config/settings.php for the schema itself.
 */
final class SettingsSchema
{
    /**
     * The rule list for one group, keyed by dot path — Laravel's own format,
     * wildcards included.
     *
     * @return array<string, list<string>>
     */
    public static function rules(string $group): array
    {
        /** @var array<string, array<string, list<string>>> $schema */
        $schema = config('settings.schema', []);

        return $schema[$group] ?? [];
    }

    /**
     * Where this group lives inside the document, or null for the root.
     */
    public static function root(string $group): ?string
    {
        /** @var array<string, string|null> $roots */
        $roots = config('settings.root', []);

        return $roots[$group] ?? null;
    }

    /**
     * Paths the caller sent that the schema never declared.
     *
     * Leaf paths only: `legal` is not a violation, `legal.stir` is. A client
     * sending a whole object is sending its leaves, and naming the leaf is what
     * makes the error message actionable — "legal.stir is not a setting" tells
     * the sender what to fix, "legal is invalid" does not.
     *
     * @param array<string, mixed> $payload
     *
     * @return list<string>
     */
    public static function undeclared(string $group, array $payload): array
    {
        $declared = array_keys(self::rules($group));
        $unknown = [];

        foreach (self::leaves($payload) as $path) {
            foreach ($declared as $pattern) {
                if (Str::is($pattern, $path)) {
                    continue 2;
                }
            }

            $unknown[] = $path;
        }

        return $unknown;
    }

    /**
     * Every leaf path in a nested payload, in dot notation.
     *
     * `Arr::dot()` alone is not enough: it flattens an empty array to the array
     * itself and a list to indexed keys, and both need to be read as leaves of
     * the path that holds them — `channels.0` has to match the declared
     * `channels.*`, and `hours.mon` sent as `{}` is a leaf nobody declared.
     *
     * @param array<array-key, mixed> $payload
     *
     * @return list<string>
     */
    private static function leaves(array $payload): array
    {
        return array_map(
            static fn (int|string $key): string => (string) $key,
            array_keys(Arr::dot($payload)),
        );
    }

    /**
     * Merge a validated patch into the document already stored.
     *
     * A PATCH, not a PUT: the console's eight panels each save their own
     * section, and a panel that sent only `legal` must not blank the brand
     * colours the panel next to it saved a minute ago. Nested arrays merge one
     * key at a time; a list (`channels`) replaces wholesale, because "these are
     * the channels" is the only thing sending a list can mean.
     *
     * @param array<array-key, mixed>|null $current
     * @param array<array-key, mixed> $patch
     *
     * @return array<array-key, mixed>
     */
    public static function merge(?array $current, array $patch): array
    {
        $result = $current ?? [];

        foreach ($patch as $key => $value) {
            if (is_array($value) && ! array_is_list($value) && is_array($result[$key] ?? null)) {
                /** @var array<array-key, mixed> $existing */
                $existing = $result[$key];
                $result[$key] = self::merge($existing, $value);

                continue;
            }

            $result[$key] = $value;
        }

        return $result;
    }
}
