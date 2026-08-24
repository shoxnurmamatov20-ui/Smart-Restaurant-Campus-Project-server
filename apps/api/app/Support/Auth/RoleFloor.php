<?php

declare(strict_types=1);

namespace App\Support\Auth;

/**
 * What a restaurant may never grant itself, however it edits its own roles.
 *
 * `settings/permissions` lets an owner move a tick across a 23 × 9 grid, and
 * that is the intended product: a restaurant where the cashier also closes the
 * shift is a real restaurant, and the platform should not have an opinion.
 *
 * It has an opinion about a short list. `DesignRoleMatrixTest` calls these
 * negative assertions "the half that matters", and the reason applies twice as
 * hard once a console can write the matrix: a role that is missing a permission
 * fails loudly the first time someone uses it, and a role that has one it should
 * not is silent until it is used to do something nobody meant to allow.
 *
 * The line drawn here is not "dangerous". It is **who checks whom**:
 *
 *  - A waiter asking for a void and a manager granting it is the entire
 *    approval model (P9). A waiter holding `pos.void` is not a permissive
 *    configuration, it is the model switched off — and the cash it protects
 *    walks out of the building one voided line at a time.
 *  - A cashier granting their own approval is the same sentence one post along.
 *  - `tenants.manage` and the platform's own permissions belong to the operator.
 *    An owner is an admin of their business, never of the platform.
 *
 * So these are refused server-side rather than merely hidden in the console.
 * A rule enforced only by the screen that draws it is a rule anybody with curl
 * does not have.
 */
final class RoleFloor
{
    /**
     * Role name => permissions that role may never hold, whoever asks.
     *
     * @var array<string, list<string>>
     */
    private const WITHHELD = [
        // Asking is not granting. This pair is P9's whole point.
        'waiter' => ['pos.void', 'pos.discount', 'pos.refund', 'pos.approve', 'pos.drawer'],
        'cashier' => ['pos.approve'],

        // A desk that can refund over the telephone is a desk that gets talked
        // into refunding over the telephone.
        'order-operator' => ['pos.void', 'pos.refund', 'pos.approve'],
    ];

    /**
     * Permissions no restaurant role may ever hold, whichever role it is.
     *
     * The platform's own powers. Creating tenants, holding another person's
     * session, and reading the platform console are operator work; an owner
     * who could grant themselves `users.impersonate` could sign in as anybody
     * on their tenant and leave a trail saying it was them.
     *
     * @var list<string>
     */
    private const PLATFORM_ONLY = [
        'tenants.manage',
        'users.impersonate',
        'system.backups',
        'system.api-keys',
    ];

    /**
     * Which of the requested permissions this role may not be given.
     *
     * Returns the refusals rather than a boolean so the error can name them —
     * "you may not grant this" is a support ticket, "you may not grant
     * `pos.void` to `waiter`" is an answer.
     *
     * @param list<string> $permissions
     *
     * @return list<string>
     */
    public static function refusals(string $role, array $permissions): array
    {
        // The operator's own role is not configured from a restaurant's console
        // at all — it is refused at the route — so it needs no floor here.
        $withheld = [...(self::WITHHELD[$role] ?? []), ...self::PLATFORM_ONLY];

        return array_values(array_unique(array_intersect($permissions, $withheld)));
    }

    /**
     * Roles a restaurant's own console may edit at all.
     *
     * `super-admin` and `print-agent` are outside it for the same reason from
     * opposite ends: one is the platform, and the other is a machine whose
     * single permission is the entire security argument for it existing.
     *
     * @return list<string>
     */
    public static function editable(): array
    {
        return [
            'owner', 'brand-manager', 'branch-manager', 'chef', 'cook', 'waiter',
            'bartender', 'cashier', 'host', 'order-operator', 'courier',
            'storekeeper', 'accountant', 'marketer',
        ];
    }
}
