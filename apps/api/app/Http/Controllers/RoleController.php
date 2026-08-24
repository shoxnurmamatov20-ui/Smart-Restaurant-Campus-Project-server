<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Contracts\Pos\DiscountLimits;
use App\Http\Requests\UpdateRoleRequest;
use App\Support\Auth\RoleFloor;
use App\Support\Auth\TenantRoleOverlay;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\DatabaseTenancy;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * The roles matrix behind `settings/permissions`.
 *
 * Reads the platform's fifteen roles and what each one holds, overlaid with
 * this restaurant's own edits — see App\Support\Auth\TenantRoleOverlay for why
 * an edit is a diff stored per tenant rather than a write to Spatie's shared
 * table, which has no team column and would have changed every restaurant on
 * the product at once.
 *
 * Writing is `roles.manage`, which by DesignRoleMatrixTest only the owner and
 * the platform operator hold. That is deliberate and it is the strongest single
 * permission on the platform: it is the one that can grant every other one.
 */
final class RoleController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly DiscountLimits $discountLimits,
        private readonly DatabaseTenancy $database,
    ) {}

    /**
     * Every role a restaurant may configure, and what it holds here.
     *
     * `withheld` rides along rather than being left for the save to discover.
     * The console draws a 23 × 9 grid; a cell the server will always refuse
     * should be drawn as refused, not as an empty tick somebody taps and then
     * gets a 422 for.
     */
    public function index(): JsonResponse
    {
        $tenant = $this->context->tenant();
        $limits = $this->discountLimits->all();

        $roles = [];

        foreach ($this->baseline() as $name => $baseline) {
            if (! in_array($name, RoleFloor::editable(), true)) {
                continue;
            }

            $roles[] = [
                'name' => $name,
                'permissions' => TenantRoleOverlay::effective($tenant, $name, $baseline),
                'baseline' => $baseline,
                'withheld' => RoleFloor::refusals($name, $this->allPermissionNames()),
                // The single source CLAUDE.md asked for. It is null rather than
                // 0 where a role has no row at all: "no ceiling recorded" and
                // "may discount nothing" are different facts, and a console that
                // conflated them would quietly demote every owner to zero.
                'discount_limit_percent' => $limits[$name] ?? null,
            ];
        }

        return response()->json([
            'data' => $roles,
            'meta' => [
                'permissions' => $this->allPermissionNames(),
                'editable' => RoleFloor::editable(),
            ],
        ]);
    }

    /**
     * Change what one role holds inside this restaurant.
     *
     * Two writes, and they are deliberately separate stores: the permission
     * diff goes to the tenant's overlay, and the discount ceiling goes to the
     * tills, because that is where `ApprovalGate` reads it and a second copy is
     * exactly the drift CLAUDE.md described.
     */
    public function update(UpdateRoleRequest $request, string $role): JsonResponse
    {
        $tenant = $this->context->tenant();

        if ($tenant === null) {
            throw ApiException::of('tenant.required');
        }

        if (! in_array($role, RoleFloor::editable(), true)) {
            throw ApiException::detailed(
                'request.validation_failed',
                "'{$role}' rolini restoran o'zgartira olmaydi.",
                "Роль '{$role}' не настраивается рестораном.",
                "The role '{$role}' is not configurable by a restaurant.",
                field: 'role',
            );
        }

        /** @var list<string> $wanted */
        $wanted = $request->validated('permissions', []);

        $refusals = RoleFloor::refusals($role, $wanted);

        if ($refusals !== []) {
            $names = implode(', ', $refusals);

            throw ApiException::detailed(
                'request.validation_failed',
                "Bu ruxsatlar '{$role}' roliga berilmaydi: {$names}.",
                "Эти права нельзя выдать роли '{$role}': {$names}.",
                "These permissions may not be granted to '{$role}': {$names}.",
                field: 'permissions',
                meta: ['withheld' => $refusals],
            );
        }

        $baseline = $this->baseline()[$role] ?? [];

        TenantRoleOverlay::put($tenant, $role, $baseline, $wanted);

        if ($request->has('discount_limit_percent')) {
            $this->discountLimits->set($role, (int) $request->validated('discount_limit_percent'));
        }

        /*
         * The one edit that lets every later edit happen, so it is written down
         * with what changed. `permissions-data.ts` asks for exactly this: "the
         * audit log records who changed which grant".
         */
        activity('identity.role')
            ->causedBy($request->user())
            ->withProperties([
                'role' => $role,
                'granted' => array_values(array_diff($wanted, $baseline)),
                'denied' => array_values(array_diff($baseline, $wanted)),
                'discount_limit_percent' => $request->validated('discount_limit_percent'),
            ])
            ->log('role.updated');

        return $this->index();
    }

    /**
     * What each role holds on the shared platform, before any restaurant's edits.
     *
     * @return array<string, list<string>>
     */
    private function baseline(): array
    {
        /*
         * Roles and permissions belong to the platform, not to a restaurant —
         * `spatie` has no team column here — so the read is deliberately
         * unscoped. Without this a tenant-focused request reads nothing at all
         * and the screen draws fifteen empty rows.
         */
        return $this->database->withoutTenancy(function (): array {
            app(PermissionRegistrar::class)->forgetCachedPermissions();

            $baseline = [];

            foreach (Role::query()->with('permissions')->orderBy('name')->get() as $role) {
                /** @var list<string> $names */
                $names = $role->permissions->pluck('name')->sort()->values()->all();
                $baseline[(string) $role->name] = $names;
            }

            return $baseline;
        });
    }

    /** @return list<string> */
    private function allPermissionNames(): array
    {
        return $this->database->withoutTenancy(
            static fn (): array => Permission::query()->orderBy('name')->pluck('name')->all(),
        );
    }
}
