<?php

declare(strict_types=1);

namespace App\Support\Auth;

use App\Models\Tenant;
use App\Models\User;

/**
 * One restaurant's edits to the platform's roles, laid over the shared baseline.
 *
 * The console's permissions matrix (`settings/permissions`) lets an owner move
 * a tick, and the obvious implementation — write it through to Spatie — is
 * wrong here in a way that is quiet and total: `config/permission.php` has
 * `teams => false`, so `roles` is ONE table for the whole platform. An owner in
 * Chilonzor tapping "let the cashier close the shift" would have changed it for
 * every restaurant on the product, including the ones that never asked.
 *
 * Turning Spatie's team mode on is the other answer and it is a bigger one: a
 * column on three tables, a resolver on every request, and a re-seed of every
 * role that exists. It is also not obviously right — fifteen roles that mean
 * the same job everywhere are what makes a support conversation possible.
 *
 * So the baseline stays shared and each restaurant keeps a small overlay:
 *
 *     tenants.settings.role_overrides = {
 *         "cashier": { "grant": ["pos.discount"], "deny": ["crm.update"] }
 *     }
 *
 * An overlay is a diff, never a replacement. That matters when the platform
 * adds a permission: a restaurant that had saved a full list would silently
 * withhold the new one from everybody, whereas a diff inherits it.
 *
 * `RoleFloor` still wins over a grant — see that class for why a waiter with
 * `pos.void` is the approval model switched off rather than a configuration.
 */
final class TenantRoleOverlay
{
    private const KEY = 'role_overrides';

    /**
     * How a person's own restaurant answers a permission question, or null to
     * let Spatie's baseline answer it.
     *
     * Called from `User::checkPermissionTo()`, which is the single point every
     * `can()`, `canAny()` and `PermissionMiddleware` goes through. A null here
     * means "no opinion", and no opinion is the answer for every request on a
     * restaurant that has never touched the matrix — which is almost all of
     * them, and why this costs nothing when it is not used.
     */
    public static function verdict(User $user, string $permission): ?bool
    {
        $overrides = self::forTenant($user->tenant);

        if ($overrides === []) {
            return null;
        }

        $granted = false;

        foreach ($user->getRoleNames() as $role) {
            $rule = $overrides[(string) $role] ?? null;

            if (! is_array($rule)) {
                continue;
            }

            /*
             * A denial anywhere wins. Somebody holding two roles is holding the
             * union of them, so "the cashier may not do this" would otherwise be
             * undone by any second role they happen to carry — and the person
             * who wrote the denial would never find out.
             */
            if (in_array($permission, self::list($rule, 'deny'), true)) {
                return false;
            }

            if (in_array($permission, self::list($rule, 'grant'), true)
                && RoleFloor::refusals((string) $role, [$permission]) === []) {
                $granted = true;
            }
        }

        return $granted ? true : null;
    }

    /**
     * The stored overlay for one restaurant, normalised.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function forTenant(?Tenant $tenant): array
    {
        $stored = $tenant?->setting(self::KEY);

        if (! is_array($stored)) {
            return [];
        }

        $clean = [];

        foreach ($stored as $role => $rule) {
            if (is_string($role) && is_array($rule)) {
                $clean[$role] = $rule;
            }
        }

        return $clean;
    }

    /**
     * Record one role's diff against the baseline.
     *
     * Takes the effective list the console wants and turns it into grants and
     * denials, rather than storing the list itself — see the class note for why
     * a stored list rots the day the platform adds a permission.
     *
     * @param list<string> $baseline what the role holds on the shared platform
     * @param list<string> $wanted what this restaurant wants it to hold
     */
    public static function put(Tenant $tenant, string $role, array $baseline, array $wanted): void
    {
        $grant = array_values(array_diff($wanted, $baseline));
        $deny = array_values(array_diff($baseline, $wanted));

        $overrides = self::forTenant($tenant);

        if ($grant === [] && $deny === []) {
            // Back to the baseline: the row goes, rather than being stored as
            // two empty lists nobody can tell from a real edit.
            unset($overrides[$role]);
        } else {
            $overrides[$role] = ['grant' => $grant, 'deny' => $deny];
        }

        $settings = $tenant->settings ?? [];
        $settings[self::KEY] = $overrides;

        $tenant->forceFill(['settings' => $settings])->save();
    }

    /**
     * What a role effectively holds inside one restaurant.
     *
     * @param list<string> $baseline
     *
     * @return list<string>
     */
    public static function effective(?Tenant $tenant, string $role, array $baseline): array
    {
        $rule = self::forTenant($tenant)[$role] ?? null;

        if (! is_array($rule)) {
            return $baseline;
        }

        $effective = array_diff($baseline, self::list($rule, 'deny'));

        foreach (self::list($rule, 'grant') as $permission) {
            if (RoleFloor::refusals($role, [$permission]) === []) {
                $effective[] = $permission;
            }
        }

        sort($effective);

        return array_values(array_unique($effective));
    }

    /**
     * @param array<string, mixed> $rule
     *
     * @return list<string>
     */
    private static function list(array $rule, string $key): array
    {
        $value = $rule[$key] ?? [];

        if (! is_array($value)) {
            return [];
        }

        return array_values(array_filter($value, 'is_string'));
    }
}
